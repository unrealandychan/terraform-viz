import express, { type Request, type Response } from "express";
import type { GraphModel, GraphNode } from "@terraform-viz/graph-schema";
import { ChangeAction } from "@terraform-viz/graph-schema";

const PORT = Number(process.env["PORT"] ?? 3003);
const PRICING_URL = process.env["PRICING_URL"] ?? "http://localhost:3002";

const app = express();
app.use(express.json({ limit: "20mb" }));

app.get("/health", (_req: Request, response: Response): void => {
  response.json({ status: "ok", service: "comparison" });
});

// ── Fallback cost table (used when pricing service is unavailable) ────────────
// Flat defaults only — usage-based resources fall back to 0 rather than wrong
// values from a stale table.
const MONTHLY_DEFAULTS_FALLBACK: Record<string, number> = {
  aws_instance: 36.50,
  aws_eks_cluster: 73,
  aws_eks_node_group: 140.16,
  aws_autoscaling_group: 140.16,
  aws_db_instance: 50,
  aws_rds_cluster: 150,
  aws_elasticache_cluster: 40,
  aws_elasticsearch_domain: 90,
  aws_opensearch_domain: 90,
  aws_cloudfront_distribution: 10,
  aws_alb: 22.27,
  aws_lb: 22.27,
  aws_elb: 20,
  aws_nat_gateway: 36.50,
  aws_route53_zone: 0.50,
  aws_ecs_cluster: 0,
  aws_ecs_service: 0,
  aws_ecs_task_definition: 0,
  aws_kms_key: 1.00,
  aws_secretsmanager_secret: 0.40,
  aws_cloudwatch_metric_alarm: 0.10,
  aws_cloudwatch_dashboard: 3.00,
  aws_sagemaker_endpoint: 156,
  aws_apprunner_service: 25,
  // Azure
  google_container_cluster: 73,
  google_sql_database_instance: 100,
  google_compute_instance: 50,
  azurerm_virtual_machine: 70,
  azurerm_kubernetes_cluster: 140,
  azurerm_mssql_database: 150,
  azurerm_storage_account: 20,
  azurerm_app_service_plan: 50,
  azurerm_key_vault: 5.00,
  azurerm_load_balancer: 18.25,
  azurerm_public_ip: 3.65,
};

function roughMonthlyFallback(node: GraphNode): number {
  return MONTHLY_DEFAULTS_FALLBACK[node.type] ?? 0;
}

// ── Call pricing service for accurate cost estimates ─────────────────────────
async function estimateViaPricingService(nodes: GraphNode[]): Promise<Map<string, number>> {
  try {
    const fakeModel = { nodes, edges: [] };
    const res = await fetch(`${PRICING_URL}/estimate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: fakeModel }),
    });
    if (!res.ok) throw new Error(`pricing service error: ${res.status}`);
    const data = await res.json() as { resources: Array<{ nodeId: string; monthlyCostUsd: number }> };
    const map = new Map<string, number>();
    for (const r of data.resources) map.set(r.nodeId, r.monthlyCostUsd);
    return map;
  } catch {
    // Pricing service unavailable — caller will use fallback
    return new Map();
  }
}

// POST /diff
// Body: { current: GraphModel; previous: GraphModel }
app.post("/diff", (request: Request, response: Response): void => {
  const body = request.body as { current?: GraphModel; previous?: GraphModel };

  if (!body.current || !body.previous) {
    response.status(400).json({ error: "Both current and previous plan models are required" });
    return;
  }

  const previousByAddr = new Map(body.previous.nodes.map((n) => [n.address, n]));
  const currentByAddr = new Map(body.current.nodes.map((n) => [n.address, n]));

  const created = body.current.nodes.filter((n) => !previousByAddr.has(n.address)).map((n) => n.address);
  const deleted = body.previous.nodes.filter((n) => !currentByAddr.has(n.address)).map((n) => n.address);
  const changed = body.current.nodes
    .filter((n) => previousByAddr.has(n.address) && n.changeAction !== ChangeAction.NO_OP)
    .map((n) => n.address);

  const allNodes = [...body.current.nodes, ...body.previous.nodes];

  void estimateViaPricingService(allNodes).then((priceMap) => {
    const usePricing = priceMap.size > 0;

    const currentTotal = body.current!.nodes.reduce((s, n) => {
      return s + (usePricing ? (priceMap.get(n.id) ?? roughMonthlyFallback(n)) : roughMonthlyFallback(n));
    }, 0);
    const previousTotal = body.previous!.nodes.reduce((s, n) => {
      return s + (usePricing ? (priceMap.get(n.id) ?? roughMonthlyFallback(n)) : roughMonthlyFallback(n));
    }, 0);
    const costDeltaUsd = parseFloat((currentTotal - previousTotal).toFixed(2));

    response.json({
      createdAt: new Date().toISOString(),
      created,
      changed,
      deleted,
      replaced: [],
      costDeltaUsd,
      summary: `+${created.length} added, ~${changed.length} changed, -${deleted.length} removed · $${costDeltaUsd >= 0 ? "+" : ""}${costDeltaUsd}/mo`,
    });
  });
});

app.listen(PORT, () => {
  process.stdout.write(`[comparison] listening on port ${PORT}\n`);
});
