use crate::types::GraphNode;
use serde_json::Value;

pub struct CostEstimate {
    pub monthly: Option<f64>,
    pub breakdown: Option<String>,
}

fn attr_str(attrs: &Value, key: &str) -> String {
    attrs.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn attr_f64(attrs: &Value, key: &str, default: f64) -> f64 {
    attrs.get(key)
        .and_then(|v| v.as_f64())
        .unwrap_or(default)
}

pub fn estimate_cost(node: &GraphNode) -> CostEstimate {
    let a = &node.attributes;
    match node.resource_type.as_str() {
        // ── AWS Compute ────────────────────────────────────────────────────
        "aws_instance" => {
            let instance_type = attr_str(a, "instance_type");
            let monthly = match instance_type.as_str() {
                "t3.micro"   => 7.59,
                "t3.small"   => 15.18,
                "t3.medium"  => 30.37,
                "t3.large"   => 60.74,
                "m5.large"   => 70.08,
                "m5.xlarge"  => 140.16,
                "c5.large"   => 61.20,
                "c5.xlarge"  => 124.10,
                "r5.large"   => 91.98,
                _            => 36.50,
            };
            CostEstimate {
                monthly: Some(monthly),
                breakdown: Some(format!("{} on-demand (us-east-1 est.)", instance_type)),
            }
        }
        "aws_lambda_function" => CostEstimate {
            monthly: Some(5.0),
            breakdown: Some("≈1M req/mo + compute time est.".into()),
        },
        "aws_eks_cluster" => CostEstimate {
            monthly: Some(73.0),
            breakdown: Some("EKS control plane flat fee ($0.10/hr)".into()),
        },
        "aws_rds_instance" | "aws_db_instance" => {
            let class = attr_str(a, "instance_class");
            let monthly = match class.as_str() {
                "db.t3.micro"  => 12.41,
                "db.t3.small"  => 24.82,
                "db.t3.medium" => 49.64,
                "db.m5.large"  => 124.83,
                _              => 50.0,
            };
            CostEstimate {
                monthly: Some(monthly),
                breakdown: Some(format!("{} RDS est.", class)),
            }
        }
        "aws_nat_gateway"    => CostEstimate { monthly: Some(36.5),  breakdown: Some("$0.045/hr + data processing".into()) },
        "aws_s3_bucket"      => CostEstimate { monthly: Some(2.5),   breakdown: Some("50GB storage est.".into()) },
        "aws_dynamodb_table" => CostEstimate { monthly: Some(5.0),   breakdown: Some("on-demand capacity est.".into()) },
        "aws_cloudwatch_log_group" => {
            let ingestion_gb = attr_f64(a, "_usage_ingestion_gb", 10.0);
            let storage_gb   = attr_f64(a, "_usage_storage_gb", 20.0);
            let cost = ingestion_gb * 0.50 + storage_gb * 0.03;
            CostEstimate {
                monthly: Some((cost * 100.0).round() / 100.0),
                breakdown: Some(format!("{}GB ingestion × $0.50 + {}GB storage × $0.03", ingestion_gb, storage_gb)),
            }
        }
        // ── GCP ────────────────────────────────────────────────────────────
        "google_storage_bucket"      => CostEstimate { monthly: Some(1.0),  breakdown: Some("50GB Standard storage est.".into()) },
        "google_bigquery_dataset"    => CostEstimate { monthly: Some(0.0),  breakdown: Some("$0 (dataset free, pay per query/storage)".into()) },
        "google_pubsub_topic"        => CostEstimate { monthly: Some(0.5),  breakdown: Some("5GB message volume est.".into()) },
        "google_pubsub_subscription" => CostEstimate { monthly: Some(0.5),  breakdown: Some("5GB message volume est.".into()) },
        "google_project_service"     => CostEstimate { monthly: Some(0.0),  breakdown: Some("API enablement (free)".into()) },
        "google_dataflow_job" => {
            let machine_type = attr_str(a, "machine_type");
            let (vcpu, ram) = match machine_type.as_str() {
                "n1-standard-1" => (1.0_f64, 3.75_f64),
                "n1-standard-2" => (2.0, 7.5),
                "n1-standard-4" => (4.0, 15.0),
                "n1-standard-8" => (8.0, 30.0),
                "n2-standard-2" => (2.0, 8.0),
                "n2-standard-4" => (4.0, 16.0),
                _               => (4.0, 15.0),
            };
            let num_workers = attr_f64(a, "num_workers", 2.0);
            let max_workers = attr_f64(a, "max_workers", num_workers * 2.0);
            let avg_workers = (num_workers + max_workers) / 2.0;
            let job_type    = attr_str(a, "type").to_lowercase();
            let hours       = if job_type == "streaming" { 730.0 } else { attr_f64(a, "_usage_hours_per_month", 100.0) };
            let disk_gb     = attr_f64(a, "disk_size_gb", 250.0);
            let vcpu_cost   = avg_workers * vcpu * hours * 0.056;
            let ram_cost    = avg_workers * ram  * hours * 0.003375;
            let disk_cost   = avg_workers * disk_gb * hours * 0.000054;
            let total       = (vcpu_cost + ram_cost + disk_cost) * 1.10;
            CostEstimate {
                monthly: Some((total * 100.0).round() / 100.0),
                breakdown: Some(format!(
                    "{} × avg {}w ({}-{} autoscale) × {}h/mo | vCPU+RAM+disk+10% overhead",
                    machine_type, avg_workers, num_workers, max_workers, hours
                )),
            }
        }
        // ── Azure ──────────────────────────────────────────────────────────
        "azurerm_virtual_machine"    => CostEstimate { monthly: Some(70.0),  breakdown: Some("Standard_D2s_v3 est.".into()) },
        "azurerm_storage_account"    => CostEstimate { monthly: Some(5.0),   breakdown: Some("LRS 50GB est.".into()) },
        "azurerm_sql_database"       => CostEstimate { monthly: Some(15.0),  breakdown: Some("Basic tier est.".into()) },
        "azurerm_kubernetes_cluster" => CostEstimate { monthly: Some(73.0),  breakdown: Some("AKS control plane flat fee".into()) },
        // ── Free resources ─────────────────────────────────────────────────
        "aws_vpc"
        | "aws_subnet"
        | "aws_security_group"
        | "aws_internet_gateway"
        | "aws_route_table"
        | "aws_route_table_association"
        | "aws_iam_role"
        | "aws_iam_policy"
        | "aws_iam_role_policy_attachment"
        | "google_compute_network"
        | "google_compute_subnetwork"
        | "google_compute_firewall"
        | "google_project_iam_member"
        | "google_pubsub_topic_iam_member"
        | "google_storage_notification"
        | "azurerm_resource_group"
        | "azurerm_virtual_network" => CostEstimate {
            monthly: Some(0.0),
            breakdown: Some("free".into()),
        },
        _ => CostEstimate { monthly: None, breakdown: None },
    }
}
