use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use warp::Filter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RobloxScriptItem {
    pub id: String,
    pub name: String,
    pub class_name: String, // Script, LocalScript, ModuleScript
    pub parent_path: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioStatus {
    pub connected: bool,
    pub studio_pid: Option<u32>,
    pub place_id: Option<u64>,
    pub place_name: Option<String>,
    pub script_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodePatch {
    pub script_id: String,
    pub script_path: String,
    pub new_source: String,
    pub status: String, // "pending", "applied", "rejected"
}

#[derive(Clone)]
pub struct BridgeState {
    pub status: Arc<Mutex<StudioStatus>>,
    pub scripts: Arc<Mutex<HashMap<String, RobloxScriptItem>>>,
    pub last_heartbeat: Arc<Mutex<Option<Instant>>>,
    pub pending_patches: Arc<Mutex<Vec<CodePatch>>>,
    pub auth_token: Arc<String>,
}

impl BridgeState {
    pub fn new() -> Self {
        let auth_token = uuid::Uuid::new_v4().to_string();
        Self {
            status: Arc::new(Mutex::new(StudioStatus {
                connected: false,
                studio_pid: None,
                place_id: None,
                place_name: None,
                script_count: 0,
            })),
            scripts: Arc::new(Mutex::new(HashMap::new())),
            last_heartbeat: Arc::new(Mutex::new(None)),
            pending_patches: Arc::new(Mutex::new(Vec::new())),
            auth_token: Arc::new(auth_token),
        }
    }

    pub fn get_status(&self) -> StudioStatus {
        let mut st = self.status.lock().unwrap().clone();
        let is_alive = self
            .last_heartbeat
            .lock()
            .unwrap()
            .map(|t| t.elapsed() < Duration::from_secs(12))
            .unwrap_or(false);
        st.connected = is_alive;
        if !is_alive {
            st.place_name = None;
            st.place_id = None;
            st.studio_pid = None;
        }
        st.script_count = self.scripts.lock().unwrap().len();
        st
    }
}

pub async fn start_bridge_server(port: u16, state: BridgeState) {
    let state_filter = warp::any().map(move || state.clone());

    // GET /status
    let status_route = warp::path("status")
        .and(warp::get())
        .and(state_filter.clone())
        .map(|s: BridgeState| {
            let status = s.get_status();
            warp::reply::json(&status)
        });

    // POST /heartbeat (dari plugin Roblox Studio)
    let heartbeat_route = warp::path("heartbeat")
        .and(warp::post())
        .and(warp::body::json())
        .and(state_filter.clone())
        .map(|body: serde_json::Value, s: BridgeState| {
            *s.last_heartbeat.lock().unwrap() = Some(Instant::now());
            let mut st = s.status.lock().unwrap();
            st.connected = true;
            if let Some(pid) = body.get("pid").and_then(|v| v.as_u64()) {
                st.studio_pid = Some(pid as u32);
            }
            if let Some(p_id) = body.get("placeId").and_then(|v| v.as_u64()) {
                st.place_id = Some(p_id);
            }
            if let Some(name) = body.get("placeName").and_then(|v| v.as_str()) {
                st.place_name = Some(name.to_string());
            }
            warp::reply::json(&serde_json::json!({ "status": "ok", "ack": true }))
        });

    // GET /scripts
    let get_scripts_route = warp::path("scripts")
        .and(warp::get())
        .and(state_filter.clone())
        .map(|s: BridgeState| {
            let list: Vec<RobloxScriptItem> = s.scripts.lock().unwrap().values().cloned().collect();
            warp::reply::json(&list)
        });

    // POST /scripts/sync - plugin sync script ke desktop
    let sync_scripts_route = warp::path!("scripts" / "sync")
        .and(warp::post())
        .and(warp::body::json())
        .and(state_filter.clone())
        .map(|items: Vec<RobloxScriptItem>, s: BridgeState| {
            *s.last_heartbeat.lock().unwrap() = Some(Instant::now());
            let mut map = s.scripts.lock().unwrap();
            map.clear();
            for item in items {
                map.insert(item.id.clone(), item);
            }
            warp::reply::json(&serde_json::json!({ "status": "synced", "count": map.len() }))
        });

    // GET /patches/poll - Luau plugin polling untuk ambil pending code patches
    let poll_patches_route = warp::path!("patches" / "poll")
        .and(warp::get())
        .and(state_filter.clone())
        .map(|s: BridgeState| {
            let mut patches = s.pending_patches.lock().unwrap();
            let pending: Vec<CodePatch> = patches
                .iter()
                .filter(|p| p.status == "pending")
                .cloned()
                .collect();
            // Mark as applied once polled by plugin
            for p in patches.iter_mut() {
                if p.status == "pending" {
                    p.status = "applied".to_string();
                }
            }
            warp::reply::json(&pending)
        });

    // POST /patches/result - Luau plugin reports apply result
    let patch_result_route = warp::path!("patches" / "result")
        .and(warp::post())
        .and(warp::body::json())
        .and(state_filter.clone())
        .map(|body: serde_json::Value, s: BridgeState| {
            let script_id = body.get("script_id").and_then(|v| v.as_str()).unwrap_or("");
            let success = body.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
            let mut patches = s.pending_patches.lock().unwrap();
            if let Some(p) = patches.iter_mut().find(|p| p.script_id == script_id) {
                p.status = if success { "applied".to_string() } else { "failed".to_string() };
            }
            warp::reply::json(&serde_json::json!({ "status": "ack" }))
        });

    let routes = status_route
        .or(heartbeat_route)
        .or(get_scripts_route)
        .or(sync_scripts_route)
        .or(poll_patches_route)
        .or(patch_result_route)
        .with(warp::cors().allow_any_origin());

    let addr = ([127, 0, 0, 1], port);
    warp::serve(routes).run(addr).await;
}
