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
  // AWS SageMaker (Issue #6)
  aws_sagemaker_endpoint: () => 156,
  aws_sagemaker_endpoint_configuration: () => 0,
  aws_sagemaker_model: () => 0,
  aws_sagemaker_training_job: () => 200,
  // AWS AppRunner (Issue #6)
  aws_apprunner_service: () => 25,
  awscc_apprunner_service: () => 25,
  // Azure Compute
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

  // ── AWS: Compute / Containers ─────────────────────────────────────────────
  aws_elasticbeanstalk_environment: () => 35,
  aws_elasticbeanstalk_application: () => 0,
  aws_batch_compute_environment: () => 70,
  aws_batch_job_queue: () => 0,
  aws_batch_job_definition: () => 0,
  aws_workspaces_workspace: () => 35,

  // ── AWS: Data / Analytics ─────────────────────────────────────────────────
  aws_redshift_cluster: (a) => Math.max(1, Number(a["number_of_nodes"] ?? 1)) * 180,
  aws_redshift_serverless_workgroup: () => 360,
  aws_opensearch_domain: (a) => Math.max(1, Number((a["cluster_config"] as Record<string,unknown>)?.["instance_count"] ?? 1)) * 90,
  aws_elasticsearch_domain: (a) => Math.max(1, Number((a["cluster_config"] as Record<string,unknown>)?.["instance_count"] ?? 1)) * 90,
  aws_msk_cluster: (a) => Math.max(1, Number(a["number_of_broker_nodes"] ?? 3)) * 55,
  aws_msk_serverless_cluster: () => 60,
  aws_kinesis_stream: (a) => Math.max(1, Number(a["shard_count"] ?? 1)) * 10.95,
  aws_kinesis_firehose_delivery_stream: () => 25,
  aws_kinesis_analytics_application: () => 110,
  aws_kinesisanalyticsv2_application: () => 110,
  aws_glue_job: () => 50,
  aws_glue_catalog_database: () => 0,
  aws_glue_catalog_table: () => 0,
  aws_glue_crawler: () => 5,
  aws_emr_cluster: (a) => Math.max(1, Number((a["core_instance_group"] as Record<string,unknown>)?.["instance_count"] ?? 2)) * 70,
  aws_athena_workgroup: () => 5,
  aws_dax_cluster: (a) => Math.max(1, Number(a["replication_factor"] ?? 1)) * 100,

  // ── AWS: Messaging / Workflow ─────────────────────────────────────────────
  aws_sqs_queue: () => 0.40,
  aws_sqs_queue_policy: () => 0,
  aws_sns_topic: () => 0.50,
  aws_sns_topic_subscription: () => 0,
  aws_sns_topic_policy: () => 0,
  aws_mq_broker: (a) => String(a["engine_type"] ?? "ActiveMQ").toLowerCase().includes("rabbit") ? 60 : 80,
  aws_sfn_state_machine: () => 1.00,
  aws_step_functions_state_machine: () => 1.00,

  // ── AWS: Security / Auth ─────────────────────────────────────────────────
  aws_wafv2_web_acl: () => 5.00,
  aws_wafv2_rule_group: () => 1.00,
  aws_wafv2_web_acl_association: () => 0,
  aws_wafv2_ip_set: () => 0,
  aws_cognito_user_pool: () => 1,
  aws_cognito_user_pool_client: () => 0,
  aws_cognito_identity_pool: () => 0,
  aws_shield_protection: () => 3000,
  aws_shield_protection_group: () => 0,

  // ── AWS: DevOps / CI-CD ───────────────────────────────────────────────────
  aws_codebuild_project: () => 10,
  aws_codepipeline: () => 1.00,
  aws_codecommit_repository: () => 0,
  aws_codedeploy_app: () => 0,
  aws_codedeploy_deployment_group: () => 0,
  aws_transfer_server: () => 216,
  aws_transfer_workflow: () => 0,
  aws_backup_plan: () => 5,
  aws_backup_vault: () => 0,
  aws_backup_selection: () => 0,

  // ── Azure: Compute / PaaS ────────────────────────────────────────────────
  azurerm_linux_virtual_machine: (a) => {
    const size = String(a["size"] ?? "Standard_B2s").toLowerCase();
    if (size.includes("_b1s")) return 7.59;
    if (size.includes("_b2s") || size.includes("_b2ms")) return 30.37;
    if (size.includes("_d2s") || size.includes("_d2_v")) return 70.08;
    if (size.includes("_d4s") || size.includes("_d4_v")) return 140.16;
    if (size.includes("_d8s") || size.includes("_d8_v")) return 280.32;
    return 50;
  },
  azurerm_windows_virtual_machine: (a) => {
    const size = String(a["size"] ?? "Standard_B2s").toLowerCase();
    if (size.includes("_b2s") || size.includes("_b2ms")) return 50;
    if (size.includes("_d2s") || size.includes("_d2_v")) return 100;
    if (size.includes("_d4s") || size.includes("_d4_v")) return 200;
    return 80;
  },
  azurerm_virtual_machine: (a) => String(a["vm_size"] ?? "").toLowerCase().includes("_d4") ? 140 : 70,
  azurerm_kubernetes_cluster: (a) => Math.max(1, Number((a["default_node_pool"] as Record<string,unknown>)?.["node_count"] ?? 2)) * 70,
  azurerm_kubernetes_cluster_node_pool: (a) => Math.max(1, Number(a["node_count"] ?? 1)) * 70,
  azurerm_app_service_plan: (a) => {
    const sku = String(a["sku_name"] ?? (a["sku"] as Record<string,unknown>)?.["tier"] ?? "B1").toUpperCase();
    if (sku.startsWith("F") || sku === "FREE") return 0;
    if (sku.startsWith("D1") || sku === "SHARED") return 9.49;
    if (sku.startsWith("B1")) return 13.14;
    if (sku.startsWith("B2")) return 26.28;
    if (sku.startsWith("B3")) return 52.56;
    if (sku.startsWith("S1")) return 73.00;
    if (sku.startsWith("S2")) return 146.00;
    if (sku.startsWith("P1")) return 83.95;
    if (sku.startsWith("P2")) return 167.90;
    return 50;
  },
  azurerm_app_service: () => 0,
  azurerm_linux_web_app: () => 0,
  azurerm_windows_web_app: () => 0,
  azurerm_function_app: () => 0,
  azurerm_linux_function_app: () => 0,
  azurerm_windows_function_app: () => 0,
  azurerm_container_app: () => 15,
  azurerm_container_app_environment: () => 0,

  // ── Azure: Analytics / Data ───────────────────────────────────────────────
  azurerm_synapse_workspace: () => 150,
  azurerm_synapse_sql_pool: (a) => Math.max(100, Number(String(a["sku_name"] ?? "100").replace(/\D/g, "") || 100)) * 1.20,
  azurerm_synapse_spark_pool: () => 50,
  azurerm_hdinsight_hadoop_cluster: () => 200,
  azurerm_hdinsight_spark_cluster: () => 200,
  azurerm_search_service: (a) => {
    const sku = String(a["sku"] ?? "basic").toLowerCase();
    if (sku === "free") return 0;
    if (sku === "standard") return 250;
    return 75;
  },
  azurerm_log_analytics_workspace: () => 25,
  azurerm_monitor_diagnostic_setting: () => 0,
  azurerm_application_insights: () => 10,

  // ── Azure: Integration / API ──────────────────────────────────────────────
  azurerm_api_management: (a) => {
    const sku = String(a["sku_name"] ?? "Consumption").toLowerCase();
    if (sku.includes("consumption")) return 0;
    if (sku.includes("developer")) return 50;
    if (sku.includes("standard")) return 700;
    return 140;
  },
  azurerm_logic_app_workflow: () => 10,
  azurerm_logic_app_standard: () => 40,
  azurerm_signalr_service: (a) => String(a["sku"] ?? "Free_F1").toLowerCase().includes("free") ? 0 : 50,
  azurerm_cdn_profile: () => 0,
  azurerm_cdn_endpoint: () => 8,
  azurerm_frontdoor: () => 35,
  azurerm_frontdoor_firewall_policy: () => 0,

  // ── Azure: AI / IoT ───────────────────────────────────────────────────────
  azurerm_machine_learning_workspace: () => 50,
  azurerm_iot_hub: (a) => {
    const sku = String((a["sku"] as Record<string,unknown>)?.["name"] ?? "S1").toUpperCase();
    if (sku === "F1") return 0;
    if (sku === "B1") return 10;
    if (sku === "S2") return 250;
    if (sku === "S3") return 2500;
    return 25;
  },
  azurerm_iothub: (a) => {
    const sku = String((a["sku"] as Record<string,unknown>)?.["name"] ?? "S1").toUpperCase();
    return sku === "S2" ? 250 : sku === "S3" ? 2500 : 25;
  },

  // ── GCP: Compute / Data ───────────────────────────────────────────────────
  google_dataproc_cluster: (a) => Math.max(2, Number((((a["cluster_config"] as Record<string,unknown>)?.["worker_config"]) as Record<string,unknown>)?.["num_instances"] ?? 2)) * 70,
  google_alloydb_cluster: () => 300,
  google_alloydb_instance: () => 300,
  google_datastream_stream: () => 50,

  // ── GCP: Operations / DevOps ──────────────────────────────────────────────
  google_cloudbuild_trigger: () => 0,
  google_monitoring_alert_policy: () => 0,
  google_monitoring_uptime_check_config: () => 0,
  google_logging_metric: () => 0,
  google_cloud_tasks_queue: () => 1.00,
  google_cloud_scheduler_job: () => 0.10,

  // ── GCP: AI / IoT ────────────────────────────────────────────────────────
  google_healthcare_dataset: () => 10,
  google_healthcare_fhir_store: () => 10,
  google_cloudiot_registry: () => 5,
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
