import {
  ChangeAction,
  CloudProvider,
  ResourceLayer,
  type GraphModel,
} from "@terraform-viz/graph-schema";

/**
 * Multi-cloud data platform.
 * A company runs its core API on AWS, offloads analytics to GCP BigQuery,
 * and integrates with a partner system hosted on Azure Service Bus.
 *
 * 22 resources across AWS + GCP + Azure:
 *   AWS (12):  VPC, ECS Fargate API, Aurora PostgreSQL, S3 data lake,
 *              SQS fanout queue, CloudWatch alarms
 *   GCP  (6):  BigQuery dataset + table, Cloud Storage export bucket,
 *              Pub/Sub subscription, Dataflow streaming job
 *   Azure (4): Resource Group, Service Bus namespace + queue,
 *              Event Grid subscription
 *
 * Change actions: CREATE (new platform), UPDATE (tuning), NO_OP (pre-existing)
 */
export const MULTI_CLOUD_PLATFORM: GraphModel = {
  id: "example-multi-cloud-platform",
  terraformVersion: "1.8.1",
  createdAt: "2026-04-24T10:00:00.000Z",
  nodes: [
    // ══════════════════════════════════════════════════ AWS — NETWORK ══════
    {
      id: "aws_vpc.platform",
      address: "aws_vpc.platform",
      type: "aws_vpc",
      name: "platform",
      provider: CloudProvider.AWS,
      layer: ResourceLayer.NETWORK,
      changeAction: ChangeAction.NO_OP,
      moduleAddress: null,
      attributes: {
        cidr_block: "10.20.0.0/16",
        enable_dns_support: true,
        enable_dns_hostnames: true,
        tags: { Name: "platform-vpc", Env: "prod", Team: "platform", Project: "multi-cloud" },
      },
    },
    {
      id: "aws_subnet.private_a",
      address: "aws_subnet.private_a",
      type: "aws_subnet",
      name: "private_a",
      provider: CloudProvider.AWS,
      layer: ResourceLayer.NETWORK,
      changeAction: ChangeAction.NO_OP,
      moduleAddress: null,
      attributes: { cidr_block: "10.20.10.0/24", availability_zone: "us-east-1a" },
    },
    {
      id: "aws_security_group.api",
      address: "aws_security_group.api",
      type: "aws_security_group",
      name: "api",
      provider: CloudProvider.AWS,
      layer: ResourceLayer.NETWORK,
      changeAction: ChangeAction.CREATE,
      moduleAddress: null,
      attributes: {
        name: "platform-api-sg",
        description: "ECS API container security group",
        tags: { Env: "prod", Team: "api", Project: "multi-cloud" },
      },
    },

    // ══════════════════════════════════════════════════ AWS — COMPUTE ══════
    {
      id: "aws_ecs_cluster.platform",
      address: "aws_ecs_cluster.platform",
      type: "aws_ecs_cluster",
      name: "platform",
      provider: CloudProvider.AWS,
      layer: ResourceLayer.COMPUTE,
      changeAction: ChangeAction.CREATE,
      moduleAddress: null,
      attributes: {
        name: "platform-cluster",
        setting: [{ name: "containerInsights", value: "enabled" }],
        tags: { Env: "prod", Team: "api", Project: "multi-cloud" },
      },
    },
    {
      id: "aws_ecs_task_definition.api",
      address: "aws_ecs_task_definition.api",
      type: "aws_ecs_task_definition",
      name: "api",
      provider: CloudProvider.AWS,
      layer: ResourceLayer.COMPUTE,
      changeAction: ChangeAction.CREATE,
      moduleAddress: null,
      attributes: {
        family: "platform-api",
        cpu: "1024",
        memory: "2048",
        network_mode: "awsvpc",
        requires_compatibilities: ["FARGATE"],
      },
    },
    {
      id: "aws_ecs_service.api",
      address: "aws_ecs_service.api",
      type: "aws_ecs_service",
      name: "api",
      provider: CloudProvider.AWS,
      layer: ResourceLayer.COMPUTE,
      changeAction: ChangeAction.CREATE,
      moduleAddress: null,
      attributes: {
        name: "platform-api",
        desired_count: 3,
        launch_type: "FARGATE",
        tags: { Env: "prod", Team: "api", Project: "multi-cloud" },
      },
    },

    // ════════════════════════════════════════════════ AWS — DATABASE ══════
    {
      id: "aws_rds_cluster.postgres",
      address: "aws_rds_cluster.postgres",
      type: "aws_rds_cluster",
      name: "postgres",
      provider: CloudProvider.AWS,
      layer: ResourceLayer.DATABASE,
      changeAction: ChangeAction.CREATE,
      moduleAddress: null,
      attributes: {
        cluster_identifier: "platform-postgres",
        engine: "aurora-postgresql",
        engine_version: "15.4",
        database_name: "platformdb",
        serverlessv2_scaling_configuration: { min_capacity: 0.5, max_capacity: 8 },
        deletion_protection: true,
        tags: { Env: "prod", Team: "data", Project: "multi-cloud" },
      },
    },
    {
      id: "aws_rds_cluster_instance.postgres_primary",
      address: "aws_rds_cluster_instance.postgres_primary",
      type: "aws_rds_cluster_instance",
      name: "postgres_primary",
      provider: CloudProvider.AWS,
      layer: ResourceLayer.DATABASE,
      changeAction: ChangeAction.CREATE,
      moduleAddress: null,
      attributes: {
        cluster_identifier: "platform-postgres",
        instance_class: "db.serverless",
        engine: "aurora-postgresql",
      },
    },

    // ═════════════════════════════════════════════════ AWS — STORAGE ══════
    {
      id: "aws_s3_bucket.data_lake",
      address: "aws_s3_bucket.data_lake",
      type: "aws_s3_bucket",
      name: "data_lake",
      provider: CloudProvider.AWS,
      layer: ResourceLayer.STORAGE,
      changeAction: ChangeAction.CREATE,
      moduleAddress: null,
      attributes: {
        bucket: "platform-data-lake",
        tags: { Env: "prod", Team: "data", Project: "multi-cloud" },
      },
    },

    // ════════════════════════════════════════════════════ AWS — DATA ══════
    {
      id: "aws_sqs_queue.events",
      address: "aws_sqs_queue.events",
      type: "aws_sqs_queue",
      name: "events",
      provider: CloudProvider.AWS,
      layer: ResourceLayer.DATA,
      changeAction: ChangeAction.CREATE,
      moduleAddress: null,
      attributes: {
        name: "platform-events",
        visibility_timeout_seconds: 60,
        message_retention_seconds: 345600,
        tags: { Env: "prod", Team: "data", Project: "multi-cloud" },
      },
    },
    {
      id: "aws_cloudwatch_metric_alarm.api_errors",
      address: "aws_cloudwatch_metric_alarm.api_errors",
      type: "aws_cloudwatch_metric_alarm",
      name: "api_errors",
      provider: CloudProvider.AWS,
      layer: ResourceLayer.DATA,
      changeAction: ChangeAction.CREATE,
      moduleAddress: null,
      attributes: {
        alarm_name: "platform-api-errors",
        comparison_operator: "GreaterThanThreshold",
        evaluation_periods: 1,
        metric_name: "HTTPCode_Target_5XX_Count",
        namespace: "AWS/ApplicationELB",
        threshold: 10,
      },
    },
    {
      id: "aws_cloudwatch_dashboard.platform",
      address: "aws_cloudwatch_dashboard.platform",
      type: "aws_cloudwatch_dashboard",
      name: "platform",
      provider: CloudProvider.AWS,
      layer: ResourceLayer.DATA,
      changeAction: ChangeAction.UPDATE,
      moduleAddress: null,
      attributes: { dashboard_name: "platform-overview" },
    },

    // ════════════════════════════════════════════ GCP — DATABASE (BQ) ══════
    {
      id: "google_bigquery_dataset.analytics",
      address: "google_bigquery_dataset.analytics",
      type: "google_bigquery_dataset",
      name: "analytics",
      provider: CloudProvider.GCP,
      layer: ResourceLayer.DATABASE,
      changeAction: ChangeAction.CREATE,
      moduleAddress: null,
      attributes: {
        dataset_id: "platform_analytics",
        location: "US",
        delete_contents_on_destroy: false,
        labels: { env: "prod", team: "analytics", project: "multi-cloud" },
      },
    },
    {
      id: "google_bigquery_table.events",
      address: "google_bigquery_table.events",
      type: "google_bigquery_table",
      name: "events",
      provider: CloudProvider.GCP,
      layer: ResourceLayer.DATABASE,
      changeAction: ChangeAction.CREATE,
      moduleAddress: null,
      attributes: {
        dataset_id: "platform_analytics",
        table_id: "events",
        deletion_protection: true,
        labels: { env: "prod", team: "analytics", project: "multi-cloud" },
      },
    },

    // ════════════════════════════════════════════════ GCP — STORAGE ══════
    {
      id: "google_storage_bucket.export",
      address: "google_storage_bucket.export",
      type: "google_storage_bucket",
      name: "export",
      provider: CloudProvider.GCP,
      layer: ResourceLayer.STORAGE,
      changeAction: ChangeAction.CREATE,
      moduleAddress: null,
      attributes: {
        name: "platform-analytics-export",
        location: "US",
        storage_class: "STANDARD",
        labels: { env: "prod", team: "analytics", project: "multi-cloud" },
      },
    },

    // ═════════════════════════════════════════════════════ GCP — DATA ══════
    {
      id: "google_pubsub_subscription.events",
      address: "google_pubsub_subscription.events",
      type: "google_pubsub_subscription",
      name: "events",
      provider: CloudProvider.GCP,
      layer: ResourceLayer.DATA,
      changeAction: ChangeAction.CREATE,
      moduleAddress: null,
      attributes: {
        name: "platform-events-sub",
        ack_deadline_seconds: 60,
        message_retention_duration: "86400s",
        labels: { env: "prod", team: "analytics", project: "multi-cloud" },
      },
    },
    {
      id: "google_dataflow_job.ingest",
      address: "google_dataflow_job.ingest",
      type: "google_dataflow_job",
      name: "ingest",
      provider: CloudProvider.GCP,
      layer: ResourceLayer.DATA,
      changeAction: ChangeAction.CREATE,
      moduleAddress: null,
      attributes: {
        name: "platform-events-ingest",
        template_gcs_path: "gs://dataflow-templates/latest/PubSub_to_BigQuery",
        temp_gcs_location: "gs://platform-analytics-export/tmp",
        labels: { env: "prod", team: "analytics", project: "multi-cloud" },
      },
    },

    // ══════════════════════════════════════ AZURE — NETWORK (resource group) ══
    {
      id: "azurerm_resource_group.partner",
      address: "azurerm_resource_group.partner",
      type: "azurerm_resource_group",
      name: "partner",
      provider: CloudProvider.AZURE,
      layer: ResourceLayer.NETWORK,
      changeAction: ChangeAction.CREATE,
      moduleAddress: null,
      attributes: {
        name: "platform-partner-rg",
        location: "East US",
        tags: { Env: "prod", Team: "integrations", Project: "multi-cloud" },
      },
    },

    // ════════════════════════════════════════════════ AZURE — DATA ══════
    {
      id: "azurerm_servicebus_namespace.partner",
      address: "azurerm_servicebus_namespace.partner",
      type: "azurerm_servicebus_namespace",
      name: "partner",
      provider: CloudProvider.AZURE,
      layer: ResourceLayer.DATA,
      changeAction: ChangeAction.CREATE,
      moduleAddress: null,
      attributes: {
        name: "platform-partner-sb",
        location: "East US",
        resource_group_name: "platform-partner-rg",
        sku: "Standard",
        tags: { Env: "prod", Team: "integrations", Project: "multi-cloud" },
      },
    },
    {
      id: "azurerm_servicebus_queue.inbound",
      address: "azurerm_servicebus_queue.inbound",
      type: "azurerm_servicebus_queue",
      name: "inbound",
      provider: CloudProvider.AZURE,
      layer: ResourceLayer.DATA,
      changeAction: ChangeAction.CREATE,
      moduleAddress: null,
      attributes: {
        name: "partner-inbound",
        namespace_id: "platform-partner-sb",
        max_delivery_count: 10,
        lock_duration: "PT1M",
        tags: { Env: "prod", Team: "integrations", Project: "multi-cloud" },
      },
    },
    {
      id: "azurerm_eventgrid_event_subscription.partner_events",
      address: "azurerm_eventgrid_event_subscription.partner_events",
      type: "azurerm_eventgrid_event_subscription",
      name: "partner_events",
      provider: CloudProvider.AZURE,
      layer: ResourceLayer.DATA,
      changeAction: ChangeAction.CREATE,
      moduleAddress: null,
      attributes: {
        name: "partner-events-subscription",
        event_delivery_schema: "EventGridSchema",
        included_event_types: ["Microsoft.ServiceBus.ActiveMessagesAvailableWithNoListeners"],
      },
    },
  ],
  edges: [
    // AWS network
    { source: "aws_subnet.private_a",           target: "aws_vpc.platform" },
    { source: "aws_security_group.api",          target: "aws_vpc.platform" },
    // AWS compute → network/database
    { source: "aws_ecs_service.api",             target: "aws_ecs_cluster.platform" },
    { source: "aws_ecs_service.api",             target: "aws_ecs_task_definition.api" },
    { source: "aws_ecs_service.api",             target: "aws_security_group.api" },
    { source: "aws_ecs_service.api",             target: "aws_rds_cluster.postgres" },
    { source: "aws_rds_cluster_instance.postgres_primary", target: "aws_rds_cluster.postgres" },
    // AWS data pipeline
    { source: "aws_ecs_service.api",             target: "aws_sqs_queue.events" },
    { source: "aws_sqs_queue.events",            target: "aws_s3_bucket.data_lake" },
    { source: "aws_cloudwatch_metric_alarm.api_errors", target: "aws_cloudwatch_dashboard.platform" },
    // Cross-cloud: AWS S3 → GCP Storage (export) via Dataflow
    { source: "google_dataflow_job.ingest",      target: "google_pubsub_subscription.events" },
    { source: "google_dataflow_job.ingest",      target: "google_storage_bucket.export" },
    { source: "google_dataflow_job.ingest",      target: "google_bigquery_table.events" },
    { source: "google_bigquery_table.events",    target: "google_bigquery_dataset.analytics" },
    { source: "google_pubsub_subscription.events", target: "google_bigquery_dataset.analytics" },
    // Azure
    { source: "azurerm_servicebus_namespace.partner",  target: "azurerm_resource_group.partner" },
    { source: "azurerm_servicebus_queue.inbound",      target: "azurerm_servicebus_namespace.partner" },
    { source: "azurerm_eventgrid_event_subscription.partner_events", target: "azurerm_servicebus_namespace.partner" },
    // Cross-cloud: Azure SB → AWS SQS fanout
    { source: "aws_sqs_queue.events",            target: "azurerm_servicebus_queue.inbound" },
  ],
};
