use rbxagent_desktop_lib::settings::{LlmSettings, SettingsManager};
use rbxagent_desktop_lib::bridge::{BridgeState, RobloxScriptItem, StudioStatus};
use rbxagent_desktop_lib::agent::AgentSession;
use std::sync::Arc;
use tauri::State;

struct AppState {
    settings_mgr: SettingsManager,
    bridge: BridgeState,
    agent: AgentSession,
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
    let scripts = state.bridge.scripts.lock().unwrap();

    let mut context_summary = format!(
        "Connected: {}\nPlace: {:?} (ID: {:?})\nScripts Active: {}\n",
        status.connected, status.place_name, status.place_id, scripts.len()
    );

    for s in scripts.values().take(10) {
        context_summary.push_str(&format!("- [{}] {}\n", s.class_name, s.parent_path));
    }

    state.agent.execute_turn(&prompt, &settings, &context_summary).await
}

fn main() {
    let bridge_state = BridgeState::new();
    let port = 39024;

    // Start background bridge server for Roblox Studio
    tokio::runtime::Runtime::new().unwrap().spawn({
        let bs = bridge_state.clone();
        async move {
            rbxagent_desktop_lib::bridge::start_bridge_server(port, bs).await;
        }
    });

    let app_state = AppState {
        settings_mgr: SettingsManager::new(),
        bridge: bridge_state,
        agent: AgentSession::new(),
    };

    tauri::Builder::default()
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            get_llm_settings,
            save_llm_settings,
            get_studio_status,
            get_studio_scripts,
            send_agent_prompt
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
