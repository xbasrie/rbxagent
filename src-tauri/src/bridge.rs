use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
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

#[derive(Clone)]
pub struct BridgeState {
    pub status: Arc<Mutex<StudioStatus>>,
    pub scripts: Arc<Mutex<HashMap<String, RobloxScriptItem>>>,
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
            auth_token: Arc::new(auth_token),
        }
    }

    pub fn get_status(&self) -> StudioStatus {
        let mut st = self.status.lock().unwrap().clone();
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

    // GET /scripts - kembalikan list script aktif ke agent
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
            let mut map = s.scripts.lock().unwrap();
            map.clear();
            for item in items {
                map.insert(item.id.clone(), item);
            }
            warp::reply::json(&serde_json::json!({ "status": "synced", "count": map.len() }))
        });

    let routes = status_route
        .or(heartbeat_route)
        .or(get_scripts_route)
        .or(sync_scripts_route)
        .with(warp::cors().allow_any_origin());

    let addr = ([127, 0, 0, 1], port);
    tokio::spawn(async move {
        warp::serve(routes).run(addr).await;
    });
}
