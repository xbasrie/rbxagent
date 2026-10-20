use crate::settings::LlmSettings;
use crate::bridge::CodePatch;
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
    pub script_path: String,
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
            "You are RbxAgent AI, an expert Roblox Game Engineer and Luau developer.\n\
             Roblox Studio Current Context:\n{}\n\n\
             Always write clean, optimized, production-ready Luau script.\n\
             When you propose editing an existing script, use EXACTLY this format:\n\
             ```luau:ScriptPath\n-- your code\n```\n\
             When creating a new script, use:\n\
             ```luau:new:ScriptPath\n-- your code\n```\n\
             The diff viewer will parse these blocks automatically.",
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

        // Parse code blocks and create ProposedChanges
        self.parse_proposed_changes(&reply_text);

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

    fn parse_proposed_changes(&self, text: &str) {
        let mut changes = self.pending_changes.lock().unwrap();
        // Parse ```luau:path blocks
        let mut i = 0;
        let bytes = text.as_bytes();
        while i < bytes.len() {
            // Find ```luau:
            if let Some(pos) = text[i..].find("```luau:") {
                let start = i + pos + 8; // after "```luau:"
                // Find end of path (newline)
                if let Some(nl) = text[start..].find('\n') {
                    let path = text[start..start + nl].trim().to_string();
                    let code_start = start + nl + 1;
                    // Find closing ```
                    if let Some(end_pos) = text[code_start..].find("```") {
                        let code = text[code_start..code_start + end_pos].to_string();
                        let is_new = path.starts_with("new:");
                        let clean_path = if is_new {
                            path.strip_prefix("new:").unwrap_or(&path).to_string()
                        } else {
                            path.clone()
                        };

                        changes.push(ProposedChange {
                            script_id: clean_path.clone(),
                            script_path: clean_path,
                            original_code: if is_new { String::new() } else { "[existing]".to_string() },
                            modified_code: code.trim().to_string(),
                            status: "pending".to_string(),
                        });

                        i = code_start + end_pos + 3;
                        continue;
                    }
                }
            }
            break;
        }
    }

    pub fn get_pending_changes(&self) -> Vec<ProposedChange> {
        self.pending_changes.lock().unwrap().clone()
    }

    pub fn approve_change(&self, script_path: &str) -> Option<CodePatch> {
        let mut changes = self.pending_changes.lock().unwrap();
        if let Some(c) = changes.iter_mut().find(|c| c.script_path == script_path && c.status == "pending") {
            c.status = "approved".to_string();
            Some(CodePatch {
                script_id: c.script_id.clone(),
                script_path: c.script_path.clone(),
                new_source: c.modified_code.clone(),
                status: "pending".to_string(),
            })
        } else {
            None
        }
    }

    pub fn reject_change(&self, script_path: &str) {
        let mut changes = self.pending_changes.lock().unwrap();
        if let Some(c) = changes.iter_mut().find(|c| c.script_path == script_path && c.status == "pending") {
            c.status = "rejected".to_string();
        }
    }

    pub fn clear_history(&self) {
        self.messages.lock().unwrap().clear();
        self.pending_changes.lock().unwrap().clear();
    }
}
