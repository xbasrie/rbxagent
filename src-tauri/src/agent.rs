use crate::settings::LlmSettings;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "system", "user", "assistant"
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProposedChange {
    pub script_id: String,
    pub script_name: String,
    pub original_code: String,
    pub modified_code: String,
    pub status: String, // "pending", "approved", "rejected"
}

pub struct AgentSession {
    pub messages: Arc<Mutex<Vec<ChatMessage>>>,
    pub pending_changes: Arc<Mutex<Vec<ProposedChange>>>,
    pub client: reqwest::Client,
}

impl AgentSession {
    pub fn new() -> Self {
        Self {
            messages: Arc::new(Mutex::new(Vec::new())),
            pending_changes: Arc::new(Mutex::new(Vec::new())),
            client: reqwest::Client::new(),
        }
    }

    pub async fn execute_turn(
        &self,
        prompt: &str,
        settings: &LlmSettings,
        studio_context: &str,
    ) -> Result<String, String> {
        let system_prompt = format!(
            "You are RobloxKit AI, an expert Roblox Game Engineer and Luau developer.\n\
             Roblox Studio Current Context:\n{}\n\n\
             Always write clean, optimized, production-ready Luau script. If you propose editing a script, \
             use the format: ```luau:script_path\n-- code\n``` so the diff viewer can intercept it.",
            studio_context
        );

        let mut req_messages = Vec::new();
        req_messages.push(serde_json::json!({
            "role": "system",
            "content": system_prompt
        }));

        // History
        {
            let history = self.messages.lock().unwrap();
            for msg in history.iter() {
                req_messages.push(serde_json::json!({
                    "role": msg.role,
                    "content": msg.content
                }));
            }
        }

        // New prompt
        req_messages.push(serde_json::json!({
            "role": "user",
            "content": prompt
        }));

        let url = format!("{}/chat/completions", settings.base_url.trim_end_matches('/'));
        let mut req_builder = self.client.post(&url);

        if !settings.api_key.is_empty() {
            req_builder = req_builder.header("Authorization", format!("Bearer {}", settings.api_key));
        }

        let body = serde_json::json!({
            "model": settings.model,
            "messages": req_messages,
            "temperature": settings.temperature,
            "max_tokens": settings.max_tokens
        });

        let resp = req_builder
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Network error connecting to LLM endpoint: {}", e))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await.unwrap_or_default();
            return Err(format!("LLM Provider returned error HTTP {}: {}", status, err_text));
        }

        let res_json: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| format!("Failed to parse LLM JSON response: {}", e))?;

        let reply_text = res_json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        // Store into history
        {
            let mut history = self.messages.lock().unwrap();
            history.push(ChatMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            });
            history.push(ChatMessage {
                role: "assistant".to_string(),
                content: reply_text.clone(),
            });
        }

        Ok(reply_text)
    }
}
