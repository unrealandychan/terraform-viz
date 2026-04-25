<div align="center">

# TerraViz

Visualise, cost-estimate, and diff your Terraform plans - before you run `apply`.

![Version](https://img.shields.io/badge/version-0.1.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)

</div>

TerraViz parses Terraform plan JSON and turns it into an interactive architecture diagram, accurate monthly cost estimates, side-by-side plan diffs, and an AI-powered chat assistant - all in your browser, zero infrastructure required.

## Features

**Graph Visualisation** - Parses `terraform plan -json` output and renders an interactive 2D swimlane diagram grouped by layer (Network → Compute → Database → Storage → Data), with filters by action, provider, layer, and tag.

**Cost Estimation** - Per-resource monthly estimates with full breakdowns: EBS volume types (gp2/gp3/io1/io2/st1/sc1), ALB vs NLB differentiation, RDS Multi-AZ, and more.

**Plan Comparison** - Diff a plan against a pinned baseline. Highlights created / updated / replaced / deleted resources and shows the estimated monthly cost delta.

**AI Chat Assistant** - Streaming LLM assistant with preset analyses (cost saving, security review, architecture overview, destruction risk). Works with any OpenAI-compatible endpoint.

**History & Sharing** - Browser-side history of loaded plans; share plans via URL-encoded deep links.

**Zip Upload** - Drop a `.zip` of a Terraform project - the sandboxed worker runs `init → plan → show -json` automatically.

## Supported Clouds

| | AWS | Azure | GCP |
|---|---|---|---|
| **Compute** | EC2, Lambda, EKS, ECS, Auto Scaling | VMs, AKS, Function App, App Service | Compute Engine, GKE, Cloud Run, Cloud Functions |
| **Database** | RDS, Aurora, ElastiCache, DynamoDB | SQL, PostgreSQL, MySQL, Redis, Cosmos DB | Cloud SQL, Spanner, Redis, Bigtable |
| **Storage** | S3, EBS (gp2/gp3/io1/io2/st1/sc1), EFS | Storage Account, Managed Disk | GCS, Persistent Disk, Filestore |
| **Networking** | VPC, NAT GW, ALB/NLB, CloudFront, Route 53 | VNet, Load Balancer | VPC, Subnets, Forwarding Rules |
| **Data** | Kinesis, SQS, SNS, Glue, Redshift, MSK | Event Hubs, Databricks, Data Factory | BigQuery, Pub/Sub, Dataflow, Composer |

## Getting Started

### Prerequisites

- Node.js 20+
- Docker + Docker Compose (for the full service stack)
- Terraform CLI 1.6+ (only required inside the Docker worker image)

### Quickstart

```bash
# 1. Clone the repo
git clone https://github.com/unrealandychan/terraform-viz.git
cd terraform-viz

# 2. Install all workspace dependencies
npm install

# 3. Start all services (web, parser, pricing, comparison, llm, worker)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and upload a `terraform show -json` output.

### Other commands

```bash
npm run typecheck   # Type-check the full monorepo
npm test            # Run tests
npm run test:coverage
npm run lint
```

### Input formats

- `terraform show -json` output - paste or upload a `.json` file
- `.zip` archive of a Terraform project directory - the worker handles `init + plan + show -json`

## Architecture

```
terraform-viz/
├── apps/
│   ├── web/                # Next.js frontend (upload, graph, cost, diff, AI chat)
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
└── pricing/
    └── data/               # aws.json · azure.json · gcp.json pricing catalogs
```

## Milestones

| Milestone | Scope | Status |
|---|---|---|
| M1 | Parse Terraform plan JSON, render 2D graph, upload flow | Shipped |
| M2 | Pricing estimation from internal JSON catalog for AWS / Azure / GCP | Shipped |
| M3 | Plan comparison, graph diff, monthly cost delta | Shipped |
| M4 | AI chat assistant with streaming LLM + preset analysis templates | Shipped |
| M5 | Zip upload via terraform worker, expanded pricing catalog, test coverage | In progress |
| M6 | CI/CD pipeline, automated testing, EBS/LB pricing accuracy improvements | In progress |

## Contributing

1. Fork the repo and create a feature branch: `git checkout -b feat/my-feature`
2. Follow [Conventional Commits](https://www.conventionalcommits.org/) for commit messages
3. Run `npm test` and `npm run lint` before pushing
4. Open a Pull Request - the CI pipeline will validate your changes automatically

## License

MIT © [unrealandychan](https://github.com/unrealandychan)
