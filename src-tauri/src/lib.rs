// lib.rs — re-export for Tauri mobile targets (required by Tauri 2)
pub mod parser;
pub mod types;
pub mod pricing;
pub mod llm;

#[cfg(test)]
mod tests;
