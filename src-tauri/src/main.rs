use rbxagent_desktop_lib::agent::{AgentSession, ProposedChange};
use rbxagent_desktop_lib::bridge::{BridgeState, CodePatch, RobloxScriptItem, StudioStatus};
use rbxagent_desktop_lib::media::SoundEngine;
use rbxagent_desktop_lib::settings::{LlmSettings, SettingsManager};
use std::sync::Mutex;
use tauri::State;

struct AppState {
    settings_mgr: SettingsManager,
    bridge: BridgeState,
    agent: AgentSession,
    sound_engine: Mutex<SoundEngine>,
}

#[tauri::command]
fn get_llm_settings(state: State<AppState>) -> LlmSettings {
    state.settings_mgr.get()
}

#[tauri::command]
fn save_llm_settings(state: State<AppState>, settings: LlmSettings) -> Result<(), String> {
    state.settings_mgr.save(settings)
}

#[tauri::command]
fn get_studio_status(state: State<AppState>) -> StudioStatus {
    state.bridge.get_status()
}

#[tauri::command]
fn get_studio_scripts(state: State<AppState>) -> Vec<RobloxScriptItem> {
    state.bridge.scripts.lock().unwrap().values().cloned().collect()
}

#[tauri::command]
async fn send_agent_prompt(state: State<'_, AppState>, prompt: String) -> Result<String, String> {
    let settings = state.settings_mgr.get();
    let status = state.bridge.get_status();

    let context_summary = {
        let scripts = state.bridge.scripts.lock().unwrap();
        let mut summary = format!(
            "Connected: {}\nPlace: {:?} (ID: {:?})\nScripts Active: {}\n",
            status.connected, status.place_name, status.place_id, scripts.len()
        );
        for s in scripts.values().take(10) {
            summary.push_str(&format!("- [{}] {}\n", s.class_name, s.parent_path));
        }
        summary
    };

    state.agent.execute_turn(&prompt, &settings, &context_summary).await
}

// --- Blok 1: Two-Way Patching ---

#[tauri::command]
fn get_pending_changes(state: State<AppState>) -> Vec<ProposedChange> {
    state.agent.get_pending_changes()
}

#[tauri::command]
fn approve_change(state: State<AppState>, script_path: String) -> Result<String, String> {
    if let Some(patch) = state.agent.approve_change(&script_path) {
        state.bridge.pending_patches.lock().unwrap().push(patch);
        Ok("Patch queued for Studio plugin".to_string())
    } else {
        Err("No pending change found for that script path".to_string())
    }
}

#[tauri::command]
fn reject_change(state: State<AppState>, script_path: String) -> Result<(), String> {
    state.agent.reject_change(&script_path);
    Ok(())
}

#[tauri::command]
fn clear_agent_history(state: State<AppState>) {
    state.agent.clear_history();
}

// --- Blok 2: SoundFont MIDI rendering ---

#[tauri::command]
fn load_soundfont(state: State<AppState>, data: Vec<u8>) -> Result<(), String> {
    state.sound_engine.lock().unwrap().load_soundfont(data);
    Ok(())
}

#[tauri::command]
fn render_midi(state: State<AppState>, midi_bytes: Vec<u8>) -> Result<Vec<f32>, String> {
    state.sound_engine.lock().unwrap().render_midi_to_pcm(&midi_bytes, 44100)
}

// --- Blok 3: Roblox Toolbox Asset Search ---

#[tauri::command]
async fn search_toolbox_assets(query: String, asset_type: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://apis.roblox.com/toolbox-service/v1/items/details?keyword={}&limit=24&category={}",
        urlencoding::encode(&query),
        urlencoding::encode(&asset_type)
    );
    let resp = client
        .get(&url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Toolbox API request failed: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("Toolbox API HTTP {}", resp.status()));
    }
    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Toolbox JSON parse error: {}", e))
}

fn main() {
    let bridge_state = BridgeState::new();
    let port = 39024;

    let bs = bridge_state.clone();
    tauri::async_runtime::spawn(async move {
        rbxagent_desktop_lib::bridge::start_bridge_server(port, bs).await;
    });

    let app_state = AppState {
        settings_mgr: SettingsManager::new(),
        bridge: bridge_state,
        agent: AgentSession::new(),
        sound_engine: Mutex::new(SoundEngine::new()),
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_llm_settings,
            save_llm_settings,
            get_studio_status,
            get_studio_scripts,
            send_agent_prompt,
            get_pending_changes,
            approve_change,
            reject_change,
            clear_agent_history,
            load_soundfont,
            render_midi,
            search_toolbox_assets
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
