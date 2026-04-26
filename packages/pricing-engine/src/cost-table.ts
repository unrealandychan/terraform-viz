import type { GraphNode } from "@terraform-viz/graph-schema";
import { CloudProvider } from "@terraform-viz/graph-schema";

const COST_TABLE: Record<string, (a: Record<string, unknown>) => number> = {
  // ── AWS Compute ────────────────────────────────────────────────────────
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
  aws_lambda_function: (a) => {
    const reqM = Number(a["_usage_requests_m"] ?? 1);
    const memMb = Number(a["memory_size"] ?? a["_usage_memory_mb"] ?? 256);
    const durMs = Number(a["_usage_avg_duration_ms"] ?? 200);
    const reqCost = Math.max(0, reqM - 1) * 0.20;
    const gbSec = reqM * 1_000_000 * (durMs / 1000) * (memMb / 1024);
    const computeCost = Math.max(0, gbSec - 400_000) * 0.0000166667;
    return Math.round((reqCost + computeCost) * 100) / 100;
  },
  aws_eks_cluster: () => 73,
  aws_eks_node_group: (a) => 70.08 * Math.max(1, Number(a["desired_size"] ?? 2)),
  aws_autoscaling_group: (a) => 70.08 * Math.max(1, Number(a["desired_capacity"] ?? 2)),

  // ── AWS Database ────────────────────────────────────────────────────────
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
  aws_dynamodb_table: (a) => {
    const billing = String(a["billing_mode"] ?? "PAY_PER_REQUEST");
    if (billing === "PROVISIONED") {
      const wcu = Number(a["write_capacity"] ?? 5);
      const rcu = Number(a["read_capacity"] ?? 5);
      return Math.round((wcu * 0.47 + rcu * 0.09) * 100) / 100;
    }
    const writeM = Number(a["_usage_write_requests_m"] ?? 1);
    const readM = Number(a["_usage_read_requests_m"] ?? 5);
    return Math.round((writeM * 1.25 + readM * 0.25) * 100) / 100;
  },

  // ── AWS Storage ────────────────────────────────────────────────────────
  aws_s3_bucket: (a) => {
    const storageGb = Number(a["_usage_storage_gb"] ?? 50);
    const putK = Number(a["_usage_put_requests_k"] ?? 100);
    const getK = Number(a["_usage_get_requests_k"] ?? 1_000);
    return Math.round((storageGb * 0.023 + putK * 0.005 + getK * 0.0004) * 100) / 100;
  },
  aws_ebs_volume: (a) => {
    const sz = Math.max(1, Number(a["size"] ?? 20));
    const type = String(a["volume_type"] ?? "gp2");
    const rates: Record<string, number> = { gp2: 0.10, gp3: 0.08, st1: 0.045, sc1: 0.025, io1: 0.125, io2: 0.125 };
    const rate = rates[type] ?? 0.10;
    let cost = sz * rate;
    if (type === "io1" || type === "io2") {
      cost += Number(a["iops"] ?? 0) * 0.065;
    }
    return cost;
  },
  aws_efs_file_system: () => 30,

  // ── AWS Containers ──────────────────────────────────────────────────────
  aws_ecs_cluster: () => 0,
  aws_ecs_task_definition: () => 0,
  aws_ecs_service: () => 0,
  aws_lambda_event_source_mapping: () => 0,
  aws_ecs_capacity_provider: () => 0,
  aws_fargate_profile: () => 0,

  // ── AWS Network ────────────────────────────────────────────────────────
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

  // ── AWS API Gateway ───────────────────────────────────────────────────
  aws_apigatewayv2_api: (a) => {
    const callsM = Number(a["_usage_calls_m"] ?? 1);
    return Math.round(callsM * 1.00 * 100) / 100;
  },
  aws_apigatewayv2_stage: () => 0,
  aws_apigatewayv2_integration: () => 0,
  aws_apigatewayv2_route: () => 0,
  aws_api_gateway_rest_api: (a) => {
    const callsM = Number(a["_usage_calls_m"] ?? 1);
    return Math.round(callsM * 3.50 * 100) / 100;
  },
  aws_api_gateway_stage: () => 0,
  aws_api_gateway_resource: () => 0,
  aws_api_gateway_method: () => 0,
  aws_api_gateway_integration: () => 0,
  aws_api_gateway_deployment: () => 0,
  aws_api_gateway_domain_name: () => 0,

  // ── AWS Observability ─────────────────────────────────────────────────
  aws_cloudwatch_log_group: (a) => {
    // AWS pricing: ingestion $0.50/GB, storage $0.03/GB/month
    // Use _usage_ingestion_gb_mo if provided, else estimate from retention
    const retentionDays = Number(a["retention_in_days"] ?? 0); // 0 = never expire
    const effectiveRetentionDays = retentionDays > 0 ? retentionDays : 90; // default estimate
    const ingestionGb = Number(a["_usage_ingestion_gb_mo"] ?? 1); // default 1 GB/mo ingestion
    const storedGb = ingestionGb * (effectiveRetentionDays / 30);
    return ingestionGb * 0.50 + storedGb * 0.03;
  },
  aws_cloudwatch_metric_alarm: () => 0.10,
  aws_cloudwatch_dashboard: () => 3.00,
  aws_cloudwatch_log_metric_filter: () => 0,
  aws_cloudwatch_event_rule: () => 0,
  aws_cloudwatch_event_target: () => 0,

  // ── AWS Security / IAM ────────────────────────────────────────────────
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

  // ── AWS S3 bucket configuration resources ────────────────────────────
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

  // ── AWS Data / Analytics ────────────────────────────────────────────────────
  aws_kinesis_stream: () => 15,
  aws_kinesis_firehose_delivery_stream: (a) => {
    const gbPerMonth = Number(a["_usage_data_gb_per_month"] ?? 100);
    return Math.round(gbPerMonth * 0.029 * 100) / 100;
  },
  aws_sqs_queue: (a) => {
    const reqM = Number(a["_usage_requests_m"] ?? 1);
    const fifo = String(a["name"] ?? "").endsWith(".fifo");
    const rate = fifo ? 0.50 : 0.40;
    return Math.round(Math.max(0, reqM - 1) * rate * 100) / 100;
  },
  aws_sns_topic: (a) => {
    const pubM = Number(a["_usage_publishes_m"] ?? 0.5);
    return Math.round(Math.max(0, pubM - 1) * 0.50 * 100) / 100;
  },
  aws_glue_job: (a) => {
    const workers = Number(a["number_of_workers"] ?? 2);
    const hoursPerMonth = Number(a["_usage_hours_per_month"] ?? 20);
    return Math.round(workers * hoursPerMonth * 0.44 * 100) / 100;
  },
  aws_glue_catalog_database: () => 1,
  aws_redshift_cluster: () => 180,
  aws_msk_cluster: () => 350,

  // ── AWS SageMaker (Issue #6) ────────────────────────────────────────────
  aws_sagemaker_endpoint: () => 156,
  aws_sagemaker_endpoint_configuration: () => 0,
  aws_sagemaker_model: () => 0,
  aws_sagemaker_training_job: () => 200,

  // ── AWS AppRunner (Issue #6) ────────────────────────────────────────────
  aws_apprunner_service: () => 25,
  awscc_apprunner_service: () => 25,

  // ── Azure Compute ──────────────────────────────────────────────────────
  azurerm_kubernetes_cluster: () => 73,
  azurerm_kubernetes_cluster_node_pool: (a) => 70 * Math.max(1, Number(a["node_count"] ?? 2)),
  azurerm_virtual_machine: () => 70,
  azurerm_linux_virtual_machine: () => 70,
  azurerm_windows_virtual_machine: () => 90,
  azurerm_function_app: (a) => {
    const execM = Number(a["_usage_executions_m"] ?? 1);
    return Math.round(Math.max(0, execM - 1) * 0.20 * 100) / 100;
  },
  azurerm_app_service_plan: () => 55,
  azurerm_app_service: () => 5,

  // ── Azure Database ─────────────────────────────────────────────────────
  azurerm_sql_server: () => 0,
  azurerm_mssql_database: () => 150,
  azurerm_postgresql_server: () => 90,
  azurerm_postgresql_flexible_server: () => 95,
  azurerm_mysql_server: () => 80,
  azurerm_redis_cache: () => 55,
  azurerm_cosmosdb_account: (a) => {
    const ruPerSec = Number(a["_usage_request_units_per_sec"] ?? 400);
    const storageGb = Number(a["_usage_storage_gb"] ?? 10);
    const ruCost = (ruPerSec / 100) * 6.00;
    const storageCost = storageGb * 0.25;
    return Math.round((ruCost + storageCost) * 100) / 100;
  },

  // ── Azure Storage ──────────────────────────────────────────────────────
  azurerm_storage_account: () => 20,
  azurerm_managed_disk: (a) => Math.max(1, Number(a["disk_size_gb"] ?? 128)) * 0.10,

  // ── Azure Networking ─────────────────────────────────────────────────
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

  // ── Azure Security / IAM ──────────────────────────────────────────────
  azurerm_key_vault: () => 5.00,
  azurerm_key_vault_secret: () => 0,
  azurerm_key_vault_key: () => 0,
  azurerm_role_assignment: () => 0,
  azurerm_user_assigned_identity: () => 0,

  // ── Azure Messaging ───────────────────────────────────────────────────
  azurerm_servicebus_namespace: () => 10,
  azurerm_servicebus_queue: () => 0,
  azurerm_servicebus_topic: () => 0,
  azurerm_eventgrid_topic: () => 0.60,
  azurerm_eventgrid_event_subscription: () => 0.60,

  // ── Azure Data / Analytics ────────────────────────────────────────────
  azurerm_eventhub_namespace: () => 22,
  azurerm_eventhub: () => 0,
  azurerm_databricks_workspace: () => 150,
  azurerm_data_factory: () => 10,
  azurerm_stream_analytics_job: () => 80,

  // ── Azure AI / Containers (Issue #6) ───────────────────────────────────
  azurerm_application_gateway: () => 55,
  azurerm_container_registry: () => 5,
  azurerm_container_group: () => 30,
  azurerm_cognitive_account: () => 10,

  // ── GCP Compute ───────────────────────────────────────────────────────
  google_container_cluster: () => 73,
  google_container_node_pool: (a) => 50 * Math.max(1, Number(a["initial_node_count"] ?? 2)),
  google_compute_instance: () => 50,
  google_cloud_run_service: (a) => {
    const reqM = Number(a["_usage_requests_m"] ?? 1);
    const minInstances = Number(a["_usage_min_instances"] ?? 0);
    const reqCost = Math.max(0, reqM - 2) * 0.40;
    const idleCost = minInstances * 730 * 0.024;
    return Math.round((reqCost + idleCost) * 100) / 100;
  },
  google_cloudfunctions_function: (a) => {
    const reqM = Number(a["_usage_requests_m"] ?? 1);
    const memMb = Number(a["_usage_memory_mb"] ?? 256);
    const durMs = Number(a["_usage_avg_duration_ms"] ?? 200);
    const reqCost = Math.max(0, reqM - 2) * 0.40;
    const gbSec = reqM * 1_000_000 * (durMs / 1000) * (memMb / 1024);
    const computeCost = Math.max(0, gbSec - 400_000) * 0.0000100;
    return Math.round((reqCost + computeCost) * 100) / 100;
  },

  // ── GCP Database ──────────────────────────────────────────────────────
  google_sql_database_instance: () => 100,
  google_spanner_instance: () => 300,
  google_redis_instance: () => 55,
  google_bigtable_instance: () => 200,

  // ── GCP Storage ───────────────────────────────────────────────────────
  google_storage_bucket: (a) => {
    const storageGb = Number(a["_usage_storage_gb"] ?? 50);
    const classA = Number(a["_usage_class_a_ops_k"] ?? 100);
    const classB = Number(a["_usage_class_b_ops_k"] ?? 1_000);
    const storageClass = String(a["storage_class"] ?? "STANDARD").toUpperCase();
    const gcpRates: Record<string, number> = { STANDARD: 0.020, NEARLINE: 0.010, COLDLINE: 0.004, ARCHIVE: 0.0012 };
    const gcpRate = gcpRates[storageClass] ?? 0.020;
    return Math.round((storageGb * gcpRate + classA * 0.005 + classB * 0.0004) * 100) / 100;
  },
  google_compute_disk: (a) => Math.max(1, Number(a["size"] ?? 50)) * 0.04,
  google_filestore_instance: () => 200,

  // ── GCP Networking ────────────────────────────────────────────────────
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

  // ── GCP Security / IAM ────────────────────────────────────────────────
  google_service_account: () => 0,
  google_service_account_iam_binding: () => 0,
  google_project_iam_binding: () => 0,
  google_project_iam_member: () => 0,
  google_secret_manager_secret: () => 0.06,
  google_secret_manager_secret_version: () => 0,
  google_kms_key_ring: () => 0,
  google_kms_crypto_key: () => 6.00,

  // ── GCP Data / Analytics ─────────────────────────────────────────────
  google_bigquery_dataset: (a) => {
    const storageGb = Number(a["_usage_storage_gb"] ?? 0);
    return Math.round(storageGb * 0.02 * 100) / 100;
  },
  google_bigquery_table: (a) => {
    const storageGb = Number(a["_usage_storage_gb"] ?? 10);
    const queriesTb = Number(a["_usage_queries_tb_per_month"] ?? 0.1);
    return Math.round((storageGb * 0.02 + queriesTb * 5.00) * 100) / 100;
  },
  google_pubsub_topic: (a) => {
    const gbPerMonth = Number(a["_usage_message_gb_per_month"] ?? 5);
    return Math.round(Math.max(0, gbPerMonth - 10) * 0.04 * 100) / 100;
  },
  google_pubsub_subscription: (a) => {
    const gbPerMonth = Number(a["_usage_message_gb_per_month"] ?? 5);
    return Math.round(Math.max(0, gbPerMonth - 10) * 0.04 * 100) / 100;
  },
  google_dataflow_job: (a) => {
    const numWorkers = Number(a["num_workers"] ?? 2);
    const maxWorkers = Number(a["max_workers"] ?? numWorkers * 2);
    const avgWorkers = (numWorkers + maxWorkers) / 2;
    const hoursPerMonth = 730;
    const vcpuCost = avgWorkers * hoursPerMonth * 0.056;
    const memCost = avgWorkers * 4 * hoursPerMonth * 0.003375;
    return Math.round((vcpuCost + memCost) * 100) / 100;
  },
  google_composer_environment: () => 400,

  // ── GCP AI / Artifact Registry (Issue #6) ──────────────────────────────
  google_artifact_registry_repository: () => 1,
  google_cloud_run_v2_service: () => 5,
  google_vertex_ai_endpoint: () => 150,
  google_notebooks_instance: () => 100,
};

// ── Human-readable computation breakdown per resource type ─────────────────
const BREAKDOWN_TABLE: Record<string, (a: Record<string, unknown>) => string> = {
  // AWS Compute
  aws_instance: (a) => {
    const it = String(a["instance_type"] ?? "unknown");
    return `${it} on-demand (us-east-1 est.)`;
  },
  aws_lambda_function: () => "≈1M req/mo + compute time est.",
  aws_eks_cluster: () => "EKS control plane flat fee ($0.10/hr)",
  aws_eks_node_group: (a) => {
    const n = Math.max(1, Number(a["desired_size"] ?? 2));
    return `${n} node${n > 1 ? "s" : ""} × $70.08/node (m5.large est.)`;
  },
  aws_autoscaling_group: (a) => {
    const n = Math.max(1, Number(a["desired_capacity"] ?? 2));
    return `${n} node${n > 1 ? "s" : ""} × $70.08/node (m5.large est.)`;
  },
  // AWS Database
  aws_db_instance: (a) => {
    const ic = String(a["instance_class"] ?? "unknown");
    return `${ic} RDS on-demand (us-east-1 est.)`;
  },
  aws_rds_cluster: () => "Aurora cluster base est.",
  aws_rds_cluster_instance: (a) => {
    const ic = String(a["instance_class"] ?? "unknown");
    return `${ic} Aurora on-demand est.`;
  },
  aws_elasticache_cluster: (a) => `${String(a["node_type"] ?? "unknown")} ElastiCache node est.`,
  aws_elasticache_replication_group: (a) => `${String(a["node_type"] ?? "unknown")} ElastiCache node est.`,
  aws_dynamodb_table: () => "25 WCU + 25 RCU provisioned base est.",
  // AWS Storage
  aws_s3_bucket: () => "≈25 GB storage + requests est.",
  aws_ebs_volume: (a) => {
    const sz = Math.max(1, Number(a["size"] ?? 20));
    const type = String(a["volume_type"] ?? "gp2");
    const rates: Record<string, number> = { gp2: 0.10, gp3: 0.08, st1: 0.045, sc1: 0.025, io1: 0.125, io2: 0.125 };
    const rate = rates[type] ?? 0.10;
    if (type === "io1" || type === "io2") {
      const iops = Number(a["iops"] ?? 0);
      return `${sz} GB × $${rate}/GB (${type}) + ${iops} IOPS × $0.065/IOPS`;
    }
    return `${sz} GB × $${rate}/GB (${type})`;
  },
  aws_efs_file_system: () => "≈10 GB × $0.30/GB est.",
  // AWS Network
  aws_vpc: () => "free — VPC itself has no cost",
  aws_subnet: () => "free",
  aws_internet_gateway: () => "free",
  aws_nat_gateway: () => "$0.045/hr × 730 hr + data transfer est.",
  aws_lb: (a) => {
    const isNLB = String(a["load_balancer_type"]) === "network";
    return isNLB ? "NLB: $0.018/hr base ($13.14/mo est.)" : "ALB: $0.0225/hr base + LCU charges est. ($22.27/mo)";
  },
  aws_alb: (a) => {
    const isNLB = String(a["load_balancer_type"]) === "network";
    return isNLB ? "NLB: $0.018/hr base ($13.14/mo est.)" : "ALB: $0.0225/hr base + LCU charges est. ($22.27/mo)";
  },
  aws_elb: () => "$0.025/hr Classic LB est.",
  aws_lb_listener: () => "free — billed via load balancer",
  aws_alb_listener: () => "free — billed via load balancer",
  aws_lb_target_group: () => "free",
  aws_alb_target_group: () => "free",
  aws_security_group: () => "free",
  aws_security_group_rule: () => "free",
  aws_route_table: () => "free",
  aws_route_table_association: () => "free",
  aws_route53_zone: () => "$0.50/hosted zone/mo",
  aws_route53_record: () => "free — billed via hosted zone",
  aws_cloudfront_distribution: () => "≈1M requests/mo est.",
  aws_cloudfront_origin_access_control: () => "free",
  aws_cloudfront_origin_access_identity: () => "free",
  aws_eip: () => "free when attached to a running instance",
  aws_vpc_endpoint: () => "$0.01/hr if interface endpoint (gateway endpoints are free)",
  // AWS Containers
  aws_ecs_cluster: () => "free — ECS control plane has no charge",
  aws_ecs_task_definition: () => "free — task definitions have no charge",
  aws_ecs_service: () => "free — compute cost comes from EC2/Fargate tasks",
  aws_lambda_event_source_mapping: () => "free — billed via Lambda invocations",
  // AWS API Gateway
  aws_apigatewayv2_api: () => "≈100K requests/mo HTTP API est. ($1/M req)",
  aws_apigatewayv2_stage: () => "free — billed via API",
  aws_apigatewayv2_integration: () => "free",
  aws_apigatewayv2_route: () => "free",
  aws_api_gateway_rest_api: () => "≈1M requests/mo REST API est. ($3.50/M req)",
  aws_api_gateway_stage: () => "free — billed via REST API",
  aws_api_gateway_resource: () => "free",
  aws_api_gateway_method: () => "free",
  aws_api_gateway_integration: () => "free",
  aws_api_gateway_deployment: () => "free",
  aws_api_gateway_domain_name: () => "free",
  // AWS Observability
  aws_cloudwatch_log_group: (a) => {
    const retentionDays = Number(a["retention_in_days"] ?? 0);
    const effectiveRetentionDays = retentionDays > 0 ? retentionDays : 90;
    const ingestionGb = Number(a["_usage_ingestion_gb_mo"] ?? 1);
    const storedGb = ingestionGb * (effectiveRetentionDays / 30);
    const ingestionCost = (ingestionGb * 0.50).toFixed(2);
    const storageCost = (storedGb * 0.03).toFixed(2);
    return `$${ingestionCost} ingest (${ingestionGb} GB) + $${storageCost} storage (${storedGb.toFixed(1)} GB × $0.03/GB)`;
  },
  aws_cloudwatch_metric_alarm: () => "$0.10/alarm/mo",
  aws_cloudwatch_dashboard: () => "$3.00/dashboard/mo",
  aws_cloudwatch_log_metric_filter: () => "free",
  aws_cloudwatch_event_rule: () => "free",
  aws_cloudwatch_event_target: () => "free",
  // AWS Security / IAM
  aws_acm_certificate: () => "free (public certificates are always free)",
  aws_acm_certificate_validation: () => "free",
  aws_iam_role: () => "free",
  aws_iam_role_policy: () => "free",
  aws_iam_role_policy_attachment: () => "free",
  aws_iam_policy: () => "free",
  aws_iam_instance_profile: () => "free",
  aws_iam_user: () => "free",
  aws_iam_group: () => "free",
  aws_iam_group_membership: () => "free",
  aws_kms_key: () => "$1.00/key/mo + $0.03/10K API calls est.",
  aws_kms_alias: () => "free",
  aws_secretsmanager_secret: () => "$0.40/secret/mo + $0.05/10K API calls est.",
  aws_secretsmanager_secret_version: () => "free — billed via secret",
  aws_ssm_parameter: () => "free (standard) or $0.05/advanced/mo",
  // AWS S3 config resources
  aws_s3_bucket_website_configuration: () => "free — billed via S3 bucket",
  aws_s3_bucket_versioning: () => "free — billed via S3 bucket",
  aws_s3_bucket_policy: () => "free",
  aws_s3_bucket_public_access_block: () => "free",
  aws_s3_bucket_ownership_controls: () => "free",
  aws_s3_bucket_cors_configuration: () => "free",
  aws_s3_bucket_lifecycle_configuration: () => "free",
  aws_s3_bucket_notification: () => "free",
  aws_s3_bucket_acl: () => "free",
  aws_s3_object: () => "free — billed via S3 bucket storage",
  // AWS Data
  aws_kinesis_stream: () => "1 shard × $0.015/hr × 730 hr",
  aws_kinesis_firehose_delivery_stream: () => "≈1 GB/mo data ingestion est.",
  aws_sqs_queue: () => "≈1M requests/mo est.",
  aws_sns_topic: () => "≈1M notifications/mo est.",
  aws_glue_job: () => "2 DPU × ≈22 hr/mo est.",
  aws_glue_catalog_database: () => "≈1 GB metadata storage est.",
  aws_redshift_cluster: () => "dc2.large single-node on-demand est.",
  aws_msk_cluster: () => "3 × kafka.m5.large est.",
  // Azure Compute
  azurerm_kubernetes_cluster: () => "AKS control plane flat fee",
  azurerm_kubernetes_cluster_node_pool: (a) => {
    const n = Math.max(1, Number(a["node_count"] ?? 2));
    return `${n} node${n > 1 ? "s" : ""} × $70/node (Standard_D2s_v3 est.)`;
  },
  azurerm_virtual_machine: () => "Standard_D2s_v3 est.",
  azurerm_linux_virtual_machine: () => "Standard_D2s_v3 est.",
  azurerm_windows_virtual_machine: () => "Standard_D2s_v3 + Windows license est.",
  azurerm_function_app: () => "consumption plan est.",
  azurerm_app_service_plan: () => "B2 tier est.",
  azurerm_app_service: () => "consumption / shared tier est.",
  azurerm_sql_server: () => "free — server container, DBs billed separately",
  azurerm_mssql_database: () => "S3 tier (100 DTU) est.",
  azurerm_postgresql_server: () => "GP_Gen5_2 (2 vCore) est.",
  azurerm_postgresql_flexible_server: () => "Standard_D2s_v3 (2 vCore) est.",
  azurerm_mysql_server: () => "GP_Gen5_2 (2 vCore) est.",
  azurerm_redis_cache: () => "C1 Standard (1 GB) est.",
  azurerm_cosmosdb_account: () => "400 RU/s provisioned throughput est.",
  azurerm_storage_account: () => "LRS ≈20 GB, hot tier est.",
  azurerm_managed_disk: (a) => {
    const sz = Math.max(1, Number(a["disk_size_gb"] ?? 128));
    return `${sz} GB × $0.10/GB (Premium SSD est.)`;
  },
  azurerm_eventhub_namespace: () => "Standard tier, 1 TU est.",
  azurerm_eventhub: () => "free — billed via namespace",
  azurerm_databricks_workspace: () => "Standard tier ≈1000 DBU/mo est.",
  azurerm_data_factory: () => "≈100 pipeline activity runs est.",
  azurerm_stream_analytics_job: () => "1 Streaming Unit (SU) est.",
  // Azure Networking
  azurerm_resource_group: () => "free",
  azurerm_virtual_network: () => "free",
  azurerm_subnet: () => "free",
  azurerm_network_interface: () => "free",
  azurerm_network_security_group: () => "free",
  azurerm_network_security_rule: () => "free",
  azurerm_public_ip: () => "$0.005/hr (static, Basic) est.",
  azurerm_load_balancer: () => "$0.025/hr Standard LB est.",
  azurerm_load_balancer_backend_address_pool: () => "free",
  azurerm_load_balancer_rule: () => "free",
  azurerm_load_balancer_probe: () => "free",
  azurerm_dns_zone: () => "$0.90/zone/mo",
  azurerm_dns_a_record: () => "free — billed via DNS zone",
  // Azure Security / IAM
  azurerm_key_vault: () => "$5.00/mo base + per-operation charges est.",
  azurerm_key_vault_secret: () => "free — billed via Key Vault",
  azurerm_key_vault_key: () => "free — billed via Key Vault",
  azurerm_role_assignment: () => "free",
  azurerm_user_assigned_identity: () => "free",
  // Azure Messaging
  azurerm_servicebus_namespace: () => "Basic tier $0.013/M operations est.",
  azurerm_servicebus_queue: () => "free — billed via Service Bus namespace",
  azurerm_servicebus_topic: () => "free — billed via Service Bus namespace",
  azurerm_eventgrid_topic: () => "≈1M events/mo est.",
  azurerm_eventgrid_event_subscription: () => "≈1M events/mo est.",
  // GCP Compute
  google_container_cluster: () => "GKE control plane flat fee ($0.10/hr)",
  google_container_node_pool: (a) => {
    const n = Math.max(1, Number(a["initial_node_count"] ?? 2));
    return `${n} node${n > 1 ? "s" : ""} × $50/node (n1-standard-2 est.)`;
  },
  google_compute_instance: () => "n1-standard-2 on-demand est.",
  google_cloud_run_service: () => "≈1M req/mo est.",
  google_cloudfunctions_function: () => "≈1M invocations/mo est.",
  google_sql_database_instance: () => "db-n1-standard-2 est.",
  google_spanner_instance: () => "1 processing unit × $0.90/hr est.",
  google_redis_instance: () => "1 GB BASIC tier est.",
  google_bigtable_instance: () => "1-node production cluster est.",
  google_storage_bucket: () => "≈25 GB standard storage est.",
  google_compute_disk: (a) => {
    const sz = Math.max(1, Number(a["size"] ?? 50));
    return `${sz} GB × $0.04/GB (pd-standard est.)`;
  },
  google_filestore_instance: () => "1 TB basic HDD est.",
  google_bigquery_dataset: () => "≈50 GB storage est.",
  google_bigquery_table: () => "≈50 GB storage est.",
  google_pubsub_topic: () => "≈1M messages/mo est.",
  google_pubsub_subscription: () => "≈1M messages/mo est.",
  google_dataflow_job: () => "1 worker × n1-standard-2 est.",
  google_composer_environment: () => "small environment est.",
  // GCP Networking
  google_compute_network: () => "free",
  google_compute_subnetwork: () => "free",
  google_compute_router: () => "free",
  google_compute_address: () => "$0.01/hr static external IP est.",
  google_compute_global_address: () => "$0.01/hr static external IP est.",
  google_compute_firewall: () => "free",
  google_compute_forwarding_rule: () => "$0.025/hr est.",
  google_compute_url_map: () => "free",
  google_compute_backend_service: () => "free",
  google_compute_health_check: () => "free",
  google_compute_target_https_proxy: () => "free",
  google_compute_managed_ssl_certificate: () => "free",
  google_dns_managed_zone: () => "$0.20/zone/mo (first 25 zones)",
  google_dns_record_set: () => "free — billed via DNS zone",
  // GCP Security / IAM
  google_service_account: () => "free",
  google_service_account_iam_binding: () => "free",
  google_project_iam_binding: () => "free",
  google_project_iam_member: () => "free",
  google_secret_manager_secret: () => "$0.06/secret/mo + $0.03/10K access ops est.",
  google_secret_manager_secret_version: () => "free — billed via Secret Manager secret",
  google_kms_key_ring: () => "free",
  google_kms_crypto_key: () => "$6.00/key/mo est.",
  // AWS SageMaker / AppRunner / Fargate (Issue #6)
  aws_sagemaker_endpoint: () => "ml.t3.medium × 730 hr est.",
  aws_sagemaker_endpoint_configuration: () => "free — billed via endpoint",
  aws_sagemaker_model: () => "free — model artifact storage only",
  aws_sagemaker_training_job: () => "ml.m5.xlarge × ≈100 hr/mo est.",
  aws_ecs_capacity_provider: () => "free — capacity provider itself has no charge",
  aws_apprunner_service: () => "1 vCPU × 2 GB RAM × ≈730 hr est.",
  awscc_apprunner_service: () => "1 vCPU × 2 GB RAM × ≈730 hr est.",
  aws_fargate_profile: () => "free — Fargate compute billed via ECS tasks",
  // Azure AI / Containers (Issue #6)
  azurerm_application_gateway: () => "WAF_v2 Small, 1 instance × $0.075/hr est.",
  azurerm_container_registry: () => "Basic tier est.",
  azurerm_container_group: () => "1 vCPU × 1.5 GB × 730 hr est.",
  azurerm_cognitive_account: () => "S0 tier est.",
  // GCP AI / Artifact Registry (Issue #6)
  google_artifact_registry_repository: () => "≈10 GB × $0.10/GB est.",
  google_cloud_run_v2_service: () => "≈1M req/mo est.",
  google_vertex_ai_endpoint: () => "n1-standard-4 × 730 hr est.",
  google_notebooks_instance: () => "n1-standard-4 Notebooks est.",
};


export { COST_TABLE, BREAKDOWN_TABLE };
