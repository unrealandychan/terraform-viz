export interface UsageParam {
  key: string;
  label: string;
  unit: string;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  hint?: string;
}

export const USAGE_PARAMS: Record<string, UsageParam[]> = {
  // ─── AWS ──────────────────────────────────────────────────────
  aws_lambda_function: [
    { key: "_usage_requests_m",      label: "Invocations",  unit: "M/mo", defaultValue: 1,   min: 0, max: 100, step: 1,    hint: "First 1M free" },
    { key: "_usage_memory_mb",       label: "Memory",       unit: "MB",   defaultValue: 256, min: 128, max: 1024, step: 64 },
    { key: "_usage_avg_duration_ms", label: "Avg Duration", unit: "ms",   defaultValue: 200, min: 1,   max: 1000, step: 1  },
  ],
  aws_s3_bucket: [
    { key: "_usage_storage_gb",       label: "Storage",      unit: "GB",   defaultValue: 50,   min: 0, max: 100, step: 1 },
    { key: "_usage_put_requests_k",   label: "PUT Requests", unit: "K/mo", defaultValue: 100,  min: 0, max: 100, step: 1 },
    { key: "_usage_get_requests_k",   label: "GET Requests", unit: "K/mo", defaultValue: 1000, min: 0, max: 100, step: 1 },
  ],
  aws_dynamodb_table: [
    { key: "_usage_write_requests_m", label: "Write Requests", unit: "M/mo", defaultValue: 1, min: 0, max: 100, step: 1 },
    { key: "_usage_read_requests_m",  label: "Read Requests",  unit: "M/mo", defaultValue: 5, min: 0, max: 100, step: 1 },
  ],
  aws_sqs_queue: [
    { key: "_usage_requests_m", label: "Messages", unit: "M/mo", defaultValue: 1, min: 0, max: 100, step: 1, hint: "First 1M free" },
  ],
  aws_sns_topic: [
    { key: "_usage_publishes_m", label: "Publishes", unit: "M/mo", defaultValue: 1, min: 0, max: 100, step: 1, hint: "First 1M free" },
  ],
  aws_apigatewayv2_api: [
    { key: "_usage_calls_m", label: "API Calls", unit: "M/mo", defaultValue: 1, min: 0, max: 100, step: 1 },
  ],
  aws_api_gateway_rest_api: [
    { key: "_usage_calls_m", label: "API Calls", unit: "M/mo", defaultValue: 1, min: 0, max: 100, step: 1 },
  ],
  aws_kinesis_firehose_delivery_stream: [
    { key: "_usage_data_gb_per_month", label: "Data Ingested", unit: "GB/mo", defaultValue: 100, min: 0, max: 100, step: 1 },
  ],
  aws_cloudwatch_log_group: [
    { key: "_usage_ingest_gb_per_month", label: "Log Ingest",   unit: "GB/mo", defaultValue: 10, min: 0, max: 100, step: 1 },
    { key: "_usage_store_gb",            label: "Log Storage",  unit: "GB",    defaultValue: 30, min: 0, max: 100, step: 1 },
  ],
  aws_glue_job: [
    { key: "_usage_hours_per_month", label: "Job Hours", unit: "hr/mo", defaultValue: 20, min: 0, max: 100, step: 1 },
  ],
  aws_athena_workgroup: [
    { key: "_usage_scan_tb_per_month", label: "Data Scanned", unit: "TB/mo", defaultValue: 1, min: 0, max: 100, step: 1 },
  ],
  aws_sfn_state_machine: [
    { key: "_usage_state_transitions_k", label: "State Transitions", unit: "K/mo", defaultValue: 10, min: 0, max: 100, step: 1, hint: "First 4K free (Standard)" },
  ],
  aws_step_functions_state_machine: [
    { key: "_usage_state_transitions_k", label: "State Transitions", unit: "K/mo", defaultValue: 10, min: 0, max: 100, step: 1 },
  ],
  // ─── GCP ──────────────────────────────────────────────────────
  google_storage_bucket: [
    { key: "_usage_storage_gb",      label: "Storage",    unit: "GB",   defaultValue: 50,   min: 0, max: 100, step: 1 },
    { key: "_usage_class_a_ops_k",   label: "Write Ops",  unit: "K/mo", defaultValue: 100,  min: 0, max: 100, step: 1 },
    { key: "_usage_class_b_ops_k",   label: "Read Ops",   unit: "K/mo", defaultValue: 100,  min: 0, max: 100, step: 1 },
  ],
  google_bigquery_dataset: [
    { key: "_usage_storage_gb", label: "Storage", unit: "GB", defaultValue: 0, min: 0, max: 100, step: 1 },
  ],
  google_bigquery_table: [
    { key: "_usage_storage_gb",            label: "Storage",      unit: "GB",    defaultValue: 10,  min: 0, max: 100, step: 1 },
    { key: "_usage_queries_tb_per_month",  label: "Query Volume", unit: "TB/mo", defaultValue: 1,   min: 0, max: 100, step: 1, hint: "First 1TB/mo free" },
  ],
  google_pubsub_topic: [
    { key: "_usage_message_gb_per_month", label: "Message Volume", unit: "GB/mo", defaultValue: 5, min: 0, max: 100, step: 1, hint: "First 10GB free" },
  ],
  google_pubsub_subscription: [
    { key: "_usage_message_gb_per_month", label: "Message Volume", unit: "GB/mo", defaultValue: 5, min: 0, max: 100, step: 1, hint: "First 10GB free" },
  ],
  google_dataflow_job: [
    { key: "num_workers",              label: "Min Workers",  unit: "workers", defaultValue: 2,   min: 1, max: 50,  step: 1, hint: "Cost = avg of min+max (autoscaling estimate)" },
    { key: "max_workers",              label: "Max Workers",  unit: "workers", defaultValue: 4,   min: 1, max: 50,  step: 1 },
    { key: "_usage_hours_per_month",   label: "Job Hours",    unit: "hr/mo",   defaultValue: 100, min: 1, max: 730, step: 10, hint: "Batch only — streaming always uses 730 hr/mo" },
  ],
  google_cloud_run_service: [
    { key: "_usage_requests_m",    label: "Requests",     unit: "M/mo",     defaultValue: 1, min: 0, max: 100, step: 1, hint: "First 2M free" },
    { key: "_usage_min_instances", label: "Min Instances", unit: "instances", defaultValue: 0, min: 0, max: 20,  step: 1, hint: "Always-on instances" },
  ],
  google_cloud_run_v2_service: [
    { key: "_usage_requests_m",    label: "Requests",     unit: "M/mo",     defaultValue: 1, min: 0, max: 100, step: 1, hint: "First 2M free" },
    { key: "_usage_min_instances", label: "Min Instances", unit: "instances", defaultValue: 0, min: 0, max: 20,  step: 1 },
  ],
  google_cloudfunctions_function: [
    { key: "_usage_requests_m",      label: "Invocations",  unit: "M/mo", defaultValue: 1,   min: 0,   max: 100,  step: 1,  hint: "First 2M free" },
    { key: "_usage_memory_mb",       label: "Memory",       unit: "MB",   defaultValue: 256, min: 128, max: 1024, step: 64 },
    { key: "_usage_avg_duration_ms", label: "Avg Duration", unit: "ms",   defaultValue: 200, min: 1,   max: 1000, step: 1  },
  ],
  // ─── Azure ────────────────────────────────────────────────────
  azurerm_cosmosdb_account: [
    { key: "_usage_request_units_per_sec", label: "Request Units", unit: "RU/s", defaultValue: 400, min: 100, max: 10000, step: 100, hint: "$6 per 100 RU/s" },
    { key: "_usage_storage_gb",            label: "Storage",       unit: "GB",   defaultValue: 10,  min: 0,   max: 100,   step: 1   },
  ],
  azurerm_function_app: [
    { key: "_usage_executions_m", label: "Executions", unit: "M/mo", defaultValue: 1, min: 0, max: 100, step: 1, hint: "First 1M free (Consumption plan)" },
  ],
  azurerm_linux_function_app: [
    { key: "_usage_executions_m", label: "Executions", unit: "M/mo", defaultValue: 1, min: 0, max: 100, step: 1, hint: "First 1M free" },
  ],
  azurerm_windows_function_app: [
    { key: "_usage_executions_m", label: "Executions", unit: "M/mo", defaultValue: 1, min: 0, max: 100, step: 1 },
  ],
  azurerm_container_app: [
    { key: "_usage_vcpu",                   label: "vCPU",         unit: "cores",    defaultValue: 0.5, min: 0.25, max: 4,   step: 0.25 },
    { key: "_usage_memory_gb",              label: "Memory",       unit: "GB",       defaultValue: 1,   min: 0.5,  max: 8,   step: 0.5  },
    { key: "_usage_active_hours_per_month", label: "Active Hours", unit: "hr/mo",    defaultValue: 100, min: 0,    max: 100, step: 1    },
    { key: "_usage_min_replicas",           label: "Min Replicas", unit: "instances", defaultValue: 0,  min: 0,    max: 10,  step: 1,   hint: "Always-on replicas" },
  ],
  azurerm_cdn_endpoint: [
    { key: "_usage_egress_gb_per_month", label: "Egress", unit: "GB/mo", defaultValue: 100, min: 0, max: 100, step: 1 },
  ],
  azurerm_eventhub_namespace: [
    { key: "_usage_ingress_gb_per_month", label: "Ingress Data", unit: "GB/mo", defaultValue: 50, min: 0, max: 100, step: 1 },
  ],
};

export function getUsageParams(resourceType: string): UsageParam[] {
  return USAGE_PARAMS[resourceType] ?? [];
}

export function isUsageBased(resourceType: string): boolean {
  return (USAGE_PARAMS[resourceType]?.length ?? 0) > 0;
}
