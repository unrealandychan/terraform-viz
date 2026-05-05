---
slug: technical-debt
title: "Repository Risks and Maintenance Debt"
section: development
tags: [development, contributing, internals]
pin: false
importance: 70
created_at: 2026-05-05T06:02:58Z
rekipedia_version: 0.10.3
---

# Repository Risks and Maintenance Debt

This page summarizes the most visible maintenance debt and risk areas in the repository, with a conservative, evidence-driven focus on TODO/FIXME-style issues, missing tests, risky dependencies, duplicated logic, and brittle state/storage handling.

The analysis data does not explicitly surface any `TODO`, `FIXME`, or `XXX` markers, so the observations below are inferred from module structure, repeated patterns, and the current test coverage footprint. Where a concern is inferred rather than directly asserted in code, it is labeled accordingly.

## High-Level Summary

The repository is reasonably well-factored into frontend app code, shared packages, and backend services, but there are a few recurring maintenance signals:

- **State persistence is spread across several independent stores and helpers**, especially in the web app around local/session storage, plan history, usage overrides, and theme preference.
- **Theme handling appears duplicated across UI layers**, with both `ThemeProvider`-level APIs and UI-level toggle components.
- **There are service boundaries that are thin enough to create coupling pressure**, especially where the web app proxies to API routes and backend services with overlapping responsibilities.
- **Test coverage exists for several core utility modules**, but important boundary conditions are only partially evidenced by the available test files.
- **External dependencies and runtime-specific behavior** introduce risk in the web app and microservices, particularly around `openai`, `express`, browser storage, and D3 interactions.

> **Sources:** `apps/web/src/lib/plan-store.ts` · `apps/web/src/lib/theme-store.ts` · `apps/web/src/components/layout/ThemeProvider.tsx` · `apps/web/src/components/ui/ThemeToggle.tsx` · `apps/web/src/components/layout/ThemeToggle.tsx` · `services/llm/src/main.ts` · `services/comparison/src/main.ts`

## TODO/FIXME-Style Issues

### Explicit markers

No explicit TODO/FIXME markers are exposed in the provided analysis payload. That means there is no direct evidence of outstanding marker-based debt such as unfinished code paths, temporary bypasses, or flagged refactors.

### Conservative inference from code structure

Even without explicit markers, some areas look like they could accumulate “hidden TODO debt” over time:

- The UI has multiple stateful surfaces that rely on browser storage and shared helpers, which often leads to “just one more edge case” fixes accumulating in place.
- The graph page imports many features at once, which can make future cleanup or modularization harder to stage.
- The theme system is split between provider/state management and multiple toggle components, which often indicates copy/paste or drift risk rather than a single canonical implementation.

These are maintenance signals, not confirmed defects.

> **Sources:** `apps/web/src/app/graph/page.tsx` · `apps/web/src/components/layout/ThemeProvider.tsx` · `apps/web/src/components/ui/ThemeToggle.tsx` · `apps/web/src/components/layout/ThemeToggle.tsx`

## Missing Tests and Coverage Gaps

### What is covered

There is visible test coverage for several important utility modules:

- plan storage and quota helpers: [`plan-store.test.ts`](apps/web/src/__tests__/plan-store.test.ts)
- plan URL encoding/decoding: [`plan-url.test.ts`](apps/web/src/__tests__/plan-url.test.ts)
- plan diffing: [`plan-diff.test.ts`](apps/web/src/__tests__/plan-diff.test.ts)
- theme persistence: [`theme-store.test.ts`](apps/web/src/__tests__/theme-store.test.ts)
- graph filtering behavior: [`GraphFilterBar.test.tsx`](apps/web/src/__tests__/GraphFilterBar.test.tsx)
- pricing engine and LLM rule logic in backend services: [`pricing.test.ts`](services/pricing/src/__tests__/pricing.test.ts), [`rules.test.ts`](services/llm/src/__tests__/rules.test.ts), [`parse-plan.test.ts`](services/parser/src/__tests__/parse-plan.test.ts), [`diff.test.ts`](services/comparison/src/__tests__/diff.test.ts)

### Likely gaps

The test footprint is strongest around pure functions and lightweight store helpers, but weaker around the UI/service seams where failures are most likely to be user-visible:

- **API route behavior** is not represented in the test list for [`POST`](apps/web/src/app/api/chat/route.ts), [`POST`](apps/web/src/app/api/parse/route.ts), or [`POST`](apps/web/src/app/api/run/route.ts).
- **Cross-module flows** such as upload → parse → graph render → storage persistence are not obviously covered end-to-end.
- **Interactive components** like [`TwoDGraph`](apps/web/src/components/graph/TwoDGraph.tsx), [`GraphToolbar`](apps/web/src/components/graph/GraphToolbar.tsx), [`NodeDetail`](apps/web/src/components/graph/NodeDetail.tsx), and [`ChatPanel`](apps/web/src/components/chat/ChatPanel.tsx) are relatively complex but not present in the test list.
- **Error handling and quota edge cases** in [`savePlan`](apps/web/src/lib/plan-store.ts), [`saveToHistory`](apps/web/src/lib/plan-store.ts), and [`StorageWarningBanner`](apps/web/src/components/ui/StorageWarningBanner.tsx) deserve explicit tests if they are not already present elsewhere.

### Risk impact

The main risk is regression in “glue” code: the code that moves data between browser storage, graph state, and backend services. These bugs are often harder to detect than pure logic failures because they depend on environment, timing, and storage state.

> **Sources:** `apps/web/src/__tests__/GraphFilterBar.test.tsx` · `apps/web/src/__tests__/plan-diff.test.ts` · `apps/web/src/__tests__/plan-store.test.ts` · `apps/web/src/__tests__/plan-url.test.ts` · `apps/web/src/__tests__/pricing-estimates.test.ts` · `apps/web/src/__tests__/theme-store.test.ts` · `services/comparison/src/__tests__/diff.test.ts` · `services/llm/src/__tests__/rules.test.ts` · `services/parser/src/__tests__/parse-plan.test.ts` · `services/pricing/src/__tests__/pricing.test.ts`

## Risky Dependencies and Runtime Coupling

### External and environment-specific dependencies

Several modules depend on libraries or runtime facilities that are inherently riskier than pure TypeScript logic:

- `express` in backend entry points like [`services/llm/src/main.ts`](services/llm/src/main.ts), [`services/parser/src/main.ts`](services/parser/src/main.ts), [`services/comparison/src/main.ts`](services/comparison/src/main.ts), and [`services/pricing/src/main.ts`](services/pricing/src/main.ts)
- `openai` in [`buildClient`](services/llm/src/main.ts)
- `d3-selection` and `d3-zoom` in [`TwoDGraph`](apps/web/src/components/graph/TwoDGraph.tsx)
- browser storage APIs in [`plan-store`](apps/web/src/lib/plan-store.ts), [`baseline-store`](apps/web/src/lib/baseline-store.ts), and [`theme-store`](apps/web/src/lib/theme-store.ts)

These dependencies are not necessarily problematic, but they raise the maintenance cost of testing, mocking, and debugging.

### Thin service boundaries

A few call paths show a relatively thin façade over lower-level services:

- [`parsePlan`](apps/web/src/lib/server-api.ts) and [`runPlan`](apps/web/src/lib/server-api.ts) are network wrappers around backend endpoints.
- [`fetchWithTimeout`](services/comparison/src/main.ts) and the similarly named helper in [`apps/web/src/lib/server-api.ts`](apps/web/src/lib/server-api.ts) indicate duplicated transport concerns.
- The web app’s graph page imports many feature modules directly, which can blur ownership lines between view orchestration and state management.

### Likely impact

The risk here is not immediate correctness failure; it is **operational fragility**. Changes in upstream APIs, browser/runtime behavior, or client/server response shapes can break these code paths with limited compiler help.

> **Sources:** `services/llm/src/main.ts` · `services/parser/src/main.ts` · `services/comparison/src/main.ts` · `services/pricing/src/main.ts` · `apps/web/src/lib/server-api.ts` · `apps/web/src/lib/plan-store.ts` · `apps/web/src/lib/theme-store.ts` · `apps/web/src/components/graph/TwoDGraph.tsx`

## Duplicated Logic and Drift Risk

### Theme toggling appears duplicated

There are two theme toggle components:

- [`ThemeToggle`](apps/web/src/components/layout/ThemeToggle.tsx)
- [`ThemeToggle`](apps/web/src/components/ui/ThemeToggle.tsx)

In addition, theme state lives in both [`ThemeProvider`](apps/web/src/components/layout/ThemeProvider.tsx) and [`theme-store`](apps/web/src/lib/theme-store.ts). This is a classic drift risk: if the UI toggle behavior changes in one place and not the other, the app can accumulate subtle inconsistencies in state application or persistence.

### Storage and persistence patterns recur

Persistence concerns are implemented in several separate helpers:

- [`savePlan`](apps/web/src/lib/plan-store.ts), [`loadPlan`](apps/web/src/lib/plan-store.ts), [`clearPlan`](apps/web/src/lib/plan-store.ts)
- [`saveBaseline`](apps/web/src/lib/baseline-store.ts), [`loadBaseline`](apps/web/src/lib/baseline-store.ts), [`clearBaseline`](apps/web/src/lib/baseline-store.ts)
- [`loadUsageOverrides`](apps/web/src/lib/usage-utils.ts), [`saveUsageOverride`](apps/web/src/lib/usage-utils.ts), [`resetUsageOverride`](apps/web/src/lib/usage-utils.ts)
- [`getStoredTheme`](apps/web/src/lib/theme-store.ts), [`applyTheme`](apps/web/src/lib/theme-store.ts), [`toggleTheme`](apps/web/src/lib/theme-store.ts)

The duplication is not necessarily a defect, but it does increase the likelihood of slightly different error handling or serialization conventions over time.

### Recommendation

Where practical, consolidate repeated “store + serialize + validate + fallback” flows behind a small shared utility or consistent adapter layer.

> **Sources:** `apps/web/src/components/layout/ThemeToggle.tsx` · `apps/web/src/components/ui/ThemeToggle.tsx` · `apps/web/src/components/layout/ThemeProvider.tsx` · `apps/web/src/lib/theme-store.ts` · `apps/web/src/lib/plan-store.ts` · `apps/web/src/lib/baseline-store.ts` · `apps/web/src/lib/usage-utils.ts`

## Brittle State and Storage Handling

### Local storage quota handling is an explicit risk surface

The presence of [`StorageQuotaError`](apps/web/src/lib/plan-store.ts) plus helpers like [`estimateLocalStorageUsage`](apps/web/src/lib/plan-store.ts), [`isApproachingQuota`](apps/web/src/lib/plan-store.ts), and [`isAtQuota`](apps/web/src/lib/plan-store.ts) is a strong sign that persistence limits are a known concern.

That is good from a product standpoint, but it also means the behavior is brittle by nature:

- data size can vary significantly by Terraform plan complexity
- quota behavior differs across browsers and environments
- failures may occur only after substantial user interaction

The presence of [`StorageWarningBanner`](apps/web/src/components/ui/StorageWarningBanner.tsx) suggests the UI already acknowledges this operational risk.

### History and baseline state can diverge

The plan and baseline flows are stored separately:

- current plan storage in [`plan-store`](apps/web/src/lib/plan-store.ts)
- baseline storage in [`baseline-store`](apps/web/src/lib/baseline-store.ts)
- historical snapshots via [`saveToHistory`](apps/web/src/lib/plan-store.ts) and [`loadHistory`](apps/web/src/lib/plan-store.ts)

This separation is understandable, but it creates opportunities for drift: baseline selection, history restoration, and current model state can get out of sync unless all write paths are carefully coordinated.

### Usage overrides add another mutable layer

The graph UI can apply per-node usage overrides through [`loadUsageOverrides`](apps/web/src/lib/usage-utils.ts), [`saveUsageOverride`](apps/web/src/lib/usage-utils.ts), and [`applyUsageOverrides`](apps/web/src/lib/usage-utils.ts), with the same data also consumed by [`NodeDetail`](apps/web/src/components/graph/NodeDetail.tsx) and [`UsageEditor`](apps/web/src/components/graph/UsageEditor.tsx).

This is a feature-rich pattern, but it is fragile if the underlying attributes change shape or if reset behavior is not consistently applied across all entry points.

> **Sources:** `apps/web/src/lib/plan-store.ts` · `apps/web/src/components/ui/StorageWarningBanner.tsx` · `apps/web/src/lib/baseline-store.ts` · `apps/web/src/lib/usage-utils.ts` · `apps/web/src/components/graph/NodeDetail.tsx` · `apps/web/src/components/graph/UsageEditor.tsx`

## Issue Table

| Issue                                                  | Evidence                                                                                                                                                                                                                                              | Impact                                                                      | Recommended Action                                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| No explicit TODO/FIXME markers surfaced                | No TODO/FIXME symbols or files were present in the provided analysis data                                                                                                                                                                             | Hard to track unfinished work; debt may remain implicit rather than visible | Add explicit markers for known follow-ups and avoid leaving “temporary” fixes undocumented                              |
| Storage quota handling is fragile by nature            | [`StorageQuotaError`](apps/web/src/lib/plan-store.ts), [`estimateLocalStorageUsage`](apps/web/src/lib/plan-store.ts), [`isApproachingQuota`](apps/web/src/lib/plan-store.ts), [`isAtQuota`](apps/web/src/lib/plan-store.ts)                           | Persistence may fail only on large plans or specific browsers               | Add targeted tests for quota thresholds and recovery behavior; consider fallback storage or clearer user recovery flows |
| Theme toggle logic is duplicated                       | [`ThemeToggle`](apps/web/src/components/layout/ThemeToggle.tsx), [`ThemeToggle`](apps/web/src/components/ui/ThemeToggle.tsx), [`ThemeProvider`](apps/web/src/components/layout/ThemeProvider.tsx), [`theme-store`](apps/web/src/lib/theme-store.ts)   | UI behavior can drift between components                                    | Consolidate into one canonical toggle path and one source of truth for persistence                                      |
| Store/persistence helpers are fragmented               | [`plan-store`](apps/web/src/lib/plan-store.ts), [`baseline-store`](apps/web/src/lib/baseline-store.ts), [`usage-utils`](apps/web/src/lib/usage-utils.ts), [`theme-store`](apps/web/src/lib/theme-store.ts)                                            | Inconsistent serialization/error handling over time                         | Introduce a common storage adapter or shared serialization patterns                                                     |
| API route and service seams are thin                   | [`POST`](apps/web/src/app/api/parse/route.ts), [`POST`](apps/web/src/app/api/run/route.ts), [`parsePlan`](apps/web/src/lib/server-api.ts), [`runPlan`](apps/web/src/lib/server-api.ts)                                                                | Boundary regressions may escape unit tests                                  | Add integration tests around request/response handling and error mapping                                                |
| Interactive graph UI has limited visible test coverage | [`TwoDGraph`](apps/web/src/components/graph/TwoDGraph.tsx), [`GraphToolbar`](apps/web/src/components/graph/GraphToolbar.tsx), [`NodeDetail`](apps/web/src/components/graph/NodeDetail.tsx), [`ChatPanel`](apps/web/src/components/chat/ChatPanel.tsx) | UI regressions in selection, layout, and editing workflows                  | Add component-level tests and at least one end-to-end interaction test                                                  |
| Runtime dependency risk in services                    | `express`, `openai`, `d3-selection`, `d3-zoom` in service and UI entry points                                                                                                                                                                         | Version and environment changes can cause failures                          | Pin versions carefully, mock external APIs in tests, and isolate library-specific code                                  |

> **Sources:** `apps/web/src/lib/plan-store.ts` · `apps/web/src/components/layout/ThemeToggle.tsx` · `apps/web/src/components/ui/ThemeToggle.tsx` · `apps/web/src/components/layout/ThemeProvider.tsx` · `apps/web/src/lib/theme-store.ts` · `apps/web/src/app/api/parse/route.ts` · `apps/web/src/app/api/run/route.ts` · `apps/web/src/lib/server-api.ts` · `apps/web/src/components/graph/TwoDGraph.tsx` · `apps/web/src/components/graph/GraphToolbar.tsx` · `apps/web/src/components/graph/NodeDetail.tsx` · `apps/web/src/components/chat/ChatPanel.tsx`
