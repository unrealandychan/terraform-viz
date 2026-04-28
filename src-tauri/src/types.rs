use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub resource_type: String,
    pub provider: String,
    pub layer: String,
    pub change_action: String,
    pub attributes: serde_json::Value,
    pub dependencies: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphModel {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub terraform_version: Option<String>,
    pub provider_counts: serde_json::Value,
}

// Terraform plan JSON shapes
#[derive(Debug, Deserialize)]
pub struct TerraformPlan {
    pub terraform_version: Option<String>,
    pub resource_changes: Option<Vec<ResourceChange>>,
    pub planned_values: Option<PlannedValues>,
}

#[derive(Debug, Deserialize)]
pub struct ResourceChange {
    pub address: String,
    #[serde(rename = "type")]
    pub resource_type: String,
    pub name: String,
    pub change: Change,
    pub depends_on: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct Change {
    pub actions: Vec<String>,
    pub after: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct PlannedValues {
    pub root_module: Option<RootModule>,
}

#[derive(Debug, Deserialize)]
pub struct RootModule {
    pub resources: Option<Vec<PlannedResource>>,
}

#[derive(Debug, Deserialize)]
pub struct PlannedResource {
    pub address: String,
    #[serde(rename = "type")]
    pub resource_type: String,
    pub name: String,
    pub values: Option<serde_json::Value>,
    pub depends_on: Option<Vec<String>>,
}
