---
slug: packages-layer
title: "Shared Packages as Reusable Building Blocks"
section: core-components
tags: [modules, reference]
pin: false
importance: 84
created_at: 2026-05-05T06:02:39Z
rekipedia_version: 0.10.3
---

# Shared Packages as Reusable Building Blocks

The repository’s shared packages are intentionally small, focused abstractions that let apps and services exchange a common data model without importing each other’s implementation details. In practice, these packages provide the “contract layer” for graph data, LLM recommendation payloads, and pricing calculations, while the apps and services remain free to evolve their own UI, HTTP, persistence, and orchestration code.

This page documents four shared packages only:

- [`packages/graph-schema/src/index.ts`](packages/graph-schema/src/index.ts)
- [`packages/llm-types/src/index.ts`](packages/llm-types/src/index.ts)
- [`packages/pricing-engine/src/index.ts`](packages/pricing-engine/src/index.ts)
- [`packages/pricing-types/src/index.ts`](packages/pricing-types/src/index.ts)

The documentation below focuses on exported implementation symbols and how each package is reused across the codebase. It deliberately excludes tests, config artifacts, and service-specific behavior.

## Package Overview

| Package          | Purpose                                                                                                      | Exported entry point                                                           | Major exported symbols                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `graph-schema`   | Defines the canonical graph model shared by parser, pricing, comparison, UI, and LLM-related code.           | [`packages/graph-schema/src/index.ts`](packages/graph-schema/src/index.ts)     | [`GraphNode`](packages/graph-schema/src/index.ts#L25), [`GraphEdge`](packages/graph-schema/src/index.ts#L37), [`GraphModel`](packages/graph-schema/src/index.ts#L42)                                                                                                                                                                                                                                                                                    |
| `llm-types`      | Provides shared recommendation types used to describe LLM-generated guidance and structured outputs.         | [`packages/llm-types/src/index.ts`](packages/llm-types/src/index.ts)           | [`Recommendation`](packages/llm-types/src/index.ts#L20), [`RecommendationResult`](packages/llm-types/src/index.ts#L31)                                                                                                                                                                                                                                                                                                                                  |
| `pricing-engine` | Implements reusable cost-estimation logic over graph nodes.                                                  | [`packages/pricing-engine/src/index.ts`](packages/pricing-engine/src/index.ts) | [`estimateCost`](packages/pricing-engine/src/estimator.ts#L6), [`totalMonthlyCost`](packages/pricing-engine/src/estimator.ts#L18), [`costByProvider`](packages/pricing-engine/src/estimator.ts#L26), [`CostEstimate`](packages/pricing-engine/src/types.ts#L1), [`BreakdownItem`](packages/pricing-engine/src/types.ts#L12), [`UsageOverrides`](packages/pricing-engine/src/types.ts#L20), [`endpoint`](packages/pricing-engine/src/cost-table.ts#L446) |
| `pricing-types`  | Exposes API-friendly pricing result shapes for consumers that need stable DTOs rather than estimation logic. | [`packages/pricing-types/src/index.ts`](packages/pricing-types/src/index.ts)   | [`ResourceEstimate`](packages/pricing-types/src/index.ts#L9), [`CostLineItem`](packages/pricing-types/src/index.ts#L19), [`PricingResult`](packages/pricing-types/src/index.ts#L26)                                                                                                                                                                                                                                                                     |

> **Sources:** `packages/graph-schema/src/index.ts` · `packages/llm-types/src/index.ts` · `packages/pricing-engine/src/index.ts` · `packages/pricing-types/src/index.ts`

## `graph-schema`: The Shared Terraform Graph Contract

The [`GraphNode`](packages/graph-schema/src/index.ts#L25), [`GraphEdge`](packages/graph-schema/src/index.ts#L37), and [`GraphModel`](packages/graph-schema/src/index.ts#L42) interfaces form the core data contract for the repository. They are the most widely reused shared types: the parser builds them, the UI renders them, the pricing logic consumes them, and multiple services accept them as inputs.

At a structural level, the package does not implement business logic. Its value is in standardizing the shape of graph data so every consumer can work against the same schema. That makes it much easier to move data between services without redundant translation layers.

Typical usage observed in the repository includes:

- the parser building a graph model before returning it to callers
- pricing code consuming graph nodes to compute monthly cost estimates
- UI components importing graph types for rendering, filtering, and diffing
- other packages depending on `GraphModel` as the common representation of infrastructure state

Because the package only defines the graph contract, it acts as a stable boundary object. If a consumer needs to know “what is a graph node?”, the answer lives here rather than being redefined in each app or service.

> **Sources:** `packages/graph-schema/src/index.ts` · L25–L42 · [`GraphNode`](packages/graph-schema/src/index.ts#L25) · [`GraphEdge`](packages/graph-schema/src/index.ts#L37) · [`GraphModel`](packages/graph-schema/src/index.ts#L42)

## `llm-types`: Shared Recommendation Shapes

The [`Recommendation`](packages/llm-types/src/index.ts#L20) and [`RecommendationResult`](packages/llm-types/src/index.ts#L31) interfaces provide a narrow shared vocabulary for LLM-driven output. The package exists so services that build prompts, parse responses, or apply deterministic rules can exchange the same structured recommendation shape without coupling to a concrete service implementation.

From the analysis data, this package is imported by the LLM service layer, which uses the shared recommendation type in its prompt-building flow. That indicates the package’s role is not to perform inference itself, but to provide a common result type that the rest of the stack can depend on.

This separation is useful because recommendation shape changes are then localized to a single package. Consumers can reason about:

- the fields that represent an individual recommendation
- the structure of a recommendation collection/result
- how to serialize or transport recommendations across boundaries

The package is intentionally lightweight: it does not encode rule evaluation, model selection, or transport logic. It simply defines the shared contract.

> **Sources:** `packages/llm-types/src/index.ts` · L20–L31 · [`Recommendation`](packages/llm-types/src/index.ts#L20) · [`RecommendationResult`](packages/llm-types/src/index.ts#L31)

## `pricing-engine`: Reusable Cost Estimation Logic

The [`pricing-engine`](packages/pricing-engine/src/index.ts) package combines types and implementation to estimate infrastructure cost from graph data. Its primary exported functions are [`estimateCost(node: GraphNode)`](packages/pricing-engine/src/estimator.ts#L6), [`totalMonthlyCost(nodes: readonly GraphNode[])`](packages/pricing-engine/src/estimator.ts#L18), and [`costByProvider(nodes: readonly GraphNode[])`](packages/pricing-engine/src/estimator.ts#L26).

The package also exports a pricing model surface via [`CostEstimate`](packages/pricing-engine/src/types.ts#L1), [`BreakdownItem`](packages/pricing-engine/src/types.ts#L12), and [`UsageOverrides`](packages/pricing-engine/src/types.ts#L20). In addition, the analysis identifies an [`endpoint`](packages/pricing-engine/src/cost-table.ts#L446) interface in the cost table module, showing that the package includes a data-backed cost catalog as part of the estimation workflow.

Architecturally, this package is a reusable algorithmic layer:

- it consumes [`GraphNode`](packages/graph-schema/src/index.ts#L25) as the canonical input
- it performs cost calculation independent of any UI or transport stack
- it returns typed structures that can be consumed by services, CLIs, or frontend helpers

This means apps can depend on a single cost engine instead of reimplementing their own pricing heuristics. It also means pricing rules are centralized: if the cost table or estimation formula changes, downstream consumers do not need to carry duplicate logic.

> **Sources:** `packages/pricing-engine/src/index.ts` · `packages/pricing-engine/src/estimator.ts` · `packages/pricing-engine/src/types.ts` · `packages/pricing-engine/src/cost-table.ts` · [`estimateCost`](packages/pricing-engine/src/estimator.ts#L6) · [`totalMonthlyCost`](packages/pricing-engine/src/estimator.ts#L18) · [`costByProvider`](packages/pricing-engine/src/estimator.ts#L26) · [`CostEstimate`](packages/pricing-engine/src/types.ts#L1) · [`BreakdownItem`](packages/pricing-engine/src/types.ts#L12) · [`UsageOverrides`](packages/pricing-engine/src/types.ts#L20) · [`endpoint`](packages/pricing-engine/src/cost-table.ts#L446)

## `pricing-types`: Stable Pricing DTOs

The [`pricing-types`](packages/pricing-types/src/index.ts) package defines the payload types used to represent pricing results in a more transport- and service-friendly form. Its exported symbols are [`ResourceEstimate`](packages/pricing-types/src/index.ts#L9), [`CostLineItem`](packages/pricing-types/src/index.ts#L19), and [`PricingResult`](packages/pricing-types/src/index.ts#L26).

Compared with `pricing-engine`, this package is more about shape than algorithm. It gives consumers a stable representation for:

- per-resource estimates
- line-itemized cost output
- overall pricing responses

The analysis shows this package imports `@terraform-viz/graph-schema`, which reinforces its role as a shared DTO layer built on the common graph model. That makes it useful when a service wants to expose pricing information without leaking internal estimator details. Consumers can use the DTOs directly and leave any calculation concerns to the engine package.

In other words, `pricing-types` is the boundary-facing companion to `pricing-engine`: one package computes, the other standardizes the resulting data.

> **Sources:** `packages/pricing-types/src/index.ts` · L9–L26 · [`ResourceEstimate`](packages/pricing-types/src/index.ts#L9) · [`CostLineItem`](packages/pricing-types/src/index.ts#L19) · [`PricingResult`](packages/pricing-types/src/index.ts#L26)

## Cross-Module Dependency Table

The table below summarizes how these shared packages relate to one another and to the surrounding apps/services, based on the available cross-module summary data.

| Module                                 | Imports From                         | Called By                                                        | Calls Into                                                                                                                | Inherits From |
| -------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `packages/graph-schema/src/index.ts`   | —                                    | Apps, services, and shared packages that consume graph data      | —                                                                                                                         | —             |
| `packages/llm-types/src/index.ts`      | —                                    | LLM-related service code that builds and handles recommendations | —                                                                                                                         | —             |
| `packages/pricing-engine/src/index.ts` | `packages/graph-schema/src/index.ts` | Services and UI helpers that estimate cost                       | `packages/graph-schema/src/index.ts`, `packages/pricing-engine/src/cost-table.ts`, `packages/pricing-engine/src/types.ts` | —             |
| `packages/pricing-types/src/index.ts`  | `packages/graph-schema/src/index.ts` | Services that expose or consume pricing DTOs                     | `packages/graph-schema/src/index.ts`                                                                                      | —             |

> **Sources:** `packages/graph-schema/src/index.ts` · `packages/llm-types/src/index.ts` · `packages/pricing-engine/src/index.ts` · `packages/pricing-engine/src/estimator.ts` · `packages/pricing-engine/src/types.ts` · `packages/pricing-engine/src/cost-table.ts` · `packages/pricing-types/src/index.ts`

## How These Packages Reduce Coupling

These packages reduce coupling by separating **data contracts** and **shared algorithms** from app-specific behavior.

### Shared contract, not shared implementation details

`graph-schema` gives every consumer the same `GraphNode`/`GraphModel` vocabulary. That means the parser, pricing engine, comparison logic, and UI can all agree on the same object shapes without importing each other. The result is less duplication and fewer translation adapters around graph data.

### Stable interfaces between layers

`llm-types` and `pricing-types` provide focused DTOs that keep service outputs predictable. Instead of having a service leak its internal model or computation structures, it can export a narrow response shape and keep internal logic private.

### Centralized business logic

`pricing-engine` centralizes estimation logic behind a reusable package API. This prevents each service from maintaining its own pricing heuristics, which would otherwise create drift and tightly couple changes to multiple call sites.

### Practical effect in the repository

The observable dependency pattern is:

- apps and services import shared packages
- shared packages do not import apps or service entry points
- feature-specific code stays in app/service layers, while shared packages carry the reusable core

That structure supports independent development: parser changes can evolve around the graph model, pricing logic can evolve around the estimator, and UI code can evolve around the same graph types, all with fewer cross-cutting edits.

> **Sources:** `packages/graph-schema/src/index.ts` · `packages/llm-types/src/index.ts` · `packages/pricing-engine/src/index.ts` · `packages/pricing-types/src/index.ts`
