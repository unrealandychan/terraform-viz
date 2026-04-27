# 🌐 TerraViz

> **Visualise, cost-estimate, and diff your Terraform plans — before you run `apply`.**

[![CI](https://github.com/unrealandychan/terraform-viz/actions/workflows/ci.yml/badge.svg)](https://github.com/unrealandychan/terraform-viz/actions/workflows/ci.yml)
![Version](https://img.shields.io/badge/version-0.2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)
![Rust](https://img.shields.io/badge/rust-1.75%2B-orange)

TerraViz is a multi-cloud application that parses Terraform plan JSON and turns it into an interactive architecture diagram, accurate monthly cost estimates, side-by-side plan diffs, and an AI-powered chat assistant.

**Now available as a native desktop app** (powered by [Tauri 2](https://tauri.app/)) — no server, no Docker, just open a `.json` file and go.

---

## ✨ Features

| | Feature | Description |
|---|---|---|
| 🗺️ | **Graph Visualisation** | Parses `terraform plan -json` output and renders an interactive 2D swimlane diagram, grouped by layer (Network → Compute → Database → Storage → Data), with filters by action, provider, layer, and tag |
| 💰 | **Cost Estimation** | Per-resource monthly estimates with full breakdowns — EBS volume types (gp2/gp3/io1/io2/st1/sc1), ALB vs NLB differentiation, RDS Multi-AZ, and more |
| 📊 | **Plan Comparison** | Diff a plan against a pinned baseline — highlights created / updated / replaced / deleted resources and shows the estimated monthly cost delta |
| 🤖 | **AI Chat Assistant** | Streaming LLM assistant with preset analyses (cost saving, security review, architecture overview, destruction risk) — works with any OpenAI-compatible endpoint |
| 📜 | **History & Sharing** | Browser-side history of loaded plans; share plans via URL-encoded deep links |
| 📦 | **Zip Upload** | Drop a `.zip` of a Terraform project — the sandboxed worker runs `init → plan → show -json` automatically |
| 🖥️ | **Desktop App** | Native Tauri 2 app — open plan files via native dialog, all parsing done locally in Rust, no backend required |

---

## ☁️ Supported Clouds

| Cloud | Compute | Database | Storage | Networking | Data / Analytics |
|---|---|---|---|---|---|
| **AWS** | EC2, Lambda, EKS, ECS, Auto Scaling | RDS, Aurora, ElastiCache, DynamoDB | S3, EBS (gp2/gp3/io1/io2/st1/sc1), EFS | VPC, NAT GW, ALB/NLB, CloudFront, Route 53 | Kinesis, SQS, SNS, Glue, Redshift, MSK |
| **Azure** | VMs, AKS, Function App, App Service | SQL, PostgreSQL, MySQL, Redis, Cosmos DB | Storage Account, Managed Disk | VNet, Load Balancer | Event Hubs, Databricks, Data Factory |
| **GCP** | Compute Engine, GKE, Cloud Run, Cloud Functions | Cloud SQL, Spanner, Redis, Bigtable | GCS, Persistent Disk, Filestore | VPC, Subnets, Forwarding Rules | BigQuery, Pub/Sub, Dataflow, Composer |

---

## 🏗️ Architecture

```
terraform-viz/
├── apps/
│   ├── web/                # Next.js 15 frontend (upload, graph, cost, diff, AI chat)
│   └── terraform-worker/   # Sandboxed terraform init + plan + show -json runner
├── services/
│   ├── parser/             # Normalises Terraform JSON → cloud-agnostic GraphModel
│   ├── pricing/            # Monthly estimate engine backed by JSON catalogs
│   ├── comparison/         # Plan snapshot diffs
│   └── llm/                # LLM proxy service
├── packages/
│   ├── graph-schema/       # Shared TypeScript types (GraphModel, GraphNode, …)
│   ├── llm-types/          # Shared LLM request/response types
│   └── pricing-types/      # Shared cost estimate types
├── pricing/
│   └── data/               # aws.json · azure.json · gcp.json pricing catalogs
└── src-tauri/              # Tauri 2 desktop shell (Rust backend + IPC commands)
    ├── src/
    │   ├── main.rs         # IPC commands: parse_plan, estimate_costs, open_plan_file
    │   ├── parser.rs       # Rust Terraform plan parser
    │   ├── pricing.rs      # 35+ resource pricing rules (AWS/GCP/Azure)
    │   └── types.rs        # GraphNode, GraphEdge, GraphModel structs
    └── tauri.conf.json     # App config (window size, bundle identifier, build cmds)
```

---

## 🚀 Getting Started

### Prerequisites

**Web / Docker mode:**
- **Node.js** 20+
- **Docker + Docker Compose** (for the full service stack)
- **Terraform CLI** 1.6+ (only required inside the Docker worker image)

**Desktop (Tauri) mode — additional requirements:**
- **Rust** 1.75+ (`rustup` recommended)
- **Tauri CLI** 2.x — `cargo install tauri-cli`
- Linux: `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev pkg-config`
- macOS: Xcode Command Line Tools
- Windows: Microsoft Visual Studio C++ Build Tools, WebView2

---

### 🌐 Web Mode (Docker)

```bash
# 1. Clone
git clone https://github.com/unrealandychan/terraform-viz.git
cd terraform-viz

# 2. Install workspace dependencies
npm install

# 3. Start all services (web, parser, pricing, comparison, llm, worker)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

### 🖥️ Desktop Mode (Tauri)

#### Option A — Run in dev mode (with hot reload)

```bash
# Prerequisites: Rust + Tauri CLI installed (see above)

git clone https://github.com/unrealandychan/terraform-viz.git
cd terraform-viz

# Install JS dependencies
npm install

# Start the Tauri dev window
# (launches Next.js dev server + Tauri WebView automatically)
cargo tauri dev
```

#### Option B — Build a release binary

```bash
# Full release build — compiles Rust backend + Next.js static export
cargo tauri build

# To build without bundler packaging (binary only, faster):
cargo tauri build --no-bundle
```

The build process:
1. Runs `TAURI_BUILD=1 npx next build` inside `apps/web/` — produces a static export at `apps/web/out/`
2. Compiles the Rust backend (`src-tauri/`) in release mode
3. Bundles everything into a platform-native package

**Output locations:**
| Platform | Format | Path |
|---|---|---|
| Linux | `.AppImage` | `src-tauri/target/release/bundle/appimage/` |
| Linux | `.deb` | `src-tauri/target/release/bundle/deb/` |
| macOS | `.dmg` / `.app` | `src-tauri/target/release/bundle/dmg/` |
| Windows | `.msi` / `.exe` | `src-tauri/target/release/bundle/msi/` |

> **Tip:** `--no-bundle` skips packaging and only produces the raw binary at `src-tauri/target/release/terraform-viz` (Linux/macOS) or `terraform-viz.exe` (Windows). Useful for CI or quick local testing.

---

### Other commands

```bash
# Type-check the full monorepo
npm run typecheck

# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint
```

---

### Input formats

- `terraform show -json` output — paste or upload a `.json` file
- `.zip` archive of a Terraform project directory — the worker handles `init + plan + show -json`
- **Desktop only:** native file picker — click **Open Plan File…** in the upload screen

---

## 🗺️ Milestones

| Milestone | Scope | Status |
|---|---|---|
| **M1** | Parse Terraform plan JSON, render 2D graph, upload flow | ✅ Shipped |
| **M2** | Pricing estimation from internal JSON catalog for AWS / Azure / GCP | ✅ Shipped |
| **M3** | Plan comparison, graph diff, monthly cost delta | ✅ Shipped |
| **M4** | AI chat assistant with streaming LLM + preset analysis templates | ✅ Shipped |
| **M5** | Zip upload via terraform worker, expanded pricing catalog, test coverage | ✅ Shipped |
| **M6** | Tauri 2 desktop app — native file open, Rust backend, static export build | ✅ Shipped |
| **M7** | CI/CD pipeline, macOS/Windows desktop bundles, auto-update | 🗓️ Planned |

---

## 🤝 Contributing

1. Fork the repo and create a feature branch: `git checkout -b feat/my-feature`
2. Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages
3. Run `npm test` and `npm run lint` before pushing
4. Open a Pull Request — the CI pipeline will validate your changes automatically

---

## 📄 License

MIT © [unrealandychan](https://github.com/unrealandychan)
