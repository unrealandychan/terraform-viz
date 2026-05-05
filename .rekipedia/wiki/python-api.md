---
slug: python-api
title: "API Reference"
section: api-reference
tags: [api, reference]
pin: false
importance: 20
created_at: 2026-05-05T06:02:40Z
rekipedia_version: 0.10.3
---

# API Reference

This repository does **not** expose a public Python API. The codebase is TypeScript-only, and the analysis data contains no Python modules, packages, or exported Python symbols to document.

Per the task requirements, this page is intentionally kept as a placeholder rather than inferring any Python functionality from the TypeScript source. There is no public Python surface area to enumerate, no Python symbol table to provide, and no Python usage examples to include.

## Scope and Verification

The repository entry points are TypeScript files such as `apps/web/src/app/api/chat/route.ts`, `services/parser/src/main.ts`, and `packages/graph-schema/src/index.ts`, all of which are outside the Python ecosystem. The available symbols are TypeScript interfaces, functions, React components, and service entry points; none are Python modules or Python-callable exports.

The observed public-facing code includes:

- TypeScript service entry points like [`services/parser/src/main.ts`](services/parser/src/main.ts) and [`services/pricing/src/main.ts`](services/pricing/src/main.ts)
- Shared schema packages like [`packages/graph-schema/src/index.ts`](packages/graph-schema/src/index.ts)
- Web API handlers such as [`POST`](apps/web/src/app/api/run/route.ts#L12) and [`GET`](apps/web/src/app/api/health/route.ts#L3)

However, these are TypeScript internals, not Python API exports, so they are explicitly out of scope for this page.

> **Sources:** `apps/terraform-worker/src/main.ts` · `packages/graph-schema/src/index.ts` · `packages/llm-types/src/index.ts` · `packages/pricing-engine/src/index.ts` · `packages/pricing-types/src/index.ts` · `services/comparison/src/main.ts` · `services/llm/src/main.ts` · `services/parser/src/main.ts` · `services/pricing/src/main.ts`

## Public API Surface

No public Python API surface exists in this repository.

If a Python package is introduced in the future, this section should be expanded to include:

- exported modules
- public classes
- public functions
- import examples
- minimal usage snippets

At present, there is nothing to list here without fabricating functionality that is not present in the codebase.

> **Sources:** `apps/terraform-worker/src/main.ts` · `packages/graph-schema/src/index.ts` · `packages/llm-types/src/index.ts` · `packages/pricing-engine/src/index.ts` · `packages/pricing-types/src/index.ts` · `services/comparison/src/main.ts` · `services/llm/src/main.ts` · `services/parser/src/main.ts` · `services/pricing/src/main.ts`

## Placeholder Status

This page exists only as an explicit placeholder to clarify that:

1. no Python public API is exported,
2. no Python package structure is present,
3. no Python reference documentation should be inferred from TypeScript code.

If you are looking for the actual documented interfaces in this repository, the relevant reference material would belong to the TypeScript packages and services instead.

> **Sources:** `packages/graph-schema/src/index.ts` · `packages/llm-types/src/index.ts` · `packages/pricing-engine/src/index.ts` · `packages/pricing-types/src/index.ts` · `services/parser/src/main.ts` · `services/pricing/src/main.ts`
