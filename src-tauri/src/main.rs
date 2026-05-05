// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod types;
mod parser;
mod pricing;
mod llm;

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
/// Returns { content, file_name } or null if the user cancelled.
#[tauri::command]
async fn open_plan_file(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
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
            // Extract just the filename (no directory)
            let file_name = std::path::Path::new(&path_str)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("plan")
                .to_string();
            Ok(Some(serde_json::json!({
                "content": content,
                "file_name": file_name,
            })))
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
            llm::chat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
