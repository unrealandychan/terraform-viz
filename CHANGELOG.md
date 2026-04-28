# Changelog

All notable changes to TerraViz are documented here.

---

## [0.2.0] — 2026-04-27 — Desktop App (Tauri 2)

### 🖥️ New: Native Desktop Application

TerraViz is now available as a native desktop app powered by **Tauri 2**. No server, no Docker — open a Terraform plan file directly from your filesystem.

#### Added
- **`src-tauri/` — Rust backend shell**
  - `src/parser.rs` — Rust Terraform plan parser (detect provider, layer, action type)
  - `src/pricing.rs` — 35+ resource pricing rules covering AWS, GCP, and Azure
  - `src/types.rs` — shared Rust types: `GraphNode`, `GraphEdge`, `GraphModel`
  - `src/main.rs` — three Tauri IPC commands:
    - `parse_plan(raw: String) → GraphModel` — parse plan JSON in Rust
    - `estimate_costs(nodes) → CostEstimate[]` — cost estimates in Rust
    - `open_plan_file() → { content, file_name } | null` — native file picker dialog
- **`apps/web/src/lib/tauri-bridge.ts`** — IPC adapter with automatic web fallback
  - `isTauri()` — detects Tauri environment
  - `parsePlan(raw)` — uses Tauri IPC in desktop mode, `/api/parse` in web mode
  - `openPlanFile()` — native dialog in desktop mode, no-op in web mode
- **Native "Open Plan File…" button** in `PlanUpload.tsx` — only visible in desktop mode; opens `.json` / `.tfplan` via OS file picker
- **Static export support** in `next.config.ts` — `TAURI_BUILD=1` switches to `output: "export"` for Tauri bundling; Docker/server mode unchanged (`output: "standalone"`)
- **`src-tauri/tauri.conf.json`** — app config: identifier `com.unrealandychan.terraform-viz`, window 1400×900 (min 1024×640)

#### Changed
- `PlanUpload.tsx` — `parseAndRedirect` now routes through `tauri-bridge` instead of calling `fetch("/api/parse")` directly
- `next.config.ts` — conditional `output` based on `TAURI_BUILD` env var; adds `images: { unoptimized: true }` for static export
- `tauri.conf.json` — `beforeBuildCommand` now runs `TAURI_BUILD=1 npx next build` to produce static output at `apps/web/out/`
- API routes (`/api/parse`, `/api/run`, `/api/chat`, `/api/health`) — added `export const dynamic = "force-static"` so static export doesn't error; routes remain fully functional in web/Docker mode

#### Build
- Rust `1.95.0` (stable), Tauri CLI `2.10.1`
- Release binary: `src-tauri/target/release/terraform-viz` (8.8 MB, Linux x86-64)
- Build command: `cargo tauri build` (full bundle) or `cargo tauri build --no-bundle` (binary only)

---

## [0.1.5] — 2026-04-26

### Changed
- `google_dataflow_job` pricing — MACHINE_SPECS lookup (n1/n2/e2), vCPU $0.056/hr, RAM $0.003375/GB-hr, Disk $0.000054/GB-hr, `avgWorkers = (min+max)/2` autoscale estimate, +10% overhead
- `google_dataflow_job` usage UI — added "Job Hours per Month" slider (1–730 hr), hint text explaining autoscale logic
- HOW text updated: `n1-standard-2 × avg 3w (2–4 autoscale) × 100h/mo`

---

## [0.1.4] — 2026-04-25

### Changed
- `aws_cloudwatch_log_group` pricing — now calculated as ingestion ($0.50/GB) + retention storage ($0.03/GB/mo), replacing previous flat estimate

---

## [0.1.3] — 2026-04-25

### Fixed
- `/api/parse` 400 error — `parser.routes.ts` schema changed from strict struct to `z.record(z.unknown())` to accept arbitrary Terraform plan shapes

### Changed
- `TwoDGraph.tsx` — tree-shook D3 imports (named imports only, no full bundle)
- `usage-utils.ts` (renamed from `usage-store.ts`) — better naming clarity

### Added
- `services/llm/src/rules.ts` — 7 deterministic rule functions for LLM analysis
- `services/llm/src/__tests__/rules.test.ts` — 21 unit tests
- `services/comparison/src/__tests__/diff.test.ts` — 8 unit tests
- `apps/web/src/__tests__/GraphFilterBar.test.tsx` — 7 logic tests
- Total test count: **253 tests** (up from 211)

---

## [0.1.0] — 2026-04-20 — Initial Release

### Added
- Terraform plan JSON parsing → interactive 2D swimlane graph
- Multi-cloud cost estimation (AWS / GCP / Azure) with per-resource breakdowns
- Plan comparison and monthly cost delta
- AI chat assistant (streaming, OpenAI-compatible)
- Zip upload with sandboxed `terraform init + plan + show -json` worker
- Browser-side plan history and URL sharing
