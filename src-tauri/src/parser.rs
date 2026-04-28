pub use crate::types::*;
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

    // Build change-action map from resource_changes (keyed by address)
    let mut action_map: HashMap<String, String> = HashMap::new();
    if let Some(changes) = &plan.resource_changes {
        for change in changes {
            let action = if change.change.actions.contains(&"create".to_string())
                && change.change.actions.contains(&"delete".to_string())
            {
                "replace"
            } else {
                match change.change.actions.first().map(|s| s.as_str()) {
                    Some("create")  => "create",
                    Some("delete")  => "delete",
                    Some("update")  => "update",
                    _               => "no-op",
                }
            };
            action_map.insert(change.address.clone(), action.to_string());
        }
    }

    // Primary source: planned_values.root_module.resources
    // This is present in ALL valid Terraform plan JSON files.
    // resource_changes may be absent (e.g. terraform show -json on state files).
    if let Some(pv) = &plan.planned_values {
        if let Some(rm) = &pv.root_module {
            if let Some(resources) = &rm.resources {
                for r in resources {
                    let change_action = action_map
                        .get(&r.address)
                        .cloned()
                        .unwrap_or_else(|| "no-op".to_string());

                    let deps = r.depends_on.clone().unwrap_or_default();

                    // Build edges from dependencies
                    for dep in &deps {
                        edges.push(GraphEdge {
                            source: dep.clone(),
                            target: r.address.clone(),
                        });
                    }

                    nodes.push(GraphNode {
                        id: r.address.clone(),
                        name: r.name.clone(),
                        resource_type: r.resource_type.clone(),
                        provider: detect_provider(&r.resource_type),
                        layer: detect_layer(&r.resource_type),
                        change_action,
                        attributes: r.values.clone().unwrap_or(serde_json::Value::Object(Default::default())),
                        dependencies: deps,
                    });
                }
            }
        }
    }

    // Filter edges so both source and target exist as nodes
    let node_ids: std::collections::HashSet<String> = nodes.iter().map(|n| n.id.clone()).collect();
    edges.retain(|e| node_ids.contains(&e.source) && node_ids.contains(&e.target));

    Ok(GraphModel {
        nodes,
        edges,
        terraform_version: plan.terraform_version,
        provider_counts: serde_json::Value::Object(Default::default()),
    })
}
