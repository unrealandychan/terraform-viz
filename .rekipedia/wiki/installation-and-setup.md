---
slug: installation-and-setup
title: "Getting Started: Local Installation and Run Guide"
section: getting-started
tags: [getting-started, configuration]
pin: false
importance: 72
created_at: 2026-05-05T06:02:14Z
rekipedia_version: 0.10.3
---

# Getting Started: Local Installation and Run Guide

This page explains the minimum steps required to install the repository locally, configure environment variables, and launch the web application plus its supporting services. It focuses on practical startup tasks only, not the internal architecture of the system.

## Prerequisites

To run the repo locally, you need a recent Node.js toolchain and a package manager capable of installing the monorepo dependencies. The analysis data does not include a lockfile or package-manager manifest, so the exact package manager command may depend on the repository root configuration. In practice, check the root `package.json`/workspace config and use the package manager specified there.

### Required local tools

| Tool            | Purpose                                | Notes                                                  |
| --------------- | -------------------------------------- | ------------------------------------------------------ |
| Node.js         | Runs the web app and service processes | Use an LTS release unless the repo specifies otherwise |
| Package manager | Installs workspace dependencies        | Common options are `npm`, `pnpm`, or `yarn`            |
| Git             | Clones the repository                  | Needed for a clean local checkout                      |
| Browser         | Accesses the Next.js UI                | Use a modern Chromium- or Firefox-based browser        |

### Optional tools

Some parts of the repo appear to support browser-local state and desktop integration. For example, the web app contains Tauri bridge helpers such as [`parsePlan`](apps/web/src/lib/tauri-bridge.ts#L20), [`openPlanFile`](apps/web/src/lib/tauri-bridge.ts#L40), and [`estimateCosts`](apps/web/src/lib/tauri-bridge.ts#L54), but you do not need Tauri to start the web app itself.

> **Sources:** `apps/web/src/lib/tauri-bridge.ts` · L11–L60 · [`isTauri`](apps/web/src/lib/tauri-bridge.ts#L11), [`parsePlan`](apps/web/src/lib/tauri-bridge.ts#L20), [`openPlanFile`](apps/web/src/lib/tauri-bridge.ts#L40), [`estimateCosts`](apps/web/src/lib/tauri-bridge.ts#L54)

## Install dependencies

The repository is a multi-package workspace with a Next.js web app under `apps/web` and several services under `services/` and `packages/`. The minimal install step is to install dependencies from the repository root so all workspace packages are available.

### Typical install flow

```bash
git clone <repo-url>
cd <repo-directory>
# Use the package manager declared by the repo
npm install
# or: pnpm install
# or: yarn install
```

If the workspace uses a lockfile, prefer the matching package manager to avoid dependency drift.

### What gets installed

The web app depends on shared packages such as [`packages/graph-schema/src/index.ts`](packages/graph-schema/src/index.ts), [`packages/llm-types/src/index.ts`](packages/llm-types/src/index.ts), [`packages/pricing-engine/src/index.ts`](packages/pricing-engine/src/index.ts), and [`packages/pricing-types/src/index.ts`](packages/pricing-types/src/index.ts). Supporting services live under `services/parser`, `services/llm`, `services/comparison`, and `services/pricing`.

> **Sources:** `packages/graph-schema/src/index.ts` · L1–L42 · [`GraphModel`](packages/graph-schema/src/index.ts#L42); `packages/llm-types/src/index.ts` · L1–L31 · [`RecommendationResult`](packages/llm-types/src/index.ts#L31); `packages/pricing-engine/src/index.ts` · L1–L?; `packages/pricing-types/src/index.ts` · L1–L26 · [`PricingResult`](packages/pricing-types/src/index.ts#L26)

## Environment variables

The analysis data does not expose a complete `.env.example`, so this section stays conservative and only documents what can be inferred from the runtime entrypoints and routes. The web app exposes API routes like [`GET`](apps/web/src/app/api/health/route.ts#L3), [`POST`](apps/web/src/app/api/run/route.ts#L12), and parse/chat endpoints in `apps/web/src/app/api/`.

### Variables you should check before startup

| Variable              | Likely use                                       | Where to verify                                                                                               |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_*` vars  | Client-side configuration exposed to the browser | Search `apps/web/src` and `next.config.ts`                                                                    |
| API/service base URLs | Let the web app call local services              | Search `apps/web/src/lib/server-api.ts` and route handlers                                                    |
| LLM-related settings  | Configure chat/recommendation features           | Inspect [`loadSettings`](apps/web/src/components/settings/LlmSettings.tsx#L24) and `services/llm/src/main.ts` |
| Storage-related flags | Affect browser persistence warnings              | Inspect [`StorageWarningBanner`](apps/web/src/components/ui/StorageWarningBanner.tsx#L5) and store helpers    |

The settings UI includes [`LlmSettings`](apps/web/src/components/settings/LlmSettings.tsx#L7) and [`ThemeSettings`](apps/web/src/components/settings/ThemeSettings.tsx#L5), which suggests runtime configuration is partially user-editable in the browser as well as via environment variables.

### Recommended startup check

Before launching, verify the environment files and service URLs expected by:

- [`runPlan`](apps/web/src/lib/server-api.ts#L56)
- [`parsePlan`](apps/web/src/lib/tauri-bridge.ts#L20)
- the API routes under `apps/web/src/app/api/`
- the service entrypoints in `services/parser/src/main.ts`, `services/llm/src/main.ts`, `services/comparison/src/main.ts`, and `services/pricing/src/main.ts`

> **Sources:** `apps/web/src/components/settings/LlmSettings.tsx` · L1–L24 · [`loadSettings`](apps/web/src/components/settings/LlmSettings.tsx#L24); `apps/web/src/lib/server-api.ts` · L56–L? · [`runPlan`](apps/web/src/lib/server-api.ts#L56); `services/llm/src/main.ts` · L23–L44 · [`buildClient`](services/llm/src/main.ts#L23), [`callLlm`](services/llm/src/main.ts#L28)

## Minimal commands to launch locally

The repo contains a Next.js web app plus supporting Node services. The smallest useful local startup typically looks like: install dependencies, start the required backend services, then start the web app.

### Build/run command table

| Command                                         | Purpose                               | When to use                                   |
| ----------------------------------------------- | ------------------------------------- | --------------------------------------------- |
| `npm install` / `pnpm install` / `yarn install` | Install workspace dependencies        | First setup and after dependency updates      |
| `npm run dev` / equivalent                      | Start the web app in development mode | Primary way to run the UI locally             |
| `npm run dev --workspace=services/parser`       | Start parser service locally          | When the web app needs local parsing          |
| `npm run dev --workspace=services/llm`          | Start LLM service locally             | When chat/recommendation features are enabled |
| `npm run dev --workspace=services/comparison`   | Start comparison service locally      | For diff/compare features                     |
| `npm run dev --workspace=services/pricing`      | Start pricing service locally         | For cost estimation features                  |
| `npm run dev --workspace=apps/terraform-worker` | Start Terraform worker                | When Terraform execution is needed            |
| `npm test` / `vitest`                           | Run tests before or after startup     | Sanity-check the environment                  |

Because build commands were not provided in the analysis payload, treat the exact script names above as workspace patterns to adapt to the repo’s actual root scripts.

### Practical startup order

1. Install dependencies.
2. Start any required backend services:
   - parser: [`parsePlanUseCase`](services/parser/src/application/parse-plan.use-case.ts#L19)
   - LLM: [`callLlm`](services/llm/src/main.ts#L28)
   - comparison: [`estimateViaPricingService`](services/comparison/src/main.ts#L32)
   - pricing: [`estimateNode`](services/pricing/src/main.ts#L20)
3. Start the web app.
4. Open the browser to the local Next.js URL.

### Minimal development workflow

```bash
# 1) install
pnpm install

# 2) start backend services in separate terminals
pnpm dev --filter parser
pnpm dev --filter llm
pnpm dev --filter comparison
pnpm dev --filter pricing

# 3) start the web app
pnpm dev --filter web
```

If the repo uses another package manager or filter syntax, map these commands to the workspace names shown in the file layout.

> **Sources:** `services/parser/src/main.ts` · L1–L?; `services/llm/src/main.ts` · L23–L44 · [`callLlm`](services/llm/src/main.ts#L28); `services/comparison/src/main.ts` · L8–L32 · [`estimateViaPricingService`](services/comparison/src/main.ts#L32); `services/pricing/src/main.ts` · L20–L? · [`estimateNode`](services/pricing/src/main.ts#L20)

## Web app startup notes

The main UI lives in the Next.js app under `apps/web/src/app/`. Relevant entry pages include [`RootPage`](apps/web/src/app/page.tsx#L3), [`UploadPage`](apps/web/src/app/upload/page.tsx#L3), [`GraphPage`](apps/web/src/app/graph/page.tsx#L32), and [`SettingsPage`](apps/web/src/app/settings/page.tsx#L4). The shell is assembled by [`RootLayout`](apps/web/src/app/layout.tsx#L11) and layout components such as [`ClientShell`](apps/web/src/components/layout/ClientShell.tsx#L14) and [`Sidebar`](apps/web/src/components/layout/Sidebar.tsx#L107).

For local startup, the important point is that the app can run as a standard web interface once its dependent services and browser storage are available. No database setup is visible in the analysis data.

> **Sources:** `apps/web/src/app/layout.tsx` · L11–L? · [`RootLayout`](apps/web/src/app/layout.tsx#L11); `apps/web/src/app/page.tsx` · L3–L? · [`RootPage`](apps/web/src/app/page.tsx#L3); `apps/web/src/app/upload/page.tsx` · L3–L? · [`UploadPage`](apps/web/src/app/upload/page.tsx#L3); `apps/web/src/app/graph/page.tsx` · L32–L? · [`GraphPage`](apps/web/src/app/graph/page.tsx#L32)

## Supporting services

The services directory contains standalone entrypoints that you may need to run alongside the web app, depending on which features you use.

| Service          | Entry point                                                              | Purpose                                        |
| ---------------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| Parser           | [`services/parser/src/main.ts`](services/parser/src/main.ts)             | Parses Terraform plans and builds graph models |
| LLM              | [`services/llm/src/main.ts`](services/llm/src/main.ts)                   | Generates recommendations and chat responses   |
| Comparison       | [`services/comparison/src/main.ts`](services/comparison/src/main.ts)     | Provides diff / fallback comparison logic      |
| Pricing          | [`services/pricing/src/main.ts`](services/pricing/src/main.ts)           | Estimates costs for resources                  |
| Terraform worker | [`apps/terraform-worker/src/main.ts`](apps/terraform-worker/src/main.ts) | Worker process for Terraform-related tasks     |

The parser service includes a route layer at [`parser.routes.ts`](services/parser/src/infrastructure/http/parser.routes.ts), and the application flow centers around [`parsePlanUseCase`](services/parser/src/application/parse-plan.use-case.ts#L19) and graph-building helpers such as [`buildGraphModel`](services/parser/src/domain/plan-parser.ts#L79). Those details matter mostly because the web app’s upload/parse flow depends on the service being reachable.

> **Sources:** `services/parser/src/main.ts` · L1–L? · [`parsePlanUseCase`](services/parser/src/application/parse-plan.use-case.ts#L19), [`buildGraphModel`](services/parser/src/domain/plan-parser.ts#L79); `services/llm/src/main.ts` · L23–L44 · [`buildClient`](services/llm/src/main.ts#L23), [`callLlm`](services/llm/src/main.ts#L28); `services/comparison/src/main.ts` · L8–L32 · [`fetchWithTimeout`](services/comparison/src/main.ts#L8); `services/pricing/src/main.ts` · L20–L? · [`estimateNode`](services/pricing/src/main.ts#L20); `apps/terraform-worker/src/main.ts` · L1–L17 · [`RunRequest`](apps/terraform-worker/src/main.ts#L17)

## Troubleshooting startup failures

### Port already in use

If the web app or a service fails immediately with an address-in-use error, another process is already bound to the port. Stop the conflicting process or change the port in that service’s startup configuration.

### API route returns 404 or 502

A 404 or 502 from routes like [`POST`](apps/web/src/app/api/run/route.ts#L12) or [`GET`](apps/web/src/app/api/health/route.ts#L3) usually means the backend service is not running or the web app is pointing at the wrong service URL. Check the local environment variables and ensure the service processes are started first.

### Upload or parse fails

If Terraform plan parsing fails, verify the parser service is running and that the input is a valid Terraform plan. Parsing and graph creation are handled by [`parsePlanUseCase`](services/parser/src/application/parse-plan.use-case.ts#L19), [`flattenResources`](services/parser/src/domain/plan-parser.ts#L11), and [`buildGraphModel`](services/parser/src/domain/plan-parser.ts#L79).

### Chat or recommendation features do not work

If the chat panel or recommendation features fail to load, check the LLM service and its settings. The UI reads settings through [`loadSettings`](apps/web/src/components/settings/LlmSettings.tsx#L24), and the LLM service constructs requests with [`buildClient`](services/llm/src/main.ts#L23) and [`callLlm`](services/llm/src/main.ts#L28).

### Cost estimates are empty or unavailable

If the pricing view is blank, start the pricing service and confirm the estimator is reachable. The relevant implementation pieces are [`estimateCost`](packages/pricing-engine/src/estimator.ts#L6), [`totalMonthlyCost`](packages/pricing-engine/src/estimator.ts#L18), and the service entrypoint [`estimateNode`](services/pricing/src/main.ts#L20).

### Browser storage warnings

The web app stores plans, baselines, and theme preferences in browser storage. If you see storage warnings, the local browser storage may be unavailable or full. Relevant helpers include [`savePlan`](apps/web/src/lib/plan-store.ts#L39), [`saveBaseline`](apps/web/src/lib/baseline-store.ts#L12), and [`getStoredTheme`](apps/web/src/lib/theme-store.ts#L4).

> **Sources:** `apps/web/src/app/api/health/route.ts` · L3–L? · [`GET`](apps/web/src/app/api/health/route.ts#L3); `apps/web/src/app/api/run/route.ts` · L12–L? · [`POST`](apps/web/src/app/api/run/route.ts#L12); `services/parser/src/application/parse-plan.use-case.ts` · L9–L19 · [`isTerraformPlan`](services/parser/src/application/parse-plan.use-case.ts#L9), [`parsePlanUseCase`](services/parser/src/application/parse-plan.use-case.ts#L19); `services/llm/src/main.ts` · L23–L44 · [`buildClient`](services/llm/src/main.ts#L23), [`callLlm`](services/llm/src/main.ts#L28); `packages/pricing-engine/src/estimator.ts` · L6–L26 · [`estimateCost`](packages/pricing-engine/src/estimator.ts#L6), [`totalMonthlyCost`](packages/pricing-engine/src/estimator.ts#L18)

## Quick verification checklist

After startup, confirm:

- the web app loads in the browser
- the health route responds
- upload/parse can reach the parser service
- chat features can reach the LLM service if enabled
- pricing/cost views load if you started the pricing service
- browser storage works for plans, baselines, and theme settings

A minimal “is it up?” sequence is to open the home page, then hit the health endpoint exposed by [`GET`](apps/web/src/app/api/health/route.ts#L3). If that succeeds, proceed with plan upload and graph viewing.

> **Sources:** `apps/web/src/app/api/health/route.ts` · L3–L? · [`GET`](apps/web/src/app/api/health/route.ts#L3); `apps/web/src/lib/plan-store.ts` · L39–L99 · [`savePlan`](apps/web/src/lib/plan-store.ts#L39), [`loadPlan`](apps/web/src/lib/plan-store.ts#L54), [`saveToHistory`](apps/web/src/lib/plan-store.ts#L70)
