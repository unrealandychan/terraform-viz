// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod types;
mod parser;
mod pricing;

/// Command: parse a raw Terraform plan JSON string → GraphModel
#[tauri::command]
async fn parse_plan(raw: String) -> Result<types::GraphModel, String> {
    parser::parse_plan(&raw).map_err(|e| e.to_string())
}

/// Command: estimate costs for all nodes in a GraphModel
#[tauri::command]
async fn estimate_costs(nodes: Vec<types::GraphNode>) -> Result<Vec<serde_json::Value>, String> {
    let results = nodes
        .iter()
        .map(|node| {
            let est = pricing::estimate_cost(node);
            serde_json::json!({
                "id": node.id,
                "monthly": est.monthly,
                "breakdown": est.breakdown,
                "annual": est.monthly.map(|m| (m * 12.0 * 100.0).round() / 100.0),
            })
        })
        .collect();
    Ok(results)
}

/// Command: open a .tfplan or .json file via native file dialog
#[tauri::command]
async fn open_plan_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file = app
        .dialog()
        .file()
        .add_filter("Terraform Plan", &["json", "tfplan"])
        .blocking_pick_file();
    match file {
        Some(path) => {
            let path_str = path.to_string();
            let content = std::fs::read_to_string(&path_str)
                .map_err(|e| e.to_string())?;
            Ok(Some(content))
        }
        None => Ok(None),
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            parse_plan,
            estimate_costs,
            open_plan_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
