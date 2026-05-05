---
slug: testing
title: "Testing Strategy and Running Tests"
section: development
tags: [testing, contributing]
pin: false
importance: 66
created_at: 2026-05-05T06:02:59Z
rekipedia_version: 0.10.3
---

# Testing Strategy and Running Tests

## Overview

This repository’s test coverage is concentrated around a small number of focused unit suites rather than broad end-to-end coverage. The visible test files are clustered in `apps/web/src/__tests__`, `services/comparison/src/__tests__`, `services/llm/src/__tests__`, `services/parser/src/__tests__`, and `services/pricing/src/__tests__`. That shape suggests a strategy of verifying core data transformations, browser-storage utilities, deterministic rule logic, and pricing calculations independently, instead of relying on large integration tests.

The analysis data does not expose a preconfigured test command, so the safest conclusion is that tests are run via the repo’s standard TypeScript test runner configuration in [`vitest.config.ts`](vitest.config.ts). Since no command payload was provided, the exact invocation should be discovered from the project scripts, but the suite layout clearly indicates Vitest-based unit testing.

> **Sources:** `vitest.config.ts` · `apps/web/src/__tests__/GraphFilterBar.test.tsx` · `apps/web/src/__tests__/plan-diff.test.ts` · `apps/web/src/__tests__/plan-store.test.ts` · `apps/web/src/__tests__/plan-url.test.ts` · `apps/web/src/__tests__/pricing-estimates.test.ts` · `apps/web/src/__tests__/theme-store.test.ts` · `services/comparison/src/__tests__/diff.test.ts` · `services/llm/src/__tests__/rules.test.ts` · `services/parser/src/__tests__/parse-plan.test.ts` · `services/pricing/src/__tests__/pricing.test.ts`

## Test Layout

The test repository shape is intentionally modular and mirrors the code under test:

| Area                   | Test file(s)                                                                                                                                                        | Primary focus                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Web UI graph utilities | `apps/web/src/__tests__/GraphFilterBar.test.tsx`, `plan-diff.test.ts`, `plan-store.test.ts`, `plan-url.test.ts`, `pricing-estimates.test.ts`, `theme-store.test.ts` | Filtering, diffing, persistence, URL encoding, pricing estimates, and theme storage |
| Comparison service     | `services/comparison/src/__tests__/diff.test.ts`                                                                                                                    | Model diffing logic                                                                 |
| LLM service            | `services/llm/src/__tests__/rules.test.ts`                                                                                                                          | Deterministic recommendation rules                                                  |
| Parser service         | `services/parser/src/__tests__/parse-plan.test.ts`                                                                                                                  | Terraform plan parsing and graph model construction                                 |
| Pricing service        | `services/pricing/src/__tests__/pricing.test.ts`                                                                                                                    | Cost estimation and lookup behavior                                                 |

This layout is a strong indicator that tests are organized by domain boundary rather than by runtime entrypoint. For example, `apps/web` tests exercise store and helper modules such as [`plan-diff`](apps/web/src/lib/plan-diff.ts#L29) and [`plan-store`](apps/web/src/lib/plan-store.ts#L39), while service tests verify the pure logic in [`diffModels`](services/comparison/src/__tests__/diff.test.ts#L30), [`runDeterministicRules`](services/llm/src/rules.ts#L155), and [`estimateCost`](packages/pricing-engine/src/estimator.ts#L6).

### Observable gaps from repository shape

There are no visible tests for many React pages and components such as [`GraphPage`](apps/web/src/app/graph/page.tsx#L32), [`UploadPage`](apps/web/src/app/upload/page.tsx#L3), [`ChatPanel`](apps/web/src/components/chat/ChatPanel.tsx#L447), or [`NodeDetail`](apps/web/src/components/graph/NodeDetail.tsx#L156). That does not mean they are untested in reality, but from the repository shape alone the test surface is much thinner than the implementation surface. In particular, the following areas appear underrepresented:

- route handlers in `apps/web/src/app/api/*`
- most UI components under `apps/web/src/components/*`
- nontrivial orchestration around server APIs and Tauri bridging
- package entrypoints such as [`packages/graph-schema/src/index.ts`](packages/graph-schema/src/index.ts) and [`packages/llm-types/src/index.ts`](packages/llm-types/src/index.ts)

> **Sources:** `apps/web/src/__tests__/GraphFilterBar.test.tsx` · `apps/web/src/__tests__/plan-diff.test.ts` · `apps/web/src/__tests__/plan-store.test.ts` · `apps/web/src/__tests__/plan-url.test.ts` · `apps/web/src/__tests__/pricing-estimates.test.ts` · `apps/web/src/__tests__/theme-store.test.ts` · `services/comparison/src/__tests__/diff.test.ts` · `services/llm/src/__tests__/rules.test.ts` · `services/parser/src/__tests__/parse-plan.test.ts` · `services/pricing/src/__tests__/pricing.test.ts` · `apps/web/src/app/graph/page.tsx` · `apps/web/src/components/chat/ChatPanel.tsx` · `apps/web/src/components/graph/NodeDetail.tsx`

## How to Run Tests

The analysis payload does not include explicit test commands (`test_commands` is empty), so this page cannot quote a verified command list. In practice, the repository’s test runner is configured through [`vitest.config.ts`](vitest.config.ts), so test execution is expected to use Vitest in the workspace(s) that contain `__tests__` directories.

A typical workflow would be:

```bash
# discover package scripts first
cat package.json

# run the full test suite if a workspace script exists
pnpm test

# or run Vitest directly if the repo is configured that way
pnpm vitest run
```

For targeted development, it is common to run a single file or a matching pattern:

```bash
pnpm vitest run apps/web/src/__tests__/plan-store.test.ts
pnpm vitest run services/parser/src/__tests__/parse-plan.test.ts
pnpm vitest run services/pricing/src/__tests__/pricing.test.ts
```

Because the payload does not confirm whether the repo uses `pnpm`, `npm`, or `yarn`, treat these as examples rather than authoritative commands.

### Recommended local workflow

1. Run the smallest relevant suite first.
2. Fix failing pure-unit tests before moving to cross-module logic.
3. Re-run the broader workspace after touching shared types in `packages/*`.

That approach is especially useful here because shared types such as [`GraphModel`](packages/graph-schema/src/index.ts#L42), [`Recommendation`](packages/llm-types/src/index.ts#L20), and [`PricingResult`](packages/pricing-types/src/index.ts#L26) are used across multiple packages and test suites.

> **Sources:** `vitest.config.ts` · `apps/web/src/__tests__/plan-store.test.ts` · `services/parser/src/__tests__/parse-plan.test.ts` · `services/pricing/src/__tests__/pricing.test.ts` · `packages/graph-schema/src/index.ts` · `packages/llm-types/src/index.ts` · `packages/pricing-types/src/index.ts`

## What Each Test Suite Covers

### `apps/web/src/__tests__/GraphFilterBar.test.tsx`

This suite exercises the filter-bar behavior in [`GraphFilterBar`](apps/web/src/components/graph/GraphFilterBar.tsx#L60), including helper behavior around [`getNodeTags`](apps/web/src/components/graph/GraphFilterBar.tsx#L52) and filter toggling functions like [`toggleAction`](apps/web/src/components/graph/GraphFilterBar.tsx#L74), [`toggleLayer`](apps/web/src/components/graph/GraphFilterBar.tsx#L81), [`toggleProvider`](apps/web/src/components/graph/GraphFilterBar.tsx#L88), [`toggleTag`](apps/web/src/components/graph/GraphFilterBar.tsx#L126), and [`clearAll`](apps/web/src/components/graph/GraphFilterBar.tsx#L95). The test helper [`makeNode`](apps/web/src/__tests__/GraphFilterBar.test.tsx#L10) builds `GraphNode` objects with minimal overrides, and [`emptyFilter`](apps/web/src/__tests__/GraphFilterBar.test.tsx#L23) provides a baseline filter object.

### `apps/web/src/__tests__/plan-diff.test.ts`

This suite validates plan comparison logic in [`diffPlans`](apps/web/src/lib/plan-diff.ts#L29). Its helpers [`makeNode`](apps/web/src/__tests__/plan-diff.test.ts#L7) and [`makeModel`](apps/web/src/__tests__/plan-diff.test.ts#L25) generate `GraphModel` fixtures that make it easy to check classification of node-level differences. The presence of [`NodeDiffEntry`](apps/web/src/lib/plan-diff.ts#L6), [`PlanDiff`](apps/web/src/lib/plan-diff.ts#L14), and [`DiffKind`](apps/web/src/lib/plan-diff.ts#L4) indicates the suite is likely focused on structural diff output rather than rendering.

### `apps/web/src/__tests__/plan-store.test.ts`

This file covers browser persistence for plans and history in [`savePlan`](apps/web/src/lib/plan-store.ts#L39), [`loadPlan`](apps/web/src/lib/plan-store.ts#L54), [`clearPlan`](apps/web/src/lib/plan-store.ts#L66), [`saveToHistory`](apps/web/src/lib/plan-store.ts#L70), [`loadHistory`](apps/web/src/lib/plan-store.ts#L93), and [`removeHistoryEntry`](apps/web/src/lib/plan-store.ts#L99). It also includes quota-related behavior via [`estimateLocalStorageUsage`](apps/web/src/lib/plan-store.ts#L11), [`isApproachingQuota`](apps/web/src/lib/plan-store.ts#L22), [`isAtQuota`](apps/web/src/lib/plan-store.ts#L29), and the [`StorageQuotaError`](apps/web/src/lib/plan-store.ts#L6) class. The fixtures [`localStorageMock`](apps/web/src/__tests__/plan-store.test.ts#L27) and [`sessionStorageMock`](apps/web/src/__tests__/plan-store.test.ts#L36) are notable because they let tests run in a Node environment without a browser.

### `apps/web/src/__tests__/plan-url.test.ts`

This suite focuses on URL encoding/decoding around [`compressToBase64`](apps/web/src/lib/plan-url.ts#L3), [`decompressFromBase64`](apps/web/src/lib/plan-url.ts#L29), [`encodePlan`](apps/web/src/lib/plan-url.ts#L64), and [`decodePlan`](apps/web/src/lib/plan-url.ts#L66). The helper [`makeModel`](apps/web/src/__tests__/plan-url.test.ts#L5) suggests tests are validating round-trips and encoded plan stability using a small `GraphModel`.

### `apps/web/src/__tests__/pricing-estimates.test.ts`

This suite likely verifies front-end pricing estimation helpers that bridge UI and pricing logic, especially functions consuming [`estimateCost`](packages/pricing-engine/src/estimator.ts#L6) and the types in [`packages/pricing-engine/src/types.ts`](packages/pricing-engine/src/types.ts#L1). The helper [`makeNode`](apps/web/src/__tests__/pricing-estimates.test.ts#L6) constructs test nodes with provider-aware attributes so the suite can check cost-related calculations for different resource shapes.

### `apps/web/src/__tests__/theme-store.test.ts`

This suite validates theme persistence and application logic around [`getStoredTheme`](apps/web/src/lib/theme-store.ts#L4), [`applyTheme`](apps/web/src/lib/theme-store.ts#L9), and [`toggleTheme`](apps/web/src/lib/theme-store.ts#L14). The `makeLocalStorage` helper in [`theme-store.test.ts`](apps/web/src/__tests__/theme-store.test.ts#L4) is important because it indicates the tests stub browser storage directly.

### `services/comparison/src/__tests__/diff.test.ts`

This test file exercises model diffing in the comparison service, centered on [`diffModels`](services/comparison/src/__tests__/diff.test.ts#L30). The helpers [`makeNode`](services/comparison/src/__tests__/diff.test.ts#L5) and [`makeModel`](services/comparison/src/__tests__/diff.test.ts#L14) construct current/previous `GraphModel` instances, while [`DiffResult`](services/comparison/src/__tests__/diff.test.ts#L25) shows the expected result shape.

### `services/llm/src/__tests__/rules.test.ts`

This suite covers deterministic recommendation checks in [`runDeterministicRules`](services/llm/src/rules.ts#L155), which wraps rule functions such as [`checkNoDatabase`](services/llm/src/rules.ts#L11), [`checkSingleAzRds`](services/llm/src/rules.ts#L27), [`checkUnencryptedS3`](services/llm/src/rules.ts#L48), [`checkPublicS3`](services/llm/src/rules.ts#L67), [`checkRdsMissingBackupRetention`](services/llm/src/rules.ts#L88), [`checkOversizedInstances`](services/llm/src/rules.ts#L110), and [`checkUnencryptedEbs`](services/llm/src/rules.ts#L134). The helper [`makeNode`](services/llm/src/__tests__/rules.test.ts#L15) suggests the suite constructs synthetic graph nodes to trigger each rule path.

### `services/parser/src/__tests__/parse-plan.test.ts`

Although the file contents are not enumerated in the payload, its location strongly suggests coverage for the parser pipeline starting at [`parsePlanUseCase`](services/parser/src/application/parse-plan.use-case.ts#L19) and the lower-level graph-building functions [`flattenResources`](services/parser/src/domain/plan-parser.ts#L11), [`resolveChangeAction`](services/parser/src/domain/plan-parser.ts#L28), [`buildNode`](services/parser/src/domain/plan-parser.ts#L43), [`buildEdges`](services/parser/src/domain/plan-parser.ts#L62), and [`buildGraphModel`](services/parser/src/domain/plan-parser.ts#L79). Since the parser domain also contains provider-specific classification functions like [`classifyAwsLayer`](services/parser/src/domain/layer-classifier.ts#L237), the suite likely covers converting Terraform plan JSON into graph nodes and edges.

### `services/pricing/src/__tests__/pricing.test.ts`

This suite covers pricing lookup and aggregation behavior in [`estimateNode`](services/pricing/src/main.ts#L20) and the underlying pricing engine functions [`estimateCost`](packages/pricing-engine/src/estimator.ts#L6), [`totalMonthlyCost`](packages/pricing-engine/src/estimator.ts#L18), and [`costByProvider`](packages/pricing-engine/src/estimator.ts#L26). The helper [`node`](services/pricing/src/__tests__/pricing.test.ts#L6) constructs inputs with provider and attribute variations, while the [`lookup`](services/pricing/src/__tests__/pricing.test.ts#L86) class suggests the suite includes a mocked lookup implementation for deterministic pricing data.

> **Sources:** `apps/web/src/components/graph/GraphFilterBar.tsx` · `apps/web/src/__tests__/GraphFilterBar.test.tsx` · `apps/web/src/lib/plan-diff.ts` · `apps/web/src/__tests__/plan-diff.test.ts` · `apps/web/src/lib/plan-store.ts` · `apps/web/src/__tests__/plan-store.test.ts` · `apps/web/src/lib/plan-url.ts` · `apps/web/src/__tests__/plan-url.test.ts` · `apps/web/src/lib/theme-store.ts` · `apps/web/src/__tests__/theme-store.test.ts` · `services/comparison/src/__tests__/diff.test.ts` · `services/llm/src/rules.ts` · `services/llm/src/__tests__/rules.test.ts` · `services/parser/src/application/parse-plan.use-case.ts` · `services/parser/src/domain/plan-parser.ts` · `services/parser/src/domain/layer-classifier.ts` · `services/pricing/src/main.ts` · `services/pricing/src/__tests__/pricing.test.ts` · `packages/pricing-engine/src/estimator.ts` · `packages/pricing-engine/src/types.ts`

## Notable Test Helpers and Fixtures

| Helper / fixture                                                      | File                                               | Purpose                                                          |
| --------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| [`makeNode`](apps/web/src/__tests__/GraphFilterBar.test.tsx#L10)      | `apps/web/src/__tests__/GraphFilterBar.test.tsx`   | Builds minimal `GraphNode` inputs for filter assertions          |
| [`emptyFilter`](apps/web/src/__tests__/GraphFilterBar.test.tsx#L23)   | `apps/web/src/__tests__/GraphFilterBar.test.tsx`   | Provides a baseline `GraphFilter` object                         |
| [`makeNode`](apps/web/src/__tests__/plan-diff.test.ts#L7)             | `apps/web/src/__tests__/plan-diff.test.ts`         | Creates diffable graph nodes with address/type/provider defaults |
| [`makeModel`](apps/web/src/__tests__/plan-diff.test.ts#L25)           | `apps/web/src/__tests__/plan-diff.test.ts`         | Wraps node arrays into `GraphModel` fixtures                     |
| [`makeModel`](apps/web/src/__tests__/plan-store.test.ts#L8)           | `apps/web/src/__tests__/plan-store.test.ts`        | Creates small models for storage round-trip tests                |
| [`localStorageMock`](apps/web/src/__tests__/plan-store.test.ts#L27)   | `apps/web/src/__tests__/plan-store.test.ts`        | Stubs browser localStorage                                       |
| [`sessionStorageMock`](apps/web/src/__tests__/plan-store.test.ts#L36) | `apps/web/src/__tests__/plan-store.test.ts`        | Stubs browser sessionStorage                                     |
| [`makeModel`](apps/web/src/__tests__/plan-url.test.ts#L5)             | `apps/web/src/__tests__/plan-url.test.ts`          | Builds a model for encode/decode tests                           |
| [`makeNode`](apps/web/src/__tests__/pricing-estimates.test.ts#L6)     | `apps/web/src/__tests__/pricing-estimates.test.ts` | Constructs pricing inputs                                        |
| [`makeLocalStorage`](apps/web/src/__tests__/theme-store.test.ts#L4)   | `apps/web/src/__tests__/theme-store.test.ts`       | Creates a storage mock for theme persistence                     |
| [`makeNode`](services/comparison/src/__tests__/diff.test.ts#L5)       | `services/comparison/src/__tests__/diff.test.ts`   | Node factory for diff scenarios                                  |
| [`makeModel`](services/comparison/src/__tests__/diff.test.ts#L14)     | `services/comparison/src/__tests__/diff.test.ts`   | Model factory for comparison tests                               |
| [`makeNode`](services/llm/src/__tests__/rules.test.ts#L15)            | `services/llm/src/__tests__/rules.test.ts`         | Node factory for rule-trigger scenarios                          |
| [`makeModel`](services/llm/src/__tests__/rules.test.ts#L30)           | `services/llm/src/__tests__/rules.test.ts`         | Model factory for deterministic rule checks                      |
| [`node`](services/pricing/src/__tests__/pricing.test.ts#L6)           | `services/pricing/src/__tests__/pricing.test.ts`   | Pricing test node builder                                        |
| [`lookup`](services/pricing/src/__tests__/pricing.test.ts#L86)        | `services/pricing/src/__tests__/pricing.test.ts`   | Mock pricing table/lookup class                                  |

This fixture style reinforces that the suite is primarily unit-level. Rather than loading large plan files or rendering full app flows, tests synthesize narrowly scoped `GraphNode` and `GraphModel` objects. That makes the suite fast and deterministic, but it also means behavior that depends on real browser APIs, network fetches, or full routing is likely under-covered.

> **Sources:** `apps/web/src/__tests__/GraphFilterBar.test.tsx` · `apps/web/src/__tests__/plan-diff.test.ts` · `apps/web/src/__tests__/plan-store.test.ts` · `apps/web/src/__tests__/plan-url.test.ts` · `apps/web/src/__tests__/pricing-estimates.test.ts` · `apps/web/src/__tests__/theme-store.test.ts` · `services/comparison/src/__tests__/diff.test.ts` · `services/llm/src/__tests__/rules.test.ts` · `services/pricing/src/__tests__/pricing.test.ts`

## Coverage Summary and Implied Gaps

### Strongly covered areas

The repository appears to have good coverage for:

- graph and plan data transformations via [`diffPlans`](apps/web/src/lib/plan-diff.ts#L29), [`diffModels`](services/comparison/src/__tests__/diff.test.ts#L30), and parser helpers in [`plan-parser`](services/parser/src/domain/plan-parser.ts#L11)
- browser persistence logic via [`plan-store`](apps/web/src/lib/plan-store.ts#L39), [`baseline-store`](apps/web/src/lib/baseline-store.ts#L12), and [`theme-store`](apps/web/src/lib/theme-store.ts#L4)
- deterministic rules in the LLM service via [`runDeterministicRules`](services/llm/src/rules.ts#L155)
- pricing calculations and lookup behavior via [`estimateCost`](packages/pricing-engine/src/estimator.ts#L6) and [`estimateNode`](services/pricing/src/main.ts#L20)

### Likely gaps

Based on file presence alone, the most obvious gaps are:

- no visible tests for most React components
- no visible tests for route handlers in `apps/web/src/app/api`
- no visible tests for CLI/worker entrypoints such as [`apps/terraform-worker/src/main.ts`](apps/terraform-worker/src/main.ts)
- no visible tests for integration between parser, pricing, comparison, and web layers in a single end-to-end path
- no visible tests for error handling in boundary components like [`ErrorBoundary`](apps/web/src/components/ErrorBoundary.tsx#L5)

That leaves a test strategy that is strong on deterministic, isolated logic but thinner on user-facing integration coverage.

> **Sources:** `apps/web/src/lib/plan-diff.ts` · `apps/web/src/lib/plan-store.ts` · `apps/web/src/lib/baseline-store.ts` · `apps/web/src/lib/theme-store.ts` · `services/llm/src/rules.ts` · `packages/pricing-engine/src/estimator.ts` · `services/pricing/src/main.ts` · `apps/web/src/app/api/chat/route.ts` · `apps/web/src/app/api/parse/route.ts` · `apps/web/src/app/api/run/route.ts` · `apps/web/src/components/ErrorBoundary.tsx`
