import express, { type Request, type Response } from "express";
import type { GraphModel, GraphNode } from "@terraform-viz/graph-schema";
import { ConfidenceLevel, type PricingResult, type ResourceEstimate } from "@terraform-viz/pricing-types";
import { readFile } from "fs/promises";
import { join } from "path";

const PORT = Number(process.env["PORT"] ?? 3002);
const CATALOG_DIR = process.env["CATALOG_DIR"] ?? join(process.cwd(), "../../pricing/data");

const app = express();
app.use(express.json({ limit: "10mb" }));

// ── Inline cost table (mirrors apps/web/src/lib/pricing-estimates.ts) ─────────
const COST_TABLE: Record<string, (a: Record<string, unknown>) => number> = {
  // AWS Compute
  aws_instance: (a) => {
    const P: Record<string, number> = {
      "t3.nano": 3.80, "t3.micro": 7.59, "t3.small": 15.18, "t3.medium": 30.37,
      "t3.large": 60.74, "t3.xlarge": 121.47, "t3.2xlarge": 242.94,
      "m5.large": 70.08, "m5.xlarge": 140.16, "m5.2xlarge": 280.32,
      "c5.large": 62.05, "c5.xlarge": 124.10, "c5.2xlarge": 248.20,
      "r5.large": 91.98, "r5.xlarge": 183.96, "r5.2xlarge": 367.92,
    };
    return P[String(a["instance_type"] ?? "")] ?? 36.50;
  },
  aws_lambda_function: () => 5,
  aws_eks_cluster: () => 73,
  aws_eks_node_group: (a) => 70.08 * Math.max(1, Number(a["desired_size"] ?? 2)),
  aws_autoscaling_group: (a) => 70.08 * Math.max(1, Number(a["desired_capacity"] ?? 2)),
  // AWS Database
  aws_db_instance: (a) => {
    const P: Record<string, number> = {
      "db.t3.micro": 12.41, "db.t3.small": 24.82, "db.t3.medium": 49.64,
      "db.t3.large": 99.28, "db.m5.large": 124.83, "db.m5.xlarge": 249.66,
      "db.r5.large": 175.20, "db.r5.xlarge": 350.40,
    };
    return P[String(a["instance_class"] ?? "")] ?? 50;
  },
  aws_rds_cluster: () => 150,
  aws_rds_cluster_instance: (a) => {
    const P: Record<string, number> = {
      "db.t3.medium": 49.64, "db.r5.large": 175.20, "db.r5.2xlarge": 700.80,
    };
    return P[String(a["instance_class"] ?? "")] ?? 80;
  },
  aws_elasticache_cluster: (a) => {
    const P: Record<string, number> = {
      "cache.t3.micro": 11.38, "cache.t3.small": 22.76,
      "cache.m5.large": 90.52, "cache.r5.large": 132.48,
    };
    return P[String(a["node_type"] ?? "")] ?? 40;
  },
  aws_elasticache_replication_group: (a) => {
    const P: Record<string, number> = {
      "cache.t3.micro": 11.38, "cache.m5.large": 90.52, "cache.r5.large": 132.48,
    };
    return P[String(a["node_type"] ?? "")] ?? 55;
  },
  aws_dynamodb_table: () => 25,
  // AWS Storage
  aws_s3_bucket: () => 2.50,
  aws_ebs_volume: (a) => {
    const sz = Math.max(1, Number(a["size"] ?? 20));
    const type = String(a["volume_type"] ?? "gp2");
    const rates: Record<string, number> = { gp2: 0.10, gp3: 0.08, st1: 0.045, sc1: 0.025, io1: 0.125, io2: 0.125 };
    const rate = rates[type] ?? 0.10;
    let cost = sz * rate;
    if (type === "io1" || type === "io2") cost += Number(a["iops"] ?? 0) * 0.065;
    return cost;
  },
  aws_efs_file_system: () => 30,
  // AWS Containers
  aws_ecs_cluster: () => 0,
  aws_ecs_task_definition: () => 0,
  aws_ecs_service: () => 0,
  aws_lambda_event_source_mapping: () => 0,
  aws_ecs_capacity_provider: () => 0,
  aws_fargate_profile: () => 0,
  // AWS Network
  aws_vpc: () => 0,
  aws_subnet: () => 0,
  aws_internet_gateway: () => 0,
  aws_nat_gateway: () => 36.50,
  aws_lb: (a) => String(a["load_balancer_type"]) === "network" ? 13.14 : 22.27,
  aws_alb: (a) => String(a["load_balancer_type"]) === "network" ? 13.14 : 22.27,
  aws_elb: () => 20,
  aws_lb_listener: () => 0,
  aws_alb_listener: () => 0,
  aws_lb_target_group: () => 0,
  aws_alb_target_group: () => 0,
  aws_security_group: () => 0,
  aws_security_group_rule: () => 0,
  aws_route_table: () => 0,
  aws_route_table_association: () => 0,
  aws_route53_zone: () => 0.50,
  aws_route53_record: () => 0,
  aws_cloudfront_distribution: () => 10,
  aws_cloudfront_origin_access_control: () => 0,
  aws_cloudfront_origin_access_identity: () => 0,
  aws_eip: () => 0,
  aws_vpc_endpoint: () => 0,
  // AWS API Gateway
  aws_apigatewayv2_api: () => 1.00,
  aws_apigatewayv2_stage: () => 0,
  aws_apigatewayv2_integration: () => 0,
  aws_apigatewayv2_route: () => 0,
  aws_api_gateway_rest_api: () => 5.00,
  aws_api_gateway_stage: () => 0,
  aws_api_gateway_resource: () => 0,
  aws_api_gateway_method: () => 0,
  aws_api_gateway_integration: () => 0,
  aws_api_gateway_deployment: () => 0,
  aws_api_gateway_domain_name: () => 0,
  // AWS Observability
  aws_cloudwatch_log_group: () => 2.50,
  aws_cloudwatch_metric_alarm: () => 0.10,
  aws_cloudwatch_dashboard: () => 3.00,
  aws_cloudwatch_log_metric_filter: () => 0,
  aws_cloudwatch_event_rule: () => 0,
  aws_cloudwatch_event_target: () => 0,
  // AWS Security / IAM
  aws_acm_certificate: () => 0,
  aws_acm_certificate_validation: () => 0,
  aws_iam_role: () => 0,
  aws_iam_role_policy: () => 0,
  aws_iam_role_policy_attachment: () => 0,
  aws_iam_policy: () => 0,
  aws_iam_instance_profile: () => 0,
  aws_iam_user: () => 0,
  aws_iam_group: () => 0,
  aws_iam_group_membership: () => 0,
  aws_kms_key: () => 1.00,
  aws_kms_alias: () => 0,
  aws_secretsmanager_secret: () => 0.40,
  aws_secretsmanager_secret_version: () => 0,
  aws_ssm_parameter: () => 0,
  // AWS S3 config
  aws_s3_bucket_website_configuration: () => 0,
  aws_s3_bucket_versioning: () => 0,
  aws_s3_bucket_policy: () => 0,
  aws_s3_bucket_public_access_block: () => 0,
  aws_s3_bucket_ownership_controls: () => 0,
  aws_s3_bucket_cors_configuration: () => 0,
  aws_s3_bucket_lifecycle_configuration: () => 0,
  aws_s3_bucket_notification: () => 0,
  aws_s3_bucket_acl: () => 0,
  aws_s3_object: () => 0,
  // AWS Data
  aws_kinesis_stream: () => 15,
  aws_kinesis_firehose_delivery_stream: () => 10,
  aws_sqs_queue: () => 0.40,
  aws_sns_topic: () => 0.50,
  aws_glue_job: () => 44,
  aws_glue_catalog_database: () => 1,
  aws_redshift_cluster: () => 180,
  aws_msk_cluster: () => 350,
  // AWS SageMaker (Issue #6)
  aws_sagemaker_endpoint: () => 156,
  aws_sagemaker_endpoint_configuration: () => 0,
  aws_sagemaker_model: () => 0,
  aws_sagemaker_training_job: () => 200,
  // AWS AppRunner (Issue #6)
  aws_apprunner_service: () => 25,
  awscc_apprunner_service: () => 25,
  // Azure Compute
  azurerm_kubernetes_cluster: () => 73,
  azurerm_kubernetes_cluster_node_pool: (a) => 70 * Math.max(1, Number(a["node_count"] ?? 2)),
  azurerm_virtual_machine: () => 70,
  azurerm_linux_virtual_machine: () => 70,
  azurerm_windows_virtual_machine: () => 90,
  azurerm_function_app: () => 5,
  azurerm_app_service_plan: () => 55,
  azurerm_app_service: () => 5,
  // Azure Database
  azurerm_sql_server: () => 0,
  azurerm_mssql_database: () => 150,
  azurerm_postgresql_server: () => 90,
  azurerm_postgresql_flexible_server: () => 95,
  azurerm_mysql_server: () => 80,
  azurerm_redis_cache: () => 55,
  azurerm_cosmosdb_account: () => 25,
  // Azure Storage
  azurerm_storage_account: () => 20,
  azurerm_managed_disk: (a) => Math.max(1, Number(a["disk_size_gb"] ?? 128)) * 0.10,
  // Azure Networking
  azurerm_resource_group: () => 0,
  azurerm_virtual_network: () => 0,
  azurerm_subnet: () => 0,
  azurerm_network_interface: () => 0,
  azurerm_network_security_group: () => 0,
  azurerm_network_security_rule: () => 0,
  azurerm_public_ip: () => 3.65,
  azurerm_load_balancer: () => 18.25,
  azurerm_load_balancer_backend_address_pool: () => 0,
  azurerm_load_balancer_rule: () => 0,
  azurerm_load_balancer_probe: () => 0,
  azurerm_dns_zone: () => 0.90,
  azurerm_dns_a_record: () => 0,
  // Azure Security / IAM
  azurerm_key_vault: () => 5.00,
  azurerm_key_vault_secret: () => 0,
  azurerm_key_vault_key: () => 0,
  azurerm_role_assignment: () => 0,
  azurerm_user_assigned_identity: () => 0,
  // Azure Messaging
  azurerm_servicebus_namespace: () => 10,
  azurerm_servicebus_queue: () => 0,
  azurerm_servicebus_topic: () => 0,
  azurerm_eventgrid_topic: () => 0.60,
  azurerm_eventgrid_event_subscription: () => 0.60,
  // Azure Data
  azurerm_eventhub_namespace: () => 22,
  azurerm_eventhub: () => 0,
  azurerm_databricks_workspace: () => 150,
  azurerm_data_factory: () => 10,
  azurerm_stream_analytics_job: () => 80,
  // Azure AI / Containers (Issue #6)
  azurerm_application_gateway: () => 55,
  azurerm_container_registry: () => 5,
  azurerm_container_group: () => 30,
  azurerm_cognitive_account: () => 10,
  // GCP Compute
  google_container_cluster: () => 73,
  google_container_node_pool: (a) => 50 * Math.max(1, Number(a["initial_node_count"] ?? 2)),
  google_compute_instance: () => 50,
  google_cloud_run_service: () => 5,
  google_cloudfunctions_function: () => 5,
  // GCP Database
  google_sql_database_instance: () => 100,
  google_spanner_instance: () => 300,
  google_redis_instance: () => 55,
  google_bigtable_instance: () => 200,
  // GCP Storage
  google_storage_bucket: () => 2.50,
  google_compute_disk: (a) => Math.max(1, Number(a["size"] ?? 50)) * 0.04,
  google_filestore_instance: () => 200,
  // GCP Networking
  google_compute_network: () => 0,
  google_compute_subnetwork: () => 0,
  google_compute_router: () => 0,
  google_compute_address: () => 7.30,
  google_compute_global_address: () => 7.30,
  google_compute_firewall: () => 0,
  google_compute_forwarding_rule: () => 18.25,
  google_compute_url_map: () => 0,
  google_compute_backend_service: () => 0,
  google_compute_health_check: () => 0,
  google_compute_target_https_proxy: () => 0,
  google_compute_managed_ssl_certificate: () => 0,
  google_dns_managed_zone: () => 0.20,
  google_dns_record_set: () => 0,
  // GCP Security / IAM
  google_service_account: () => 0,
  google_service_account_iam_binding: () => 0,
  google_project_iam_binding: () => 0,
  google_project_iam_member: () => 0,
  google_secret_manager_secret: () => 0.06,
  google_secret_manager_secret_version: () => 0,
  google_kms_key_ring: () => 0,
  google_kms_crypto_key: () => 6.00,
  // GCP Data
  google_bigquery_dataset: () => 5,
  google_bigquery_table: () => 5,
  google_pubsub_topic: () => 0.40,
  google_pubsub_subscription: () => 0.40,
  google_dataflow_job: () => 100,
  google_composer_environment: () => 400,
  // GCP AI / Artifact Registry (Issue #6)
  google_artifact_registry_repository: () => 1,
  google_cloud_run_v2_service: () => 5,
  google_vertex_ai_endpoint: () => 150,
  google_notebooks_instance: () => 100,
};

// ── Inline breakdown table ─────────────────────────────────────────────────────
const BREAKDOWN_TABLE: Record<string, (a: Record<string, unknown>) => string> = {
  aws_sagemaker_endpoint: () => "ml.t3.medium × 730 hr est.",
  aws_sagemaker_endpoint_configuration: () => "free — billed via endpoint",
  aws_sagemaker_model: () => "free — model artifact storage only",
  aws_sagemaker_training_job: () => "ml.m5.xlarge × ≈100 hr/mo est.",
  aws_ecs_capacity_provider: () => "free — capacity provider itself has no charge",
  aws_fargate_profile: () => "free — Fargate compute billed via ECS tasks",
  aws_apprunner_service: () => "1 vCPU × 2 GB RAM × ≈730 hr est.",
  awscc_apprunner_service: () => "1 vCPU × 2 GB RAM × ≈730 hr est.",
  azurerm_application_gateway: () => "WAF_v2 Small, 1 instance × $0.075/hr est.",
  azurerm_container_registry: () => "Basic tier est.",
  azurerm_container_group: () => "1 vCPU × 1.5 GB × 730 hr est.",
  azurerm_cognitive_account: () => "S0 tier est.",
  google_artifact_registry_repository: () => "≈10 GB × $0.10/GB est.",
  google_cloud_run_v2_service: () => "≈1M req/mo est.",
  google_vertex_ai_endpoint: () => "n1-standard-4 × 730 hr est.",
  google_notebooks_instance: () => "n1-standard-4 Notebooks est.",
};

function estimateNode(node: GraphNode): { monthlyCostUsd: number; breakdown: string; confidence: ConfidenceLevel } {
  const fn = COST_TABLE[node.type];
  const attrs = (node.attributes ?? {}) as Record<string, unknown>;
  if (!fn) {
    return { monthlyCostUsd: 0, breakdown: "unknown resource type — defaulting to $0", confidence: ConfidenceLevel.UNKNOWN };
  }
  const monthlyCostUsd = fn(attrs);
  const bfn = BREAKDOWN_TABLE[node.type];
  const breakdown = bfn ? bfn(attrs) : (monthlyCostUsd === 0 ? "free" : "est.");
  return { monthlyCostUsd, breakdown, confidence: ConfidenceLevel.ESTIMATED };
}

app.get("/health", (_req: Request, response: Response): void => {
  response.json({ status: "ok", service: "pricing" });
});

// POST /estimate
// Body: { model: GraphModel }
// Returns: PricingResult
app.post("/estimate", async (request: Request, response: Response): Promise<void> => {
  const body = request.body as { model?: GraphModel };
  if (!body.model) {
    response.status(400).json({ error: "Missing model in request body" });
    return;
  }

  try {
    const catalogPath = join(CATALOG_DIR, "aws.json");
    await readFile(catalogPath, "utf-8");
  } catch {
    // Catalog may not exist yet in development
  }

  const model = body.model;
  const resources: ResourceEstimate[] = model.nodes.map((node) => {
    const { monthlyCostUsd, breakdown, confidence } = estimateNode(node);
    return {
      nodeId: node.id,
      resourceType: node.type,
      resourceName: node.name ?? node.id,
      monthlyCostUsd,
      breakdown: [{ label: breakdown, unitCost: monthlyCostUsd, quantity: 1, unit: "mo" }],
      confidence,
      missingInputs: [],
    };
  });

  const totalMonthlyCostUsd = resources.reduce((sum, r) => sum + r.monthlyCostUsd, 0);
  const hasLowConfidenceEstimates = resources.some((r) => r.confidence === ConfidenceLevel.UNKNOWN);

  const subtotalByLayer: Record<string, number> = {};
  for (const node of model.nodes) {
    const layer = node.layer ?? "unknown";
    const cost = resources.find((r) => r.nodeId === node.id)?.monthlyCostUsd ?? 0;
    subtotalByLayer[layer] = (subtotalByLayer[layer] ?? 0) + cost;
  }

  const result: PricingResult = {
    provider: (model.nodes[0]?.provider ?? "UNKNOWN") as PricingResult["provider"],
    estimatedAt: new Date().toISOString(),
    resources,
    subtotalByLayer,
    totalMonthlyCostUsd,
    hasLowConfidenceEstimates,
  };

  response.json(result);
});

app.listen(PORT, () => {
  process.stdout.write(`[pricing] listening on port ${PORT}\n`);
});
