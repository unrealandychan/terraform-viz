Here’s a cleaner rewritten product plan: build a web app that parses Terraform plans, renders infrastructure graphs, estimates pricing from a maintained pricing JSON, compares plan updates, and gives fast LLM recommendations across AWS, Azure, and GCP for a defined set of major resources in Phase 1. Terraform plan output is a strong foundation because it provides structured change data, and cost-diff workflows like Infracost already prove the value of comparing proposed updates before apply. [developer.hashicorp](https://developer.hashicorp.com/terraform/cli/commands/plan)

## Product plan

### Goal

Build a multi-cloud web application that helps engineers understand Terraform infrastructure before deployment by turning Terraform input into a visual graph, estimated cost output, change comparison, and actionable recommendations. Terraform plan JSON is well-suited for this because it exposes the intended infrastructure changes in a structured format instead of raw HCL text. [developer.hashicorp](https://developer.hashicorp.com/terraform/internals/json-format)

### Phase 1 scope

Phase 1 will support AWS, Azure, and GCP for a curated list of major Terraform-managed resources, rather than trying to cover every service on day one. HCP Terraform and Infracost both show that broad-but-incomplete provider coverage is a practical starting point for cost estimation products. [github](https://github.com/infracost/infracost)

### Core features

1. **Terraform input to graph and price prediction**  
The app accepts Terraform input, preferably `terraform plan` JSON or `terraform show -json` output, parses resources and dependencies, and generates an infrastructure graph plus an estimated monthly price. The initial pricing engine can rely on a maintained internal JSON catalog that maps resource types and size attributes to pricing rules. [developer.hashicorp](https://developer.hashicorp.com/terraform/cli/commands/plan)

2. **Compare Terraform updates with previous output**  
The app compares a new Terraform plan against a previous plan or baseline output and highlights created, changed, replaced, and destroyed resources, along with estimated cost deltas. Terraform plans are designed to preview these changes, and cost-diff workflows like `infracost diff` show that this comparison model works well in CI and review flows. [oneuptime](https://oneuptime.com/blog/post/2026-01-26-infracost-iac-cost/view)

3. **Fast LLM recommendations**  
The app provides quick LLM-generated recommendations based on the parsed plan, graph structure, and price estimate, such as cost reduction ideas, reliability improvements, or architecture enhancements. Infracost’s guidance around cheaper or better-performing options, such as storage or instance upgrades, shows the value of this recommendation layer on top of raw cost data. [github](https://github.com/infracost/infracost)

4. **Multi-cloud support in Phase 1**  
The app supports at least AWS, Azure, and GCP for major resources in Phase 1, using a provider abstraction layer so the graph engine stays generic while the pricing and normalization logic remains provider-specific. Existing cost estimation coverage across AWS, Azure, and GCP in tools like Infracost and HCP Terraform supports this phased multi-cloud approach. [developer.hashicorp](https://developer.hashicorp.com/terraform/cloud-docs/workspaces/cost-estimation/azure)

## Functional requirements

### Input layer

The system should accept:
- Raw Terraform project uploads.
- Terraform plan files converted to JSON.
- Optionally pasted HCL for small experiments, but plan JSON should be the primary input. Terraform JSON output is the most reliable structured source for downstream parsing and comparison. [developer.hashicorp](https://developer.hashicorp.com/terraform/internals/json-format)

### Graph engine

The graph engine should:
- Parse resources, modules, addresses, and dependencies.
- Group resources into logical layers such as network, compute, database, and storage.
- Render a simplified architecture view rather than the full noisy dependency graph. Native Terraform graph output can be hard to read, which is why simplified visual tools exist. [spacelift](https://spacelift.io/blog/terraform-graph)

### Pricing engine

The pricing engine should:
- Use a maintained pricing JSON as the initial source of truth.
- Map Terraform resource attributes to pricing rules.
- Return per-resource monthly estimates, grouped subtotals, and overall totals.
- Mark unknown or low-confidence estimates when usage assumptions are missing. Tools across clouds already show that some resource costs are estimable directly while others depend on traffic or consumption behavior. [developer.hashicorp](https://developer.hashicorp.com/terraform/cloud-docs/workspaces/cost-estimation/gcp)

### Comparison engine

The comparison engine should:
- Compare current plan output against a saved prior snapshot.
- Show resource-level diffs and graph diffs.
- Calculate estimated monthly cost delta.
- Provide summaries such as “new NAT gateway adds cost” or “instance class change reduces spend.” Terraform plan and cost-diff tools already follow this baseline-versus-change pattern. [oneuptime](https://oneuptime.com/blog/post/2026-01-26-infracost-iac-cost/view)

### Recommendation engine

The recommendation engine should:
- Generate concise LLM suggestions in under a few seconds.
- Classify advice into cost cut, performance enhancement, reliability, and security.
- Use deterministic rules first for obvious optimizations, then LLM summarization second.
- Explain whether a suggestion is based on pricing data, Terraform diff, or architectural heuristics. Cost tools already provide structured optimization hints, which makes them a good foundation for LLM-generated advice. [github](https://github.com/infracost/infracost)

## Phase 1 provider coverage

A realistic Phase 1 should focus on high-value, common resources across the three clouds:

| Cloud | Phase 1 resource focus |
|---|---|
| AWS | EC2, EBS, ALB/NLB, RDS, VPC/NAT, S3, EKS node groups.  [github](https://github.com/infracost/infracost) |
| Azure | Virtual Machines, Managed Disks, Load Balancer, Virtual Network/Subnets, Azure SQL basics, Storage Accounts.  [developer.hashicorp](https://developer.hashicorp.com/terraform/cloud-docs/workspaces/cost-estimation/azure) |
| GCP | Compute Engine, Persistent Disk, Load Balancing basics, VPC/Subnets, Cloud SQL, GKE node pools.  [developer.hashicorp](https://developer.hashicorp.com/terraform/cloud-docs/workspaces/cost-estimation/gcp) |

This keeps the first release practical while covering the resources most teams expect to see in Terraform-managed infrastructure. HCP Terraform’s provider-specific cost support pages reflect this kind of selective coverage model. [developer.hashicorp](https://developer.hashicorp.com/terraform/cloud-docs/workspaces/cost-estimation/azure)

## Suggested system design

The application can be split into these services:
- **Frontend web app** for upload, graph view, diff view, and recommendation panel.
- **Terraform worker** to run `terraform init`, `plan`, and `show -json` in isolation.
- **Parser service** to normalize Terraform JSON into a cloud-agnostic graph schema.
- **Pricing service** to read the internal pricing JSON and compute estimates.
- **Comparison service** to diff current and previous outputs.
- **LLM service** to generate recommendations from structured graph and cost summaries. Terraform plan JSON is a stable base for this decomposition because it cleanly separates planning, parsing, and analysis. [developer.hashicorp](https://developer.hashicorp.com/terraform/cli/commands/plan)

## Delivery plan

### Milestone 1
Support upload of Terraform plan JSON, parse resources, and render a graph with no pricing yet. Terraform plan output already exposes the key information needed for a first parser and UI. [developer.hashicorp](https://developer.hashicorp.com/terraform/internals/json-format)

### Milestone 2
Add pricing estimation from an internal JSON catalog for a limited set of AWS, Azure, and GCP resources. This follows the practical selective-coverage model used by existing cost estimation tools. [developer.hashicorp](https://developer.hashicorp.com/terraform/cloud-docs/workspaces/cost-estimation/gcp)

### Milestone 3
Add plan comparison, graph diff, and monthly cost delta reporting. Cost diff is a proven review workflow in Terraform pipelines. [oneuptime](https://oneuptime.com/blog/post/2026-01-26-infracost-iac-cost/view)

### Milestone 4
Add fast recommendation generation using rules plus LLM summarization for cost reduction and architecture improvements. Structured cost recommendations are already useful on their own, and LLMs can make them easier to consume. [github](https://github.com/infracost/infracost)

## Rewritten short form

You can use this as the polished version of your plan:

> Build a web application that parses Terraform plans and converts them into a visual infrastructure graph with estimated monthly pricing. The first release will use a maintained pricing JSON catalog for major AWS, Azure, and GCP resources. The application will compare Terraform updates against previous outputs to show infrastructure diffs and cost deltas. It will also provide fast LLM-generated recommendations for cost reduction and architecture improvements based on the plan, graph, and pricing results. Phase 1 will focus on major resources across AWS, Azure, and GCP, with deeper service coverage added later.

If you want, I can turn this into a sharper **PRD format** next, with:
- vision
- user stories
- MVP / non-MVP
- architecture
- milestones
- risks
