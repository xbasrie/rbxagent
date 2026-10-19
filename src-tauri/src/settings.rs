use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LlmSettings {
    pub provider_name: String,       // e.g. "Custom", "OpenAI", "Anthropic", "Ollama", "9Router"
    pub base_url: String,            // e.g. "https://api.openai.com/v1" or "http://localhost:20127/v1"
    pub api_key: String,             // user-held secret API key
    pub model: String,               // e.g. "gpt-4o", "claude-3-7-sonnet", "qwen2.5-coder"
    pub temperature: f32,
    pub max_tokens: u32,
}

impl Default for LlmSettings {
    fn default() -> Self {
        Self {
            provider_name: "Custom (OpenAI-compatible)".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
            api_key: "".to_string(),
            model: "gpt-4o".to_string(),
            temperature: 0.2,
            max_tokens: 4096,
        }
    }
}

pub struct SettingsManager {
    config_path: PathBuf,
    current: Arc<Mutex<LlmSettings>>,
}

impl SettingsManager {
    pub fn new() -> Self {
        let config_dir = dirs_fallback().join(".robloxkit");
        if !config_dir.exists() {
            let _ = fs::create_dir_all(&config_dir);
        }
        let config_path = config_dir.join("llm_settings.json");
        let initial_settings = if config_path.exists() {
            match fs::read_to_string(&config_path) {
                Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
                Err(_) => LlmSettings::default(),
            }
        } else {
            LlmSettings::default()
        };

        Self {
            config_path,
            current: Arc::new(Mutex::new(initial_settings)),
        }
    }

    pub fn get(&self) -> LlmSettings {
        self.current.lock().unwrap().clone()
    }

    pub fn save(&self, new_settings: LlmSettings) -> Result<(), String> {
        let serialized = serde_json::to_string_pretty(&new_settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;
        fs::write(&self.config_path, serialized)
            .map_err(|e| format!("Failed to write settings file: {}", e))?;
        *self.current.lock().unwrap() = new_settings;
        Ok(())
    }
}

fn dirs_fallback() -> PathBuf {
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        PathBuf::from(home)
    } else {
        PathBuf::from(".")
    }
}
