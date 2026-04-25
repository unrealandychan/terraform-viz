import { CloudProvider, ResourceLayer } from "@terraform-viz/graph-schema";

export interface ResourceClassification {
  readonly provider: CloudProvider;
  readonly layer: ResourceLayer;
}

const AWS_NETWORK_TYPES = new Set([
  "aws_vpc",
  "aws_subnet",
  "aws_security_group",
  "aws_security_group_rule",
  "aws_nat_gateway",
  "aws_internet_gateway",
  "aws_route_table",
  "aws_route_table_association",
  "aws_lb",
  "aws_alb",
  "aws_alb_listener",
  "aws_lb_listener",
  "aws_alb_target_group",
  "aws_lb_target_group",
  "aws_eip",
  "aws_vpc_endpoint",
  "aws_vpn_gateway",
  "aws_dx_gateway",
]);

const AWS_COMPUTE_TYPES = new Set([
  "aws_instance",
  "aws_launch_template",
  "aws_launch_configuration",
  "aws_autoscaling_group",
  "aws_eks_cluster",
  "aws_eks_node_group",
  "aws_eks_fargate_profile",
  "aws_ecs_cluster",
  "aws_ecs_service",
  "aws_ecs_task_definition",
  "aws_lambda_function",
  "aws_batch_compute_environment",
  "aws_batch_job_queue",
]);

const AWS_DATABASE_TYPES = new Set([
  "aws_db_instance",
  "aws_db_cluster",
  "aws_rds_cluster",
  "aws_rds_cluster_instance",
  "aws_elasticache_cluster",
  "aws_elasticache_replication_group",
  "aws_dynamodb_table",
  "aws_redshift_cluster",
  "aws_neptune_cluster",
  "aws_docdb_cluster",
  "aws_opensearch_domain",
]);

const AWS_STORAGE_TYPES = new Set([
  "aws_s3_bucket",
  "aws_s3_bucket_object",
  "aws_s3_object",
  "aws_ebs_volume",
  "aws_ebs_snapshot",
  "aws_efs_file_system",
  "aws_efs_mount_target",
  "aws_fsx_windows_file_system",
  "aws_fsx_lustre_file_system",
  "aws_fsx_openzfs_file_system",
  "aws_backup_vault",
  "aws_backup_plan",
  "aws_glacier_vault",
]);

const AWS_DATA_TYPES = new Set([
  "aws_kinesis_stream",
  "aws_kinesis_firehose_delivery_stream",
  "aws_kinesis_analytics_application",
  "aws_glue_catalog_database",
  "aws_glue_catalog_table",
  "aws_glue_job",
  "aws_glue_crawler",
  "aws_emr_cluster",
  "aws_msk_cluster",
  "aws_msk_configuration",
  "aws_sqs_queue",
  "aws_sns_topic",
  "aws_sns_topic_subscription",
  "aws_sagemaker_endpoint",
  "aws_sagemaker_model",
  "aws_sagemaker_notebook_instance",
  "aws_athena_workgroup",
  "aws_athena_database",
  "aws_lakeformation_resource",
  "aws_datapipeline_pipeline",
  "aws_eventbridge_bus",
  "aws_cloudwatch_event_bus",
]);

const AZURE_NETWORK_TYPES = new Set([
  "azurerm_virtual_network",
  "azurerm_subnet",
  "azurerm_network_security_group",
  "azurerm_network_security_rule",
  "azurerm_public_ip",
  "azurerm_application_gateway",
  "azurerm_lb",
  "azurerm_lb_backend_address_pool",
  "azurerm_lb_rule",
  "azurerm_nat_gateway",
  "azurerm_route_table",
  "azurerm_virtual_network_gateway",
]);

const AZURE_COMPUTE_TYPES = new Set([
  "azurerm_virtual_machine",
  "azurerm_linux_virtual_machine",
  "azurerm_windows_virtual_machine",
  "azurerm_virtual_machine_scale_set",
  "azurerm_kubernetes_cluster",
  "azurerm_kubernetes_cluster_node_pool",
  "azurerm_function_app",
  "azurerm_linux_function_app",
  "azurerm_windows_function_app",
  "azurerm_app_service",
  "azurerm_container_group",
]);

const AZURE_DATABASE_TYPES = new Set([
  "azurerm_mssql_server",
  "azurerm_mssql_database",
  "azurerm_sql_server",
  "azurerm_sql_database",
  "azurerm_postgresql_server",
  "azurerm_postgresql_flexible_server",
  "azurerm_mysql_server",
  "azurerm_mysql_flexible_server",
  "azurerm_cosmosdb_account",
  "azurerm_redis_cache",
]);

const AZURE_STORAGE_TYPES = new Set([
  "azurerm_storage_account",
  "azurerm_storage_container",
  "azurerm_storage_blob",
  "azurerm_managed_disk",
  "azurerm_snapshot",
  "azurerm_backup_protected_vm",
  "azurerm_netapp_volume",
  "azurerm_netapp_pool",
]);

const AZURE_DATA_TYPES = new Set([
  "azurerm_data_factory",
  "azurerm_data_factory_pipeline",
  "azurerm_data_factory_dataset_azure_blob",
  "azurerm_eventhub",
  "azurerm_eventhub_namespace",
  "azurerm_eventhub_consumer_group",
  "azurerm_servicebus_namespace",
  "azurerm_servicebus_queue",
  "azurerm_servicebus_topic",
  "azurerm_stream_analytics_job",
  "azurerm_databricks_workspace",
  "azurerm_hdinsight_kafka_cluster",
  "azurerm_hdinsight_spark_cluster",
  "azurerm_synapse_workspace",
  "azurerm_synapse_sql_pool",
  "azurerm_cognitive_account",
  "azurerm_machine_learning_workspace",
]);

const GCP_NETWORK_TYPES = new Set([
  "google_compute_network",
  "google_compute_subnetwork",
  "google_compute_firewall",
  "google_compute_router",
  "google_compute_router_nat",
  "google_compute_forwarding_rule",
  "google_compute_global_forwarding_rule",
  "google_compute_address",
  "google_compute_global_address",
  "google_compute_vpn_gateway",
]);

const GCP_COMPUTE_TYPES = new Set([
  "google_compute_instance",
  "google_compute_instance_group",
  "google_compute_instance_group_manager",
  "google_compute_autoscaler",
  "google_container_cluster",
  "google_container_node_pool",
  "google_cloudfunctions_function",
  "google_cloudfunctions2_function",
  "google_cloud_run_service",
  "google_app_engine_standard_app_version",
]);

const GCP_DATABASE_TYPES = new Set([
  "google_sql_database_instance",
  "google_sql_database",
  "google_bigtable_instance",
  "google_firestore_document",
  "google_spanner_instance",
  "google_spanner_database",
  "google_redis_instance",
  "google_datastore_index",
]);

const GCP_STORAGE_TYPES = new Set([
  "google_storage_bucket",
  "google_storage_bucket_object",
  "google_compute_disk",
  "google_compute_snapshot",
  "google_filestore_instance",
  "google_backup_dr_backup_vault",
  "google_storage_transfer_job",
]);

const GCP_DATA_TYPES = new Set([
  "google_bigquery_dataset",
  "google_bigquery_table",
  "google_bigquery_job",
  "google_pubsub_topic",
  "google_pubsub_subscription",
  "google_pubsub_lite_topic",
  "google_dataflow_job",
  "google_dataproc_cluster",
  "google_dataproc_job",
  "google_composer_environment",
  "google_data_catalog_taxonomy",
  "google_data_loss_prevention_job_trigger",
  "google_vertex_ai_dataset",
  "google_vertex_ai_endpoint",
]);

function classifyAwsLayer(resourceType: string): ResourceLayer {
  if (AWS_NETWORK_TYPES.has(resourceType)) return ResourceLayer.NETWORK;
  if (AWS_COMPUTE_TYPES.has(resourceType)) return ResourceLayer.COMPUTE;
  if (AWS_DATABASE_TYPES.has(resourceType)) return ResourceLayer.DATABASE;
  if (AWS_STORAGE_TYPES.has(resourceType)) return ResourceLayer.STORAGE;
  if (AWS_DATA_TYPES.has(resourceType)) return ResourceLayer.DATA;
  return ResourceLayer.UNKNOWN;
}

function classifyAzureLayer(resourceType: string): ResourceLayer {
  if (AZURE_NETWORK_TYPES.has(resourceType)) return ResourceLayer.NETWORK;
  if (AZURE_COMPUTE_TYPES.has(resourceType)) return ResourceLayer.COMPUTE;
  if (AZURE_DATABASE_TYPES.has(resourceType)) return ResourceLayer.DATABASE;
  if (AZURE_STORAGE_TYPES.has(resourceType)) return ResourceLayer.STORAGE;
  if (AZURE_DATA_TYPES.has(resourceType)) return ResourceLayer.DATA;
  return ResourceLayer.UNKNOWN;
}

function classifyGcpLayer(resourceType: string): ResourceLayer {
  if (GCP_NETWORK_TYPES.has(resourceType)) return ResourceLayer.NETWORK;
  if (GCP_COMPUTE_TYPES.has(resourceType)) return ResourceLayer.COMPUTE;
  if (GCP_DATABASE_TYPES.has(resourceType)) return ResourceLayer.DATABASE;
  if (GCP_STORAGE_TYPES.has(resourceType)) return ResourceLayer.STORAGE;
  if (GCP_DATA_TYPES.has(resourceType)) return ResourceLayer.DATA;
  return ResourceLayer.UNKNOWN;
}

function detectProvider(resourceType: string): CloudProvider {
  if (resourceType.startsWith("aws_")) return CloudProvider.AWS;
  if (resourceType.startsWith("azurerm_")) return CloudProvider.AZURE;
  if (resourceType.startsWith("google_")) return CloudProvider.GCP;
  return CloudProvider.UNKNOWN;
}

export function classifyResource(resourceType: string): ResourceClassification {
  const provider = detectProvider(resourceType);

  const layerByProvider: Record<CloudProvider, (type: string) => ResourceLayer> = {
    [CloudProvider.AWS]: classifyAwsLayer,
    [CloudProvider.AZURE]: classifyAzureLayer,
    [CloudProvider.GCP]: classifyGcpLayer,
    [CloudProvider.UNKNOWN]: () => ResourceLayer.UNKNOWN,
  };

  const classify = layerByProvider[provider] ?? ((_type: string): ResourceLayer => ResourceLayer.UNKNOWN);
  const layer = classify(resourceType);
  return { provider, layer };
}
