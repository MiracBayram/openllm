use std::collections::HashMap;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager
};
#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
#[cfg(target_os = "windows")]
use window_vibrancy::apply_blur;
use tokio::sync::{Mutex, RwLock};
use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};

pub mod engines;
pub mod process;
pub mod profiler;
pub mod router;
pub mod commands;
pub mod hub;
pub mod server;
pub mod scheduler;
pub mod storage;
pub mod ipc;
pub mod synapse;
pub mod swarm;

use process::spawner::EngineHandle;
use profiler::HardwareProfile;

pub struct AppState {
    pub hardware_profile: RwLock<Option<HardwareProfile>>,
    pub active_handles: Mutex<HashMap<String, EngineHandle>>,
    pub server_cancel_tokens: Mutex<HashMap<String, tokio_util::sync::CancellationToken>>,
    pub active_server_ports: Mutex<HashMap<String, u16>>,
    pub active_download_tokens: Mutex<HashMap<String, tokio_util::sync::CancellationToken>>,
    pub db: Option<crate::storage::pool::StorageCore>,
    pub autopsy_session: Mutex<Option<crate::profiler::autopsy::AutopsySession>>,
    pub ipc_bus: Option<std::sync::Arc<crate::ipc::ws::BinaryIpcBus>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts(["alt+space"])
                .unwrap()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if shortcut.matches(Modifiers::ALT, Code::Space) {
                            if let Some(window) = app.get_webview_window("main") {
                                let is_visible = window.is_visible().unwrap_or(false);
                                if is_visible {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.unminimize();
                                    let _ = window.set_focus();
                                }
                            }
                        }
                    }
                })
                .build()
        )
        .setup(|app| {
            #[allow(unused_variables)]
            let window = app.get_webview_window("main").unwrap();
            
            #[cfg(target_os = "macos")]
            let _ = apply_vibrancy(&window, NSVisualEffectMaterial::HudWindow, None, None);

            #[cfg(target_os = "windows")]
            let _ = apply_blur(&window, Some((18, 18, 18, 125)));

            #[cfg(target_os = "linux")]
            {
                if std::env::var("WAYLAND_DISPLAY").is_ok() {
                    tracing::warn!("Linux + Wayland: transparent windows not supported by WebKitGTK. Window may appear with a black background.");
                }
            }
            
            let show_item = MenuItemBuilder::with_id("show", "Arayüzü Göster").build(app)?;
            let hide_item = MenuItemBuilder::with_id("hide", "Arka Plana Gizle").build(app)?;
            let stop_item = MenuItemBuilder::with_id("stop", "Mevcut Modeli Durdur").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Uygulamadan Çık").build(app)?;

            let menu = MenuBuilder::new(app)
               .item(&show_item)
               .item(&hide_item)
               .separator()
               .item(&stop_item)
               .separator()
               .item(&quit_item)
               .build()?;

            let mut tray_builder = TrayIconBuilder::new()
               .menu(&menu)
               .show_menu_on_left_click(false);
               
            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _tray = tray_builder
               .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "stop" => {
                        let app_handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let state = app_handle.state::<crate::AppState>();
                            let _ = crate::commands::stop_inference(state).await;
                        });
                    }
                    "quit" => {
                        let app_handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let state = app_handle.state::<crate::AppState>();
                            let _ = crate::commands::stop_inference(state).await;
                            app_handle.exit(0);
                        });
                    }
                    _ => {}
                })
               .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
               .build(app)?;
            // Generate UUID for LAN Auth via AppData
            if let Ok(app_data_dir) = app.path().app_data_dir() {
                let models_dir = app_data_dir.join("models");
                if !models_dir.exists() {
                    let _ = std::fs::create_dir_all(&models_dir);
                }
                let key_path = app_data_dir.join(".api_key");
                if !key_path.exists() {
                    let key = format!("sk-forge-{}", uuid::Uuid::new_v4());
                    let _ = std::fs::write(&key_path, key);
                    #[cfg(unix)]
                    {
                        use std::os::unix::fs::PermissionsExt;
                        let _ = std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600));
                    }
                }
            }

            let mut db_conn = None;
            if let Ok(app_data_dir) = app.path().app_data_dir() {
                let db_path = app_data_dir.join("forge.db");

                let core = crate::storage::pool::StorageCore::open(&db_path).expect("Failed to open StorageCore");
                
                // Initialization schemas
                let conn = core.readers.get().unwrap();
                let _ = conn.execute_batch(
                    "CREATE TABLE IF NOT EXISTS agents (
                        id TEXT PRIMARY KEY,
                        name TEXT,
                        description TEXT,
                        system_prompt TEXT,
                        status TEXT
                    );
                    CREATE TABLE IF NOT EXISTS threads (
                        id TEXT PRIMARY KEY,
                        title TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE TABLE IF NOT EXISTS messages (
                        id TEXT PRIMARY KEY,
                        thread_id TEXT,
                        role TEXT,
                        content TEXT,
                        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
                    );
                    CREATE TABLE IF NOT EXISTS rag_documents (
                        id TEXT PRIMARY KEY,
                        title TEXT,
                        path TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    );
                    CREATE TABLE IF NOT EXISTS rag_chunks (
                        id TEXT PRIMARY KEY,
                        document_id TEXT,
                        content TEXT,
                        embedding BLOB,
                        pos_x REAL DEFAULT 0,
                        pos_y REAL DEFAULT 0,
                        pos_z REAL DEFAULT 0,
                        FOREIGN KEY (document_id) REFERENCES rag_documents(id) ON DELETE CASCADE
                    );
                    CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
                    CREATE INDEX IF NOT EXISTS idx_rag_chunks_document_id ON rag_chunks(document_id);
                    CREATE VIRTUAL TABLE IF NOT EXISTS rag_chunks_fts USING fts5(
                        content,
                        chunk_id UNINDEXED
                    );"
                );

                // Migration for existing DB
                let _ = conn.execute("ALTER TABLE rag_chunks ADD COLUMN pos_x REAL DEFAULT 0", []);
                let _ = conn.execute("ALTER TABLE rag_chunks ADD COLUMN pos_y REAL DEFAULT 0", []);
                let _ = conn.execute("ALTER TABLE rag_chunks ADD COLUMN pos_z REAL DEFAULT 0", []);

                db_conn = Some(core);
            }

            let mut ipc_bus = None;
            #[cfg(unix)]
            {
                let socket_path = app.path().app_data_dir().unwrap_or_else(|_| std::path::PathBuf::from("/tmp")).join("forge_ipc.sock");
                if let Ok(bus) = tauri::async_runtime::block_on(crate::ipc::ws::BinaryIpcBus::start(socket_path)) {
                    ipc_bus = Some(bus);
                }
            }

            app.manage(AppState {
                hardware_profile: RwLock::new(None),
                active_handles: Mutex::new(HashMap::new()),
                server_cancel_tokens: Mutex::new(HashMap::new()),
                active_server_ports: Mutex::new(HashMap::new()),
                active_download_tokens: Mutex::new(HashMap::new()),
                db: db_conn,
                autopsy_session: Mutex::new(None),
                ipc_bus: ipc_bus.clone(),
            });

            // Start Swarm Discovery
            let local_id = uuid::Uuid::new_v4();
            let mut hw_sig = crate::swarm::discovery::HwSignature {
                node_id: local_id,
                hostname: "forge-node".to_string(),
                gpu_name: "Unknown".to_string(),
                gpu_vram_total_bytes: 0,
                gpu_vram_free_bytes: 0,
                cpu_cores: 0,
                ram_total_bytes: 0,
                ram_free_bytes: 0,
                tensor_cores: 0,
                fp16_tflops: 0.0,
                bandwidth_gbps: 0.0,
                role: crate::swarm::discovery::SwarmRole::Idle,
                ts: 0,
            };
            if let Ok(profile) = tauri::async_runtime::block_on(profiler::profile()) {
                if let Some(gpu) = profile.gpus.first() {
                    hw_sig.gpu_name = gpu.name.clone();
                    hw_sig.gpu_vram_total_bytes = gpu.vram_mb * 1024 * 1024;
                    hw_sig.gpu_vram_free_bytes = gpu.vram_available_mb * 1024 * 1024;
                }
            }
            tauri::async_runtime::spawn(async move {
                let _ = crate::swarm::discovery::SwarmDiscovery::spawn(hw_sig).await;
            });

            let app_handle = app.handle().clone();
            let ipc_clone = ipc_bus.clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_millis(16)); // ~60Hz
                let mut seq = 0u64;
                loop {
                    interval.tick().await;
                    seq += 1;
                    if let Ok(profile) = profiler::profile().await {
                        if let Some(state) = app_handle.try_state::<AppState>() {
                            let mut hp_lock = state.hardware_profile.write().await;
                            *hp_lock = Some(profile.clone());
                        }

                        let total_vram = profile.gpus.iter().map(|g| g.vram_mb).sum::<u64>() * 1024 * 1024;
                        let available_vram = profile.gpus.iter().map(|g| g.vram_available_mb).sum::<u64>() * 1024 * 1024;
                        let used_vram = total_vram.saturating_sub(available_vram);

                        let total_ram = profile.memory.total_mb * 1024 * 1024;
                        let available_ram = profile.memory.available_mb * 1024 * 1024;
                        let used_ram = total_ram.saturating_sub(available_ram);

                        let cpu_usage = tokio::task::spawn_blocking(move || {
                            crate::profiler::get_cpu_usage()
                        }).await.unwrap_or(0.0);

                        let mut sample = crate::synapse::pulse::PulseSample::default();
                        sample.seq = seq;
                        sample.ts_ns = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos() as u64;
                        sample.gpu_util_pct = 0.0;
                        sample.gpu_temp_c = 0.0;
                        sample.gpu_vram_used_bytes = used_vram;
                        sample.gpu_vram_total_bytes = total_vram;
                        sample.cpu_util_pct = cpu_usage;
                        sample.ram_used_bytes = used_ram;
                        sample.ram_total_bytes = total_ram;

                        // Broadcast binary IPC frame
                        if let Some(bus) = &ipc_clone {
                            // Convert struct to bytes
                            let payload = unsafe {
                                std::slice::from_raw_parts(
                                    (&sample as *const crate::synapse::pulse::PulseSample) as *const u8,
                                    std::mem::size_of::<crate::synapse::pulse::PulseSample>(),
                                )
                            };
                            bus.broadcast_pulse(seq as u16, payload);
                        }
                    }
                }
            });

            let app_handle_sched = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                crate::scheduler::start_scheduler(app_handle_sched).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_hardware_profile,
            commands::list_models,
            commands::suggest_engine,
            commands::start_inference,
            commands::stop_inference,
            commands::start_local_server,
            commands::stop_local_server,
            commands::get_server_status,
            commands::search_hub_models,
            commands::start_download,
            commands::refresh_engines,
            commands::get_models_dir,
            commands::window_close,
            commands::window_minimize,
            commands::window_maximize,
            commands::window_start_dragging,
            commands::toggle_ghost_hud,
            commands::get_api_key,
            commands::regenerate_api_key,
            commands::cancel_download,
            commands::ingest_document,
            commands::search_documents,
            commands::get_rag_documents,
            commands::get_galaxy_chunks,
            commands::get_document_chunks,
            commands::delete_rag_document,
            commands::get_agents,
            commands::create_agent,
            commands::delete_agent,
            commands::update_agent,
            commands::delete_model,
            commands::trigger_predation,
            commands::start_autopsy,
            commands::sample_autopsy,
            commands::stop_autopsy
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                tracing::info!("OS Kapanış Sinyali (RunEvent::ExitRequested) alındı, zombiler temizleniyor...");
                if let Some(state) = app_handle.try_state::<AppState>() {
                    if let Ok(mut handles) = state.active_handles.try_lock() {
                        tracing::info!("Aktif inference kapatılıyor...");
                        handles.clear(); // Drop will kill all children
                    }
                    if let Ok(mut tokens_lock) = state.server_cancel_tokens.try_lock() {
                        tracing::info!("Axum sunucuları kapatılıyor...");
                        for token in tokens_lock.values() {
                            token.cancel();
                        }
                        tokens_lock.clear();
                    }
                }
            }
        });
}
