# terraform-viz

A multi-cloud web application that parses Terraform plans and turns them into visual infrastructure graphs, estimated monthly costs, plan comparisons, and an AI chat assistant — all before you run `terraform apply`.

## Features

| Feature | Description |
|---|---|
| **Graph visualization** | Parses `terraform plan -json` output and renders an interactive 2D architecture diagram with filters by action, provider, layer, and tag |
| **Cost estimation** | Maps resource attributes to a pricing catalog and returns per-resource estimates, subtotals, and totals for AWS, Azure, and GCP |
| **Plan comparison** | Diffs a plan against a pinned baseline, highlights created / updated / replaced / deleted resources, and shows the estimated monthly cost delta |
| **AI chat** | Streaming LLM assistant with preset analyses (cost saving, security review, architecture overview, destruction risk, etc.) — works with any OpenAI-compatible endpoint |
| **History & sharing** | Keeps a browser-side history of loaded plans; share plans via URL-encoded links |
| **Zip upload** | Drop a `.zip` of a Terraform project — the worker runs `init + plan + show -json` automatically and returns the graph |

## Supported clouds

| Cloud | Compute | Database | Storage | Networking | Data / Analytics |
|---|---|---|---|---|---|
| **AWS** | EC2, Lambda, EKS, ECS, Auto Scaling | RDS, Aurora, ElastiCache, DynamoDB | S3, EBS, EFS | VPC, NAT GW, ALB/NLB, CloudFront, Route 53 | Kinesis, SQS, SNS, Glue, Redshift, MSK |
| **Azure** | VMs, AKS, Function App, App Service | SQL, PostgreSQL, MySQL, Redis, Cosmos DB | Storage Account, Managed Disk | VNet, Load Balancer | Event Hubs, Databricks, Data Factory |
| **GCP** | Compute Engine, GKE, Cloud Run, Cloud Functions | Cloud SQL, Spanner, Redis, Bigtable | GCS, Persistent Disk, Filestore | VPC, Subnets | BigQuery, Pub/Sub, Dataflow, Composer |

## Input formats

- `terraform show -json` JSON output (primary — paste or upload a `.json` file)
- `.zip` archive of a Terraform project directory (worker runs `init + plan + show -json` for you)

## Architecture

```
terraform-viz/
├── apps/
│   ├── web/               # Next.js frontend (upload, graph, cost, diff, AI chat)
│   └── terraform-worker/  # Sandboxed terraform init + plan + show -json runner
├── services/
│   ├── parser/            # Normalises Terraform JSON → cloud-agnostic GraphModel
│   ├── pricing/           # Monthly estimate engine backed by JSON catalogs
│   ├── comparison/        # Plan snapshot diffs
│   └── llm/               # LLM proxy service
├── packages/
│   ├── graph-schema/      # Shared TypeScript types (GraphModel, GraphNode, …)
│   ├── llm-types/         # Shared LLM request/response types
│   └── pricing-types/     # Shared cost estimate types
└── pricing/
    └── data/              # aws.json · azure.json · gcp.json pricing catalogs
```

## Milestones

| Milestone | Scope | Status |
|---|---|---|
| **M1** | Parse Terraform plan JSON, render 2D graph, upload flow | ✅ Shipped |
| **M2** | Pricing estimation from internal JSON catalog for AWS / Azure / GCP | ✅ Shipped |
| **M3** | Plan comparison, graph diff, monthly cost delta | ✅ Shipped |
| **M4** | AI chat assistant with streaming LLM + preset analysis templates | ✅ Shipped |
| **M5** | Zip upload via terraform worker, expanded pricing catalog, test coverage | 🚧 In progress |

## Getting started

### Prerequisites

- Node.js 20+
- Docker + Docker Compose (for the full service stack)
- Terraform CLI 1.6+ (only required inside the Docker worker image)

### Development

```bash
# Install all workspace dependencies
npm install

# Start all services (web, parser, pricing, comparison, llm, worker)
npm run dev

# Type-check the full monorepo
npm run typecheck

# Run tests
npm test
```

The web app runs on **http://localhost:3000** by default.

Service ports:

| Service | Port |
|---|---|
| web (Next.js) | 3000 |
| parser | 3001 |
| pricing | 3002 |
| comparison | 3003 |
| llm | 3004 |
| terraform-worker | 3005 |

### Environment variables

Copy `.env.example` to `.env.local` in `apps/web/` and set:

```bash
# LLM provider (any OpenAI-compatible endpoint)
LLM_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1   # or your local Ollama / vLLM URL
LLM_MODEL=gpt-4o-mini

# Service URLs (defaults match docker-compose)
PARSER_URL=http://localhost:3001
WORKER_URL=http://localhost:3005
```

## Pricing catalog

Pricing data lives in `pricing/data/` as provider-split JSON files:

- `pricing/data/aws.json`
- `pricing/data/azure.json`
- `pricing/data/gcp.json`

Each entry maps a Terraform resource type to monthly cost rules keyed by instance size, SKU, or configuration attribute. Estimates are flagged as approximate when usage-based inputs (data transfer, request counts) are unavailable.

## Contributing

See [docs/plan.md](docs/plan.md) for the full product plan and functional requirements.

## License

MIT
