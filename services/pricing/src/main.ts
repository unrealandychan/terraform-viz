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
  // AWS Storage
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
  // AWS Observability
  aws_cloudwatch_log_group: (a) => {
    const ingestGb = Number(a["_usage_ingest_gb_per_month"] ?? 10);
    const storeGb = Number(a["_usage_store_gb"] ?? 30);
    return Math.round((ingestGb * 0.50 + storeGb * 0.03) * 100) / 100;
  },
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
  azurerm_cosmosdb_account: (a) => {
    const ruPerSec = Number(a["_usage_request_units_per_sec"] ?? 400);
    const storageGb = Number(a["_usage_storage_gb"] ?? 10);
    const ruCost = (ruPerSec / 100) * 6.00;
    const storageCost = storageGb * 0.25;
    return Math.round((ruCost + storageCost) * 100) / 100;
  },
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
  azurerm_eventhub_namespace: (a) => {
    const sku = String(a["sku"] ?? "Standard").toLowerCase();
    const tu = Number(a["capacity"] ?? 1);
    if (sku === "basic") return Math.round(tu * 10.77 * 100) / 100;
    if (sku === "premium") return Math.round(tu * 710 * 100) / 100;
    const gbIngested = Number(a["_usage_ingress_gb_per_month"] ?? 50);
    return Math.round((tu * 21.50 + gbIngested * 0.028) * 100) / 100;
  },
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
  // GCP Database
  google_sql_database_instance: () => 100,
  google_spanner_instance: () => 300,
  google_redis_instance: () => 55,
  google_bigtable_instance: () => 200,
  // GCP Storage
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
  // GCP AI / Artifact Registry (Issue #6)
  google_artifact_registry_repository: () => 1,
  google_cloud_run_v2_service: (a) => {
    const reqM = Number(a["_usage_requests_m"] ?? 1);
    const minInstances = Number(a["_usage_min_instances"] ?? 0);
    const reqCost = Math.max(0, reqM - 2) * 0.40;
    const idleCost = minInstances * 730 * 0.024;
    return Math.round((reqCost + idleCost) * 100) / 100;
  },
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
  aws_kinesis_firehose_delivery_stream: (a) => {
    const gbPerMonth = Number(a["_usage_data_gb_per_month"] ?? 100);
    return Math.round(gbPerMonth * 0.029 * 100) / 100;
  },
  aws_kinesis_analytics_application: () => 110,
  aws_kinesisanalyticsv2_application: () => 110,
  aws_glue_job: (a) => {
    const workers = Number(a["number_of_workers"] ?? 2);
    const hoursPerMonth = Number(a["_usage_hours_per_month"] ?? 20);
    return Math.round(workers * hoursPerMonth * 0.44 * 100) / 100;
  },
  aws_glue_catalog_database: () => 0,
  aws_glue_catalog_table: () => 0,
  aws_glue_crawler: () => 5,
  aws_emr_cluster: (a) => Math.max(1, Number((a["core_instance_group"] as Record<string,unknown>)?.["instance_count"] ?? 2)) * 70,
  aws_athena_workgroup: (a) => {
    const scanTb = Number(a["_usage_scan_tb_per_month"] ?? 0.5);
    return Math.round(scanTb * 5.00 * 100) / 100;
  },
  aws_dax_cluster: (a) => Math.max(1, Number(a["replication_factor"] ?? 1)) * 100,

  // ── AWS: Messaging / Workflow ─────────────────────────────────────────────
  aws_sqs_queue: (a) => {
    const reqM = Number(a["_usage_requests_m"] ?? 1);
    const fifo = String(a["name"] ?? "").endsWith(".fifo");
    const rate = fifo ? 0.50 : 0.40;
    return Math.round(Math.max(0, reqM - 1) * rate * 100) / 100;
  },
  aws_sqs_queue_policy: () => 0,
  aws_sns_topic: (a) => {
    const pubM = Number(a["_usage_publishes_m"] ?? 0.5);
    return Math.round(Math.max(0, pubM - 1) * 0.50 * 100) / 100;
  },
  aws_sns_topic_subscription: () => 0,
  aws_sns_topic_policy: () => 0,
  aws_mq_broker: (a) => String(a["engine_type"] ?? "ActiveMQ").toLowerCase().includes("rabbit") ? 60 : 80,
  aws_sfn_state_machine: (a) => {
    const type = String(a["type"] ?? "STANDARD");
    if (type === "EXPRESS") {
      const reqM = Number(a["_usage_requests_m"] ?? 1);
      return Math.round(reqM * 0.00001 * 1_000_000 * 100) / 100;
    }
    const transitions = Number(a["_usage_state_transitions_k"] ?? 1);
    return Math.round(Math.max(0, transitions - 4_000) * 0.025 * 100) / 100;
  },
  aws_step_functions_state_machine: (a) => {
    const type = String(a["type"] ?? "STANDARD");
    if (type === "EXPRESS") {
      const reqM = Number(a["_usage_requests_m"] ?? 1);
      return Math.round(reqM * 0.00001 * 1_000_000 * 100) / 100;
    }
    const transitions = Number(a["_usage_state_transitions_k"] ?? 1);
    return Math.round(Math.max(0, transitions - 4_000) * 0.025 * 100) / 100;
  },

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
  azurerm_function_app: (a) => {
    const execM = Number(a["_usage_executions_m"] ?? 1);
    return Math.round(Math.max(0, execM - 1) * 0.20 * 100) / 100;
  },
  azurerm_linux_function_app: (a) => {
    const execM = Number(a["_usage_executions_m"] ?? 1);
    return Math.round(Math.max(0, execM - 1) * 0.20 * 100) / 100;
  },
  azurerm_windows_function_app: (a) => {
    const execM = Number(a["_usage_executions_m"] ?? 1);
    return Math.round(Math.max(0, execM - 1) * 0.20 * 100) / 100;
  },
  azurerm_container_app: (a) => {
    const vcpu = Number(a["_usage_vcpu"] ?? 0.5);
    const memGb = Number(a["_usage_memory_gb"] ?? 1);
    const activeHrs = Number(a["_usage_active_hours_per_month"] ?? 200);
    const minReplicas = Number(a["_usage_min_replicas"] ?? 0);
    const activeCost = vcpu * activeHrs * 0.000024 * 3600 + memGb * activeHrs * 0.0000025 * 3600;
    const idleCost = minReplicas * vcpu * 730 * 0.000024 * 3600;
    return Math.round((activeCost + idleCost) * 100) / 100;
  },
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
  azurerm_cdn_endpoint: (a) => {
    const gbOut = Number(a["_usage_egress_gb_per_month"] ?? 100);
    return Math.round(gbOut * 0.0875 * 100) / 100;
  },
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
  aws_lambda_function: (a) => {
    const reqM = Number(a["_usage_requests_m"] ?? 1);
    const memMb = Number(a["memory_size"] ?? a["_usage_memory_mb"] ?? 256);
    const durMs = Number(a["_usage_avg_duration_ms"] ?? 200);
    return `${reqM}M req/mo × ${memMb}MB × ${durMs}ms avg (default assumptions)`;
  },
  aws_s3_bucket: (a) => {
    const gb = Number(a["_usage_storage_gb"] ?? 50);
    const putK = Number(a["_usage_put_requests_k"] ?? 100);
    const getK = Number(a["_usage_get_requests_k"] ?? 1_000);
    return `${gb} GB stored + ${putK}K PUTs + ${getK}K GETs est.`;
  },
  aws_dynamodb_table: (a) => {
    const billing = String(a["billing_mode"] ?? "PAY_PER_REQUEST");
    if (billing === "PROVISIONED") {
      return `${Number(a["write_capacity"] ?? 5)} WCU + ${Number(a["read_capacity"] ?? 5)} RCU provisioned`;
    }
    return `${Number(a["_usage_write_requests_m"] ?? 1)}M writes + ${Number(a["_usage_read_requests_m"] ?? 5)}M reads on-demand est.`;
  },
  aws_sqs_queue: (a) => {
    const reqM = Number(a["_usage_requests_m"] ?? 1);
    const fifo = String(a["name"] ?? "").endsWith(".fifo");
    return `${reqM}M req/mo ${fifo ? "FIFO" : "Standard"} (first 1M free)`;
  },
  aws_sns_topic: (a) => {
    const pubM = Number(a["_usage_publishes_m"] ?? 0.5);
    return `${pubM}M publishes/mo (first 1M free)`;
  },
  aws_apigatewayv2_api: (a) => {
    const callsM = Number(a["_usage_calls_m"] ?? 1);
    return `${callsM}M calls/mo HTTP API @ $1.00/M`;
  },
  aws_api_gateway_rest_api: (a) => {
    const callsM = Number(a["_usage_calls_m"] ?? 1);
    return `${callsM}M calls/mo REST API @ $3.50/M`;
  },
  aws_cloudwatch_log_group: (a) => {
    const ingestGb = Number(a["_usage_ingest_gb_per_month"] ?? 10);
    const storeGb = Number(a["_usage_store_gb"] ?? 30);
    return `${ingestGb} GB ingested + ${storeGb} GB stored est.`;
  },
  aws_kinesis_firehose_delivery_stream: (a) => {
    const gb = Number(a["_usage_data_gb_per_month"] ?? 100);
    return `${gb} GB/mo data ingestion @ $0.029/GB`;
  },
  aws_athena_workgroup: (a) => {
    const tb = Number(a["_usage_scan_tb_per_month"] ?? 0.5);
    return `${tb} TB scanned/mo @ $5.00/TB`;
  },
  aws_glue_job: (a) => {
    const workers = Number(a["number_of_workers"] ?? 2);
    const hrs = Number(a["_usage_hours_per_month"] ?? 20);
    return `${workers} workers × ${hrs} hr/mo @ $0.44/DPU-hr`;
  },
  aws_sfn_state_machine: (a) => {
    const type = String(a["type"] ?? "STANDARD");
    if (type === "EXPRESS") {
      const reqM = Number(a["_usage_requests_m"] ?? 1);
      return `${reqM}M transitions/mo EXPRESS @ $0.00001/transition`;
    }
    const transitions = Number(a["_usage_state_transitions_k"] ?? 1);
    return `${transitions}K transitions/mo STANDARD (first 4K free)`;
  },
  google_storage_bucket: (a) => {
    const gb = Number(a["_usage_storage_gb"] ?? 50);
    const cls = String(a["storage_class"] ?? "STANDARD");
    return `${gb} GB ${cls} storage + ops est.`;
  },
  google_bigquery_dataset: (a) => {
    const gb = Number(a["_usage_storage_gb"] ?? 0);
    return gb > 0 ? `${gb} GB storage @ $0.02/GB` : "dataset container — tables billed separately";
  },
  google_bigquery_table: (a) => {
    const gb = Number(a["_usage_storage_gb"] ?? 10);
    const tb = Number(a["_usage_queries_tb_per_month"] ?? 0.1);
    return `${gb} GB storage + ${tb} TB queries/mo`;
  },
  google_pubsub_topic: (a) => {
    const gb = Number(a["_usage_message_gb_per_month"] ?? 5);
    return `${gb} GB messages/mo (first 10 GB free)`;
  },
  google_pubsub_subscription: (a) => {
    const gb = Number(a["_usage_message_gb_per_month"] ?? 5);
    return `${gb} GB delivered/mo (first 10 GB free)`;
  },
  google_dataflow_job: (a) => {
    const numWorkers = Number(a["num_workers"] ?? 2);
    const maxWorkers = Number(a["max_workers"] ?? numWorkers * 2);
    return `${numWorkers}–${maxWorkers} workers × 730 hr/mo est.`;
  },
  google_cloud_run_service: (a) => {
    const reqM = Number(a["_usage_requests_m"] ?? 1);
    const min = Number(a["_usage_min_instances"] ?? 0);
    return `${reqM}M req/mo${min > 0 ? ` + ${min} min instances` : ""} (first 2M free)`;
  },
  google_cloud_run_v2_service: (a) => {
    const reqM = Number(a["_usage_requests_m"] ?? 1);
    const min = Number(a["_usage_min_instances"] ?? 0);
    return `${reqM}M req/mo${min > 0 ? ` + ${min} min instances` : ""} (first 2M free)`;
  },
  google_cloudfunctions_function: (a) => {
    const reqM = Number(a["_usage_requests_m"] ?? 1);
    const memMb = Number(a["_usage_memory_mb"] ?? 256);
    return `${reqM}M invocations/mo × ${memMb}MB (first 2M free)`;
  },
  azurerm_cosmosdb_account: (a) => {
    const ru = Number(a["_usage_request_units_per_sec"] ?? 400);
    const gb = Number(a["_usage_storage_gb"] ?? 10);
    return `${ru} RU/s throughput + ${gb} GB storage`;
  },
  azurerm_function_app: (a) => {
    const execM = Number(a["_usage_executions_m"] ?? 1);
    return `${execM}M executions/mo consumption plan (first 1M free)`;
  },
  azurerm_linux_function_app: (a) => {
    const execM = Number(a["_usage_executions_m"] ?? 1);
    return `${execM}M executions/mo consumption plan (first 1M free)`;
  },
  azurerm_windows_function_app: (a) => {
    const execM = Number(a["_usage_executions_m"] ?? 1);
    return `${execM}M executions/mo consumption plan (first 1M free)`;
  },
  azurerm_container_app: (a) => {
    const vcpu = Number(a["_usage_vcpu"] ?? 0.5);
    const hrs = Number(a["_usage_active_hours_per_month"] ?? 200);
    return `${vcpu} vCPU × ${hrs} active hr/mo est.`;
  },
  azurerm_cdn_endpoint: (a) => {
    const gb = Number(a["_usage_egress_gb_per_month"] ?? 100);
    return `${gb} GB egress/mo Zone 1 @ $0.0875/GB`;
  },
  azurerm_eventhub_namespace: (a) => {
    const sku = String(a["sku"] ?? "Standard");
    const tu = Number(a["capacity"] ?? 1);
    const gb = Number(a["_usage_ingress_gb_per_month"] ?? 50);
    return `${sku} ${tu} TU + ${gb} GB ingress/mo`;
  },
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
