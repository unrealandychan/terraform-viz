use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct ChatRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
}

#[derive(Serialize, Deserialize)]
struct ChatMessage {
    role: String,
    content: String,
}

/// Command: send a chat message to an OpenAI-compatible API and return the assistant reply.
///
/// Parameters:
/// - `api_key`  — Bearer token for the API (pass an empty string for local/unauthenticated endpoints)
/// - `base_url` — Base URL of the OpenAI-compatible endpoint, e.g. `https://api.openai.com/v1`
/// - `model`    — Model identifier, e.g. `gpt-4o-mini`
/// - `messages` — Array of `{ role, content }` objects representing the conversation history
#[tauri::command]
pub async fn chat(
    api_key: String,
    base_url: String,
    model: String,
    messages: Vec<serde_json::Value>,
) -> Result<String, String> {
    let client = Client::new();

    let msgs: Vec<ChatMessage> = messages
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let role = m["role"]
                .as_str()
                .ok_or_else(|| format!("messages[{i}].role must be a string"))?
                .to_string();
            let content = m["content"]
                .as_str()
                .ok_or_else(|| format!("messages[{i}].content must be a string"))?
                .to_string();
            Ok(ChatMessage { role, content })
        })
        .collect::<Result<Vec<_>, String>>()?;

    let req = ChatRequest { model, messages: msgs, stream: false };
    let url = format!("{}/chat/completions", base_url.trim_end_matches('/'));

    let mut request_builder = client.post(&url).json(&req);
    if !api_key.is_empty() {
        request_builder = request_builder.bearer_auth(&api_key);
    }

    let resp = request_builder
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let status = resp.status();
    let body_text = resp.text().await.map_err(|e| e.to_string())?;
    let body: serde_json::Value = serde_json::from_str(&body_text).map_err(|e| {
        if status.is_success() {
            e.to_string()
        } else {
            format!("HTTP {}: {}", status, body_text)
        }
    })?;

    if !status.is_success() {
        return Err(
            body["error"]["message"]
                .as_str()
                .map(|s| s.to_string())
                .unwrap_or_else(|| format!("HTTP {}: {}", status, body_text)),
        );
    }

    let content = body["choices"][0]["message"]["content"]
        .as_str()
        .ok_or_else(|| {
            // Surface the API error message if present
            body["error"]["message"]
                .as_str()
                .unwrap_or("unexpected response: missing choices[0].message.content")
                .to_string()
        })?
        .to_string();

    Ok(content)
}
