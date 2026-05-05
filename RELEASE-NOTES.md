# Release Notes

## v0.5.0 — 2026-05-05

### Added
- **Tauri desktop app overhaul** (PR #41, #42): Full native desktop experience powered by Tauri 2; replaced Node.js service with Rust backend for local plan parsing and cost estimation — no server required
- **Plan upload for Tauri** (PR #40): Native file picker integration for opening Terraform plan files directly from disk in the desktop app
- **Deterministic LLM rules engine** (PR #39): New rule-based analysis in the LLM service — generates structured recommendations without requiring an external API call, ensuring consistent offline-capable output
- **Expanded test coverage** (PR #38): Added vitest tests for comparison service diff logic, LLM rules engine, server-api client, parser HTTP routes, and terraform-worker input validation; total test count now **290+**

---

## [Unreleased] — Milestone 5

### Added
- `.zip` upload: drop a Terraform project archive and the worker runs `init + plan + show -json` automatically
- Expanded pricing catalog: AWS API Gateway, ECS, CloudWatch, IAM, ACM; Azure Resource Group, Service Bus Queue; GCP VPC/Subnets
- Unit test coverage for parser, pricing engine, and plan diff (vitest)

---

## [0.4.0] — 2026-04-25 — Milestone 4

### Added
- Streaming AI chat panel powered by any OpenAI-compatible LLM endpoint
- Eight preset analysis templates: Cost Saving, Security Review, Architecture Overview, Destruction Risk, Replace Risk, Naming & Tagging Audit, Deletion Analysis, No-op Verification
- Markdown rendering for AI responses with copy and download-as-.md actions
- LLM settings page (base URL, API key, model) stored in `localStorage`
- AI chat embedded in the graph right panel with compact mode

---

## [0.3.0] — 2026-04-25 — Milestone 3

### Added
- Plan comparison engine: diff current plan against a pinned baseline snapshot
- Resource-level change classification: added, removed, unchanged
- Graph diff view with cost delta per entry and overall monthly delta banner
- Baseline pin/unpin via plan history dropdown
- Share URL: plan embedded as compressed base64 query parameter
- Export: SVG graph image, plan JSON, cost CSV

---

## [0.2.0] — 2026-04-25 — Milestone 2

### Added
- Internal pricing catalog (`pricing/data/`) for AWS, Azure, and GCP
- Pricing engine mapping Terraform resource attributes to monthly cost rules
- Per-resource estimates, provider-grouped subtotals, and overall monthly/annual totals
- Cost breakdown panel in the graph right panel
- Human-readable cost breakdown explanation per resource
- Phase 1 resource coverage:
  - **AWS**: EC2, Lambda, EKS, ECS, Auto Scaling, RDS, Aurora, ElastiCache, DynamoDB, S3, EBS, EFS, ALB/NLB, NAT Gateway, CloudFront, Route 53, Kinesis, SQS, SNS, Glue, Redshift, MSK
  - **Azure**: VMs, AKS, Function App, App Service, SQL, PostgreSQL, MySQL, Redis, Cosmos DB, Storage Account, Managed Disk, Event Hubs, Databricks, Data Factory
  - **GCP**: Compute Engine, GKE, Cloud Run, Cloud Functions, Cloud SQL, Spanner, Redis, Bigtable, GCS, Persistent Disk, BigQuery, Pub/Sub, Dataflow, Composer

---

## [0.1.0] — 2026-04-25 — Milestone 1

### Added
- Terraform plan JSON ingestion (`terraform show -json` output) via file upload or paste
- Parser service: normalises Terraform JSON into a cloud-agnostic `GraphModel`
- Resource and dependency extraction including child modules and inter-resource edges
- Logical layer grouping: network, compute, database, storage, data
- 2D architecture diagram with D3.js force layout, zoom/pan, node selection
- Filter bar: filter by change action, cloud provider, layer, resource tag, and free-text search
- Plan history: browser-side list of recently loaded plans
- Compare view: side-by-side resource change summary
- Sandboxed Terraform worker (`apps/terraform-worker`) for isolated `terraform init + plan + show -json`

---

## Format

This file follows a human-readable format loosely based on [Keep a Changelog](https://keepachangelog.com).  
Versions use [Semantic Versioning](https://semver.org).
