use crate::types::*;
use anyhow::Result;
use std::collections::HashMap;

fn detect_provider(resource_type: &str) -> String {
    if resource_type.starts_with("aws_") { "AWS".into() }
    else if resource_type.starts_with("google_") { "GCP".into() }
    else if resource_type.starts_with("azurerm_") { "Azure".into() }
    else { "Other".into() }
}

fn detect_layer(resource_type: &str) -> String {
    let compute = ["aws_instance", "aws_lambda", "google_compute_instance",
                   "azurerm_virtual_machine", "aws_ecs_service", "aws_eks"];
    let storage = ["aws_s3", "aws_rds", "aws_dynamodb", "google_storage",
                   "google_bigquery", "azurerm_storage"];
    let network = ["aws_vpc", "aws_subnet", "aws_security_group",
                   "google_compute_network", "azurerm_virtual_network",
                   "aws_internet_gateway", "aws_route_table"];
    let data    = ["aws_glue", "aws_kinesis", "google_dataflow",
                   "google_pubsub", "aws_sqs", "aws_sns"];

    if compute.iter().any(|p| resource_type.starts_with(p)) { "COMPUTE".into() }
    else if data.iter().any(|p| resource_type.starts_with(p)) { "DATA".into() }
    else if storage.iter().any(|p| resource_type.starts_with(p)) { "DATA".into() }
    else if network.iter().any(|p| resource_type.starts_with(p)) { "NETWORK".into() }
    else { "OTHER".into() }
}

pub fn parse_plan(raw: &str) -> Result<GraphModel> {
    let plan: TerraformPlan = serde_json::from_str(raw)?;
    let mut nodes: Vec<GraphNode> = Vec::new();
    let mut edges: Vec<GraphEdge> = Vec::new();

    // Build attribute map from planned_values for richer data
    let mut attr_map: HashMap<String, serde_json::Value> = HashMap::new();
    if let Some(pv) = &plan.planned_values {
        if let Some(rm) = &pv.root_module {
            if let Some(resources) = &rm.resources {
                for r in resources {
                    if let Some(vals) = &r.values {
                        attr_map.insert(r.address.clone(), vals.clone());
                    }
                }
            }
        }
    }

    if let Some(changes) = &plan.resource_changes {
        for change in changes {
            // Skip no-op resources
            if change.change.actions == vec!["no-op"] { continue; }

            let action = match change.change.actions.first().map(|s| s.as_str()) {
                Some("create")  => "create",
                Some("delete")  => "delete",
                Some("update")  => "update",
                Some("replace") => "replace",
                _               => "no-op",
            };

            let attributes = attr_map
                .get(&change.address)
                .cloned()
                .or_else(|| change.change.after.clone())
                .unwrap_or(serde_json::Value::Object(Default::default()));

            let deps = change.depends_on.clone().unwrap_or_default();

            // Build edges from dependencies
            for dep in &deps {
                edges.push(GraphEdge {
                    source: dep.clone(),
                    target: change.address.clone(),
                });
            }

            nodes.push(GraphNode {
                id: change.address.clone(),
                name: change.name.clone(),
                resource_type: change.resource_type.clone(),
                provider: detect_provider(&change.resource_type),
                layer: detect_layer(&change.resource_type),
                change_action: action.to_string(),
                attributes,
                dependencies: deps,
            });
        }
    }

    Ok(GraphModel {
        nodes,
        edges,
        terraform_version: plan.terraform_version,
        provider_counts: serde_json::Value::Object(Default::default()),
    })
}
