/// Integration tests for the desktop Rust parser (parser.rs).
///
/// Coverage:
///   1. no_resource_changes_still_renders_nodes
///      – Files like aws-iot-pipeline have ONLY planned_values (no resource_changes).
///        Before the fix the parser returned 0 nodes.
///   2. resource_changes_action_applied
///      – When resource_changes IS present, each node gets the right change_action.
///   3. depends_on_from_planned_values_builds_edges
///      – depends_on lives inside planned_values, not resource_changes.
///        Parser must build edges from there.
///   4. replace_action_create_delete
///      – [create, delete] combo maps to "replace".
///   5. no_op_resources_are_included
///      – no-op resources should still appear as nodes (display-only).
///   6. dangling_edge_filtered_out
///      – If a depends_on points to a resource that doesn't exist, the edge is dropped.
///   7. provider_and_layer_classification
///      – Spot-check provider/layer detection for aws_, google_, azurerm_.
///   8. all_example_files_parse_without_error
///      – Smoke-test every JSON in /examples/ — must return ≥1 node and 0 errors.

#[cfg(test)]
mod tests {
    use crate::parser::parse_plan;

    // ── helpers ─────────────────────────────────────────────────────────────

    fn planned_resource(address: &str, rtype: &str) -> String {
        format!(
            r#"{{
                "address": "{address}",
                "mode": "managed",
                "type": "{rtype}",
                "name": "{name}",
                "provider_name": "registry.terraform.io/hashicorp/aws",
                "schema_version": 0,
                "values": {{ "id": "dummy" }}
            }}"#,
            address = address,
            rtype = rtype,
            name = address.split('.').last().unwrap_or("res"),
        )
    }

    fn planned_resource_with_deps(address: &str, rtype: &str, deps: &[&str]) -> String {
        let dep_str = deps
            .iter()
            .map(|d| format!("\"{}\"", d))
            .collect::<Vec<_>>()
            .join(", ");
        format!(
            r#"{{
                "address": "{address}",
                "mode": "managed",
                "type": "{rtype}",
                "name": "{name}",
                "provider_name": "registry.terraform.io/hashicorp/aws",
                "schema_version": 0,
                "values": {{ "id": "dummy" }},
                "depends_on": [{dep_str}]
            }}"#,
            address = address,
            rtype = rtype,
            name = address.split('.').last().unwrap_or("res"),
            dep_str = dep_str,
        )
    }

    fn make_plan(resources_json: &str, changes_json: Option<&str>) -> String {
        let changes = match changes_json {
            Some(c) => format!(", \"resource_changes\": {}", c),
            None => String::new(),
        };
        format!(
            r#"{{
                "format_version": "1.0",
                "terraform_version": "1.7.5",
                "planned_values": {{
                    "root_module": {{
                        "resources": {resources_json}
                    }}
                }}{changes}
            }}"#,
            resources_json = resources_json,
            changes = changes,
        )
    }

    // ── tests ────────────────────────────────────────────────────────────────

    /// Bug 1 fix: files with no resource_changes must still produce nodes.
    #[test]
    fn no_resource_changes_still_renders_nodes() {
        let plan = make_plan(
            &format!("[{}]", planned_resource("aws_s3_bucket.site", "aws_s3_bucket")),
            None,
        );
        let model = parse_plan(&plan).expect("parse failed");
        assert_eq!(model.nodes.len(), 1, "expected 1 node even without resource_changes");
        assert_eq!(model.nodes[0].id, "aws_s3_bucket.site");
        assert_eq!(
            model.nodes[0].change_action, "no-op",
            "no resource_changes → action should default to no-op"
        );
    }

    /// resource_changes present → node gets correct change_action.
    #[test]
    fn resource_changes_action_applied() {
        let resources = format!(
            "[{}, {}, {}, {}]",
            planned_resource("aws_s3_bucket.a", "aws_s3_bucket"),
            planned_resource("aws_lambda_function.b", "aws_lambda_function"),
            planned_resource("aws_vpc.c", "aws_vpc"),
            planned_resource("aws_rds_cluster.d", "aws_rds_cluster"),
        );
        let changes = r#"[
            {"address":"aws_s3_bucket.a","type":"aws_s3_bucket","name":"a","change":{"actions":["create"],"after":{}}},
            {"address":"aws_lambda_function.b","type":"aws_lambda_function","name":"b","change":{"actions":["update"],"after":{}}},
            {"address":"aws_vpc.c","type":"aws_vpc","name":"c","change":{"actions":["delete"],"after":{}}},
            {"address":"aws_rds_cluster.d","type":"aws_rds_cluster","name":"d","change":{"actions":["no-op"],"after":{}}}
        ]"#;
        let plan = make_plan(&resources, Some(changes));
        let model = parse_plan(&plan).expect("parse failed");
        assert_eq!(model.nodes.len(), 4);
        let find = |id: &str| model.nodes.iter().find(|n| n.id == id).unwrap();
        assert_eq!(find("aws_s3_bucket.a").change_action, "create");
        assert_eq!(find("aws_lambda_function.b").change_action, "update");
        assert_eq!(find("aws_vpc.c").change_action, "delete");
        assert_eq!(find("aws_rds_cluster.d").change_action, "no-op");
    }

    /// Bug 2 fix: depends_on in planned_values must build edges.
    #[test]
    fn depends_on_from_planned_values_builds_edges() {
        let resources = format!(
            "[{}, {}]",
            planned_resource("aws_vpc.main", "aws_vpc"),
            planned_resource_with_deps("aws_subnet.pub", "aws_subnet", &["aws_vpc.main"]),
        );
        let plan = make_plan(&resources, None);
        let model = parse_plan(&plan).expect("parse failed");
        assert_eq!(model.edges.len(), 1, "expected 1 edge from depends_on");
        assert_eq!(model.edges[0].source, "aws_vpc.main");
        assert_eq!(model.edges[0].target, "aws_subnet.pub");
    }

    /// [create, delete] combo → replace action.
    #[test]
    fn replace_action_create_delete() {
        let resources = format!("[{}]", planned_resource("aws_instance.web", "aws_instance"));
        let changes = r#"[
            {"address":"aws_instance.web","type":"aws_instance","name":"web",
             "change":{"actions":["create","delete"],"after":{}}}
        ]"#;
        let plan = make_plan(&resources, Some(changes));
        let model = parse_plan(&plan).expect("parse failed");
        assert_eq!(model.nodes[0].change_action, "replace");
    }

    /// no-op resources should be included in nodes (not filtered out).
    #[test]
    fn no_op_resources_are_included() {
        let resources = format!("[{}]", planned_resource("aws_s3_bucket.keep", "aws_s3_bucket"));
        let changes = r#"[
            {"address":"aws_s3_bucket.keep","type":"aws_s3_bucket","name":"keep",
             "change":{"actions":["no-op"],"after":{}}}
        ]"#;
        let plan = make_plan(&resources, Some(changes));
        let model = parse_plan(&plan).expect("parse failed");
        assert_eq!(model.nodes.len(), 1, "no-op node must NOT be filtered out");
    }

    /// Dangling depends_on (target doesn't exist) must be silently dropped.
    #[test]
    fn dangling_edge_filtered_out() {
        let resources = format!(
            "[{}]",
            planned_resource_with_deps(
                "aws_subnet.sub",
                "aws_subnet",
                &["aws_vpc.nonexistent"],
            ),
        );
        let plan = make_plan(&resources, None);
        let model = parse_plan(&plan).expect("parse failed");
        assert_eq!(model.nodes.len(), 1);
        assert_eq!(model.edges.len(), 0, "dangling edge must be dropped");
    }

    /// Provider and layer classification smoke-test.
    #[test]
    fn provider_and_layer_classification() {
        let resources = format!(
            "[{}, {}, {}, {}]",
            planned_resource("aws_vpc.v", "aws_vpc"),
            planned_resource("google_compute_instance.g", "google_compute_instance"),
            planned_resource("azurerm_storage_account.az", "azurerm_storage_account"),
            planned_resource("aws_lambda_function.fn", "aws_lambda_function"),
        );
        let plan = make_plan(&resources, None);
        let model = parse_plan(&plan).expect("parse failed");
        let find = |id: &str| model.nodes.iter().find(|n| n.id == id).unwrap();
        assert_eq!(find("aws_vpc.v").provider, "AWS");
        assert_eq!(find("aws_vpc.v").layer, "NETWORK");
        assert_eq!(find("google_compute_instance.g").provider, "GCP");
        assert_eq!(find("google_compute_instance.g").layer, "COMPUTE");
        assert_eq!(find("azurerm_storage_account.az").provider, "Azure");
        assert_eq!(find("aws_lambda_function.fn").layer, "COMPUTE");
    }

    /// Smoke-test all example JSON files ship with the repo.
    /// Each must parse without error and return ≥1 node.
    #[test]
    fn all_example_files_parse_without_error() {
        let examples_dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../examples");
        let entries = std::fs::read_dir(examples_dir)
            .expect("examples/ directory not found");

        let mut tested = 0u32;
        for entry in entries {
            let path = entry.unwrap().path();
            if path.extension().and_then(|e| e.to_str()) != Some("json") {
                continue;
            }
            let raw = std::fs::read_to_string(&path)
                .unwrap_or_else(|e| panic!("failed to read {:?}: {}", path, e));
            let model = parse_plan(&raw)
                .unwrap_or_else(|e| panic!("parse_plan failed for {:?}: {}", path, e));
            assert!(
                !model.nodes.is_empty(),
                "example {:?} produced 0 nodes — graph would be blank",
                path.file_name().unwrap()
            );
            tested += 1;
        }
        assert!(tested > 0, "no example JSON files found in examples/");
        println!("✅ smoke-tested {} example files", tested);
    }
}
