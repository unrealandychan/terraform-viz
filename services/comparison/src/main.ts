import express, { type Request, type Response } from "express";
import type { GraphModel, GraphNode } from "@terraform-viz/graph-schema";
import { ChangeAction } from "@terraform-viz/graph-schema";

const PORT = Number(process.env["PORT"] ?? 3003);

const app = express();
app.use(express.json({ limit: "20mb" }));

app.get("/health", (_req: Request, response: Response): void => {
  response.json({ status: "ok", service: "comparison" });
});

// ── Minimal cost table mirrored from apps/web/src/lib/pricing-estimates.ts ──
// Keep in sync with the frontend pricing table for consistent server-side deltas.
const MONTHLY_DEFAULTS: Record<string, number> = {
  aws_instance: 36.50,
  aws_lambda_function: 5,
  aws_eks_cluster: 73,
  aws_eks_node_group: 140.16,
  aws_autoscaling_group: 140.16,
  aws_db_instance: 50,
  aws_rds_cluster: 150,
  aws_elasticache_cluster: 25,
  aws_elasticsearch_domain: 150,
  aws_opensearch_domain: 150,
  aws_s3_bucket: 5,
  aws_cloudfront_distribution: 20,
  aws_alb: 20,
  aws_lb: 20,
  aws_elb: 20,
  aws_nat_gateway: 45,
  aws_vpc_endpoint: 10,
  aws_route53_zone: 1,
  aws_api_gateway_rest_api: 10,
  aws_apigatewayv2_api: 10,
  aws_sqs_queue: 1,
  aws_sns_topic: 1,
  aws_kinesis_stream: 15,
  aws_dynamodb_table: 10,
  google_container_cluster: 73,
  google_container_node_pool: 140.16,
  google_sql_database_instance: 50,
  google_compute_instance: 36.50,
  google_storage_bucket: 5,
  google_pubsub_topic: 1,
  azurerm_virtual_machine: 36.50,
  azurerm_kubernetes_cluster: 73,
  azurerm_sql_server: 50,
  azurerm_storage_account: 5,
  azurerm_app_service: 50,
};

function roughMonthly(node: GraphNode): number {
  return MONTHLY_DEFAULTS[node.type] ?? 0;
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

  const currentTotal = body.current.nodes.reduce((s, n) => s + roughMonthly(n), 0);
  const previousTotal = body.previous.nodes.reduce((s, n) => s + roughMonthly(n), 0);
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

app.listen(PORT, () => {
  process.stdout.write(`[comparison] listening on port ${PORT}\n`);
});
