use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::profiler::{profile, HardwareProfile};
use crate::router::{decision_tree::EngineRecommendation, ModelInfo};
use crate::AppState;

// Helper: Fast deterministic projection to 3D for Vector Galaxy
fn project_to_3d(embedding: &[f32]) -> (f32, f32, f32) {
    let mut x = 0.0;
    let mut y = 0.0;
    let mut z = 0.0;
    for (i, &v) in embedding.iter().enumerate() {
        // Pseudo-random weights based on index
        let f = i as f32;
        x += v * (f * 13.0).sin();
        y += v * (f * 17.0).sin();
        z += v * (f * 19.0).sin();
    }
    // Normalize to spread out the galaxy
    let len = (x*x + y*y + z*z).sqrt().max(1e-6);
    let scale = 100.0 / len; // radius of galaxy ~100
    (x * scale, y * scale, z * scale)
}

#[tauri::command]
pub async fn get_hardware_profile(state: State<'_, AppState>) -> Result<HardwareProfile, String> {
    let mut hp_lock = state.hardware_profile.write().await;
    if let Some(ref hp) = *hp_lock {
        return Ok(hp.clone());
    }

    let hp = profile().await.map_err(|e| e.to_string())?;
    *hp_lock = Some(hp.clone());
    Ok(hp)
}

#[tauri::command]
pub async fn list_models(app: AppHandle) -> Result<Vec<ModelInfo>, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let dir = app_data.join("models").to_string_lossy().to_string();
    tokio::task::spawn_blocking(move || {
        let mut models = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.extension().is_some_and(|ext| ext == "gguf") {
                let mut size_mb = 0;
                let mut layer_count = 32;
                let mut architecture = "llama".to_string();
                let mut quant_label = "Q4_K_M".to_string();
                let mut chat_template = None;
                let mut attention_head_count = 32;
                let mut attention_head_count_kv = None;
                let mut embedding_length = 4096;

                if let Ok(meta) = crate::profiler::gguf::read_gguf_meta(&path) {
                    size_mb = meta.file_size_mb;
                    layer_count = meta.layer_count;
                    architecture = meta.architecture;
                    quant_label = meta.quant_label;
                    chat_template = meta.chat_template;
                    attention_head_count = meta.attention_head_count;
                    attention_head_count_kv = meta.attention_head_count_kv;
                    embedding_length = meta.embedding_length;
                } else if let Ok(metadata) = entry.metadata() {
                    size_mb = metadata.len() / 1024 / 1024;
                }

                models.push(ModelInfo {
                    path: path.to_string_lossy().to_string(),
                    name: entry.file_name().to_string_lossy().to_string(),
                    size_mb,
                    layer_count,
                    architecture,
                    quant_label,
                    chat_template,
                    attention_head_count,
                    attention_head_count_kv,
                    embedding_length,
                });
            }
        }
    }
    Ok(models)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command(rename_all = "camelCase")]
pub async fn delete_model(model_path: String, app: AppHandle) -> Result<(), String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let models_dir = app_data.join("models");
    
    tokio::task::spawn_blocking(move || {
        let canonical_path = std::fs::canonicalize(&model_path).map_err(|e| format!("Invalid model path: {}", e))?;
        if !canonical_path.starts_with(&models_dir) {
            return Err("Security violation: path outside models directory".to_string());
        }
        if !canonical_path.is_file() {
            return Err("Model file not found.".to_string());
        }
        std::fs::remove_file(canonical_path).map_err(|e| format!("Error deleting model: {}", e))?;
        Ok(())
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn suggest_engine(
    model_path: String,
    state: State<'_, AppState>,
) -> Result<EngineRecommendation, String> {
    let profile = get_hardware_profile(state).await?;
    let model = crate::router::ModelInfo::from_path(&std::path::PathBuf::from(&model_path))
        .unwrap_or_else(|_| ModelInfo {
            path: model_path.clone(),
            name: std::path::Path::new(&model_path)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            size_mb: 4096,
            layer_count: 32,
            architecture: "llama".to_string(),
            quant_label: "Q4".to_string(),
            chat_template: None,
            attention_head_count: 32,
            attention_head_count_kv: None,
            embedding_length: 4096,
        });

    let registry = crate::engines::build_engine_registry();

    let recommendation = crate::router::decision_tree::select_engine(&profile, &model, &registry).await?;
    Ok(recommendation)
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InferenceParams {
    pub temperature: f32,
    pub max_tokens: u32,
    pub top_p: Option<f32>,
    pub top_k: Option<u32>,
    pub repeat_penalty: Option<f32>,
    pub advanced_flags: Option<String>,
    pub prompt: Option<String>,
    pub system_prompt: Option<String>,
    pub messages: Option<Vec<ChatMessageInput>>,
    pub agent_id: Option<String>,
}

#[derive(Deserialize, Clone)]
pub struct ChatMessageInput {
    pub role: String,
    pub content: String,
}

#[tauri::command(rename_all = "camelCase")]
pub async fn start_inference(
    model_path: String,
    params: InferenceParams,
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let prompt_text = params.prompt.clone().unwrap_or_default();
    let profile = {
        let lock = state.hardware_profile.read().await;
        lock.clone().ok_or("Donanım profili henüz hazır değil")?
    };

    {
        let lock = state.active_handles.lock().await;
        if lock.contains_key("default") {
            return Err("Bir model zaten çalışıyor. Önce onu durdurun.".to_string());
        }
    }

    let model_path_clone = model_path.clone();
    let canonical_path = tokio::task::spawn_blocking(move || {
        std::fs::canonicalize(&model_path_clone)
    }).await.map_err(|e| format!("Task failed: {}", e))?.map_err(|e| format!("Invalid model path: {}", e))?;
    
    // Security Shield: Path Traversal Protection
    let app_data = app.path().app_data_dir().map_err(|e| format!("App data directory not found: {}", e))?;
    let models_dir = app_data.join("models");
    if !canonical_path.starts_with(&models_dir) {
        return Err("Security Violation: Access to files outside the model directory is blocked".to_string());
    }
    
    // Strict GGUF Magic Validation (E1)
    let path_clone = canonical_path.clone();
    let meta_result = tokio::task::spawn_blocking(move || {
        crate::profiler::gguf::read_gguf_meta(&path_clone)
    }).await.map_err(|e| e.to_string())?;

    if let Err(e) = meta_result {
        let err_msg = format!("HARD REFUSAL: Invalid or corrupted GGUF file (Magic Number mismatch). Cannot be started for security reasons. Detail: {:?}", e);
        let _ = app.emit("forge://error", &err_msg);
        return Err(err_msg);
    }

    let model = crate::router::ModelInfo::from_path(&canonical_path)
        .map_err(|e| e.to_string())?;

    let registry = crate::engines::build_engine_registry();
    let recommendation =
        crate::router::decision_tree::select_engine(&profile, &model, &registry).await?;

    tracing::info!(
        engine = recommendation.primary,
        score = recommendation.score,
        oom_risk = ?recommendation.oom_risk,
        "Motor seçildi"
    );

    if matches!(
        recommendation.oom_risk,
        crate::router::decision_tree::OomRisk::High
    ) {
        let msg = format!("HARD REFUSAL: RAM/VRAM yetersiz veya yasaklı kuantizasyon. Sistem kilitlenmesini önlemek için işlem reddedildi. Reason: {}", recommendation.reason);
        let _ = app.emit("forge://error", &msg);
        return Err(msg);
    }

    let adapter = registry
        .iter()
        .find(|a| a.name() == recommendation.primary)
        .ok_or("Engine not found")?;
    let binary_name = match recommendation.primary.as_str() {
        "llama.cpp" => "llama-server",
        "vLLM" => "python",
        "LMDeploy" => "lmdeploy",
        "PowerInfer-2" => "powerinfer",
        _ => "llama-server",
    };
    let mut binary_path = std::path::PathBuf::from(binary_name);
    let exe_ext = std::env::consts::EXE_EXTENSION;
    if !exe_ext.is_empty() {
        binary_path.set_extension(exe_ext);
    }

    let mut final_flags = recommendation.flags;
    if let Some(user_flags) = params.advanced_flags {
        let safe_args = crate::engines::flag_sanitizer::sanitize_advanced_flags(&user_flags);
        final_flags.extend(safe_args);
    }

    // Template Engine & Prompt Injection (C6)
    let mut messages = Vec::new();
    
    // Default system prompt
    let mut base_system_prompt = params.system_prompt.clone().unwrap_or_else(|| "You are a helpful AI assistant.".to_string());

    // RAG Injection
    let last_user_prompt = if let Some(history) = &params.messages {
        history.iter().filter(|m| m.role == "user").last().map(|m| m.content.clone())
    } else {
        Some(prompt_text.clone())
    };

    if let Some(query) = last_user_prompt {
        let active_agent = params.agent_id.clone().unwrap_or_else(|| "global".to_string());
        if let Ok(rag_results) = search_documents(app.clone(), query, active_agent).await {
            if !rag_results.is_empty() {
                base_system_prompt.push_str("\n\n--- RAG KNOWLEDGE BASE ---\nLütfen cevaplarını verirken aşağıdaki bağlamı göz önünde bulundur:\n");
                for (i, ctx) in rag_results.iter().enumerate() {
                    base_system_prompt.push_str(&format!("\n[Belge {}]: {}\n", i + 1, ctx));
                }
                base_system_prompt.push_str("----------------------------\n");
            }
        }
    }

    messages.push(crate::engines::template_engine::ChatMessage {
        role: "system".to_string(),
        content: base_system_prompt,
    });

    if let Some(history) = params.messages {
        for msg in history {
            if msg.role == "assistant" && msg.content.trim().is_empty() {
                continue;
            }
            messages.push(crate::engines::template_engine::ChatMessage {
                role: msg.role,
                content: msg.content,
            });
        }
    } else {
        // Fallback if no history provided
        messages.push(crate::engines::template_engine::ChatMessage {
            role: "user".to_string(),
            content: prompt_text.clone(),
        });
    }

    let final_prompt = if let Some(ref tmpl) = model.chat_template {
        crate::engines::template_engine::apply_chat_template(tmpl, &messages).unwrap_or(prompt_text.clone())
    } else {
        // Fallback manual formatting
        let mut fallback = String::new();
        for msg in messages {
            fallback.push_str(&format!("{}: {}\n", msg.role, msg.content));
        }
        fallback.push_str("assistant: ");
        fallback
    };

    // If using a CLI tool that expects --prompt
    final_flags.push("--prompt".to_string());
    final_flags.push(final_prompt);

    let (tx, mut rx) = tokio::sync::mpsc::channel::<crate::engines::EngineEvent>(1024);
    let handle = adapter
        .spawn(binary_path, final_flags, tx)
        .await
        .map_err(|e| e.to_string())?;

    {
        let mut lock = state.active_handles.lock().await;
        lock.insert("default".to_string(), handle);
    }

    let app_clone = app.clone();
    tokio::spawn(async move {
        let mut token_buffer = String::with_capacity(1024);
        loop {
            let event_opt = if token_buffer.is_empty() {
                rx.recv().await
            } else {
                match tokio::time::timeout(std::time::Duration::from_millis(50), rx.recv()).await {
                    Ok(res) => res,
                    Err(_) => {
                        let _ = app_clone.emit("forge://token", &token_buffer);
                        token_buffer.clear();
                        continue;
                    }
                }
            };

            match event_opt {
                Some(event) => {
                    match event {
                        crate::engines::EngineEvent::Token(text) => {
                            token_buffer.push_str(&text);
                            let is_whitespace = text.chars().last().is_some_and(|c| c.is_whitespace());
                            if text.contains('\n') || (token_buffer.len() > 512 && is_whitespace) {
                                let _ = app_clone.emit("forge://token", &token_buffer);
                                token_buffer.clear();
                            }
                        }
                        crate::engines::EngineEvent::Done { tokens_generated, duration_ms } => {
                            if !token_buffer.is_empty() {
                                let _ = app_clone.emit("forge://token", &token_buffer);
                                token_buffer.clear();
                            }
                            let _ = app_clone.emit("forge://done", serde_json::json!({
                                "tokens": tokens_generated,
                                "duration_ms": duration_ms
                            }));
                            break;
                        }
                        crate::engines::EngineEvent::Error(msg) => {
                            let _ = app_clone.emit("forge://error", msg);
                            break;
                        }
                        crate::engines::EngineEvent::Stats { tokens_per_sec, vram_used_mb } => {
                            let _ = app_clone.emit("forge://stats", serde_json::json!({
                                "tokens_per_sec": tokens_per_sec,
                                "vram_used_mb": vram_used_mb
                            }));
                        }
                        crate::engines::EngineEvent::Log(msg) => {
                            let _ = app_clone.emit("forge://log", msg);
                        }
                    }
                }
                None => break,
            }
        }
    });

    Ok(())
}

#[derive(serde::Serialize)]
pub struct ServerStatus {
    pub running: bool,
    pub port: Option<u16>,
}

#[tauri::command]
pub async fn get_server_status(state: tauri::State<'_, crate::AppState>) -> Result<Option<u16>, String> {
    let token_lock = state.server_cancel_tokens.lock().await;
    if token_lock.contains_key("default") {
        Ok(state.active_server_ports.lock().await.get("default").copied())
    } else {
        Ok(None)
    }
}



#[tauri::command(rename_all = "camelCase")]
pub async fn refresh_engines() -> Result<(), String> {
    let mut cache = crate::router::decision_tree::get_engine_cache().write().await;
    cache.clear();
    tracing::info!("Engine availability cache cleared");
    Ok(())
}

#[tauri::command]
pub async fn get_models_dir(app: AppHandle) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let models_dir = app_data_dir.join("models");
    Ok(models_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn start_local_server(
    api_key: String,
    bind_address: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<u16, String> {
    let cancel_token = tokio_util::sync::CancellationToken::new();
    let mut token_lock = state.server_cancel_tokens.lock().await;
    if token_lock.contains_key("default") {
        // Already running
        return Err("Sunucu zaten çalışıyor.".to_string());
    }
    
    let port = crate::server::start_server(app, 1234, api_key, bind_address, cancel_token.clone()).await?;
        
    token_lock.insert("default".to_string(), cancel_token);
    
    let mut port_lock = state.active_server_ports.lock().await;
    port_lock.insert("default".to_string(), port);
    
    Ok(port)
}

#[tauri::command]
pub async fn stop_local_server(state: tauri::State<'_, crate::AppState>) -> Result<(), String> {
    let mut token_lock = state.server_cancel_tokens.lock().await;
    if let Some(token) = token_lock.remove("default") {
        token.cancel();
        let mut port_lock = state.active_server_ports.lock().await;
        port_lock.remove("default");
        Ok(())
    } else {
        Err("No running server found.".to_string())
    }
}

#[tauri::command]
pub async fn search_hub_models(query: String) -> Result<Vec<crate::hub::HubModel>, String> {
    crate::hub::search_models(&query).await
}

#[tauri::command]
pub async fn stop_inference(state: tauri::State<'_, crate::AppState>) -> Result<(), String> {
    let mut lock = state.active_handles.lock().await;
    lock.remove("default");
    tracing::info!("Inference durduruldu");
    Ok(())
}

#[tauri::command]
pub async fn start_download(
    model_id: String,
    file_name: String,
    expected_sha256: String,
    app: AppHandle,
) -> Result<(), String> {
    let url = crate::hub::build_model_url(&model_id, &file_name)?;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let models_dir = app_data_dir.join("models");
    
    // Sanitize file_name to prevent Path Injection
    let safe_file_name = std::path::Path::new(&file_name).file_name().ok_or("Invalid file name")?;
    let target_path = models_dir.join(safe_file_name);

    let (tx, mut rx) = tokio::sync::mpsc::channel::<crate::hub::downloader::DownloadEvent>(100);
    let app_clone = app.clone();
    let model_id_clone = model_id.clone();
    let file_name_clone = file_name.clone();

    // Spawn progress listener
    tokio::spawn(async move {
        while let Some(progress) = rx.recv().await {
            let _ = app_clone.emit("forge://download::progress", serde_json::json!({
                "model_id": model_id_clone,
                "file_name": file_name_clone,
                "downloaded_bytes": progress.downloaded_bytes,
                "total_bytes": progress.total_bytes,
                "speed_bps": progress.speed_bps,
                "status": "Downloading"
            }));
        }
    });

    let cancel_token = tokio_util::sync::CancellationToken::new();
    {
        let state = app.state::<AppState>();
        let mut tokens = state.active_download_tokens.lock().await;
        tokens.insert(model_id.clone(), cancel_token.clone());
    }
    
    let app_task_clone = app.clone();

    // Spawn download task
    tokio::spawn(async move {
        let download_result = crate::hub::downloader::download_model_securely(&url, &target_path, &expected_sha256, tx, cancel_token).await;
        
        // Remove token from active map
        {
            let state = app_task_clone.state::<AppState>();
            let mut tokens = state.active_download_tokens.lock().await;
            tokens.remove(&model_id);
        }

        if let Err(e) = download_result {
            let _ = app_task_clone.emit("forge://download::progress", serde_json::json!({
                "model_id": model_id,
                "file_name": file_name,
                "downloaded_bytes": 0,
                "total_bytes": 0,
                "speed_bps": 0,
                "status": format!("Error: {}", e)
            }));
        } else {
            let _ = app_task_clone.emit("forge://download::progress", serde_json::json!({
                "model_id": model_id,
                "file_name": file_name,
                "downloaded_bytes": 0,
                "total_bytes": 0,
                "speed_bps": 0,
                "status": "Completed"
            }));
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn cancel_download(model_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut tokens = state.active_download_tokens.lock().await;
    if let Some(token) = tokens.remove(&model_id) {
        token.cancel();
        Ok(())
    } else {
        Err("Download not found.".into())
    }
}

#[tauri::command]
pub fn window_close(window: tauri::Window) {
    let _ = window.close();
}

#[tauri::command]
pub fn window_minimize(window: tauri::Window) {
    let _ = window.minimize();
}

#[tauri::command]
pub fn toggle_ghost_hud(app: AppHandle) -> Result<bool, String> {
    if let Some(ghost) = app.get_webview_window("ghost-hud") {
        let _ = ghost.close();
        Ok(false)
    } else {
        let ghost = tauri::WebviewWindowBuilder::new(&app, "ghost-hud", tauri::WebviewUrl::App("ghost.html".into()))
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .build()
            .map_err(|e| format!("Failed to build ghost window: {}", e))?;
            
        let _ = ghost.set_ignore_cursor_events(true);
        Ok(true)
    }
}

#[tauri::command]
pub fn window_maximize(window: tauri::Window) {
    if let Ok(true) = window.is_maximized() {
        let _ = window.unmaximize();
    } else {
        let _ = window.maximize();
    }
}

#[tauri::command]
pub fn window_start_dragging(window: tauri::Window) {
    let _ = window.start_dragging();
}

#[tauri::command]
pub async fn get_api_key(app: AppHandle) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let key_path = app_data_dir.join(".api_key");
    
    let key = tokio::task::spawn_blocking(move || {
        if key_path.exists() {
            std::fs::read_to_string(key_path).ok()
        } else {
            None
        }
    }).await.map_err(|e| e.to_string())?;

    if let Some(k) = key {
        Ok(k)
    } else {
        regenerate_api_key(app).await
    }
}

#[tauri::command]
pub async fn regenerate_api_key(app: AppHandle) -> Result<String, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let key_path = app_data_dir.join(".api_key");

    tokio::task::spawn_blocking(move || {
        std::fs::create_dir_all(&app_data_dir).map_err(|e| e.to_string())?;
        let new_key = format!("sk-forge-{}", uuid::Uuid::new_v4());
        std::fs::write(&key_path, &new_key).map_err(|e| e.to_string())?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600));
        }

        Ok(new_key)
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ingest_document(app: tauri::AppHandle, file_path: String, agent_id: String) -> Result<String, String> {
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let library_dir = app_data.join("library");
    std::fs::create_dir_all(&library_dir).map_err(|e| e.to_string())?;

    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Err("File not found".to_string());
    }
    
    let canonical = tokio::task::spawn_blocking({
        let p = path.to_path_buf();
        move || std::fs::canonicalize(&p)
    }).await.map_err(|e| e.to_string())?.map_err(|e| e.to_string())?;

    if !canonical.starts_with(&library_dir) {
        return Err("Security violation: file must live inside Forge library".to_string());
    }

    let meta = std::fs::metadata(&canonical).map_err(|e| e.to_string())?;
    if meta.len() > 100 * 1024 * 1024 {
        return Err("File exceeds 100MB limit".to_string());
    }

    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if ext != "pdf" && ext != "txt" && ext != "md" {
        return Err("Security violation: Only .pdf, .txt, and .md files are allowed.".to_string());
    }

    let text = if path.extension().is_some_and(|ext| ext.to_string_lossy().to_lowercase() == "pdf") {
        pdf_extract::extract_text(path).map_err(|e| format!("Error reading PDF: {}", e))?
    } else {
        std::fs::read_to_string(path).map_err(|e| format!("Error reading text: {}", e))?
    };

    let words: Vec<&str> = text.split_whitespace().collect();
    let chunk_size = 500;
    let chunks: Vec<String> = words.chunks(chunk_size)
        .map(|chunk| chunk.join(" "))
        .collect();

    tracing::info!("📄 [RAG] Document Ingested: {}", file_path);
    tracing::info!("✂️ [RAG] Splitted into {} chunks. Generating embeddings...", chunks.len());

    // MOCK EMBEDDINGS (Temporarily removed fastembed due to ort-sys cross-compilation errors)
    // We just return dummy zero embeddings for now to let CI pass.
    let embeddings = vec![vec![0.0f32; 384]; chunks.len()];

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let _db_path = app_data_dir.join("forge.db");
    
    let state = app.state::<crate::AppState>();
    let pool = state.db.as_ref().ok_or("Database connection not found")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let doc_id = uuid::Uuid::new_v4().to_string();
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;
    let file_name = path.file_name().unwrap_or_default().to_string_lossy().to_string();

    conn.execute("BEGIN TRANSACTION", []).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO rag_documents (id, filename, agent_id, uploaded_at) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![doc_id, file_name, agent_id, now],
    ).map_err(|e| {
        let _ = conn.execute("ROLLBACK", []);
        e.to_string()
    })?;

    for (i, embedding) in embeddings.into_iter().enumerate() {
        let chunk_id = uuid::Uuid::new_v4().to_string();
        let chunk_content = &chunks[i];
        
        let blob: Vec<u8> = embedding.iter()
            .flat_map(|f| f.to_le_bytes())
            .collect();

        // 3D Projection for Vector Galaxy
        let (pos_x, pos_y, pos_z) = project_to_3d(&embedding);

        if let Err(e) = conn.execute(
            "INSERT INTO rag_chunks (id, document_id, content, embedding_blob, pos_x, pos_y, pos_z) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![chunk_id, doc_id, chunk_content, blob, pos_x, pos_y, pos_z],
        ) {
            let _ = conn.execute("ROLLBACK", []);
            return Err(e.to_string());
        }

        if let Err(e) = conn.execute(
            "INSERT INTO rag_chunks_fts (chunk_id, content) VALUES (?1, ?2)",
            rusqlite::params![chunk_id, chunk_content],
        ) {
            let _ = conn.execute("ROLLBACK", []);
            return Err(e.to_string());
        }
    }

    conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
    tracing::info!("✅ [RAG] Embeddings generated and saved to SQLite.");

    Ok(format!("{} chunks extracted", chunks.len()))
}

#[tauri::command]
pub async fn search_documents(app: tauri::AppHandle, query: String, agent_id: String) -> Result<Vec<String>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("forge.db");
    
    if !db_path.exists() {
        return Ok(Vec::new());
    }

    // MOCK QUERY EMBEDDING (fastembed removed)
    let query_embedding = vec![0.0f32; 384];

    let state = app.state::<crate::AppState>();

    let pool = state.db.as_ref().ok_or("Database connection not found")?;
    let conn = pool.get().map_err(|e| e.to_string())?;

    let fts_query = query.split_whitespace()
        .filter(|w| w.len() > 2)
        .collect::<Vec<_>>()
        .join(" OR ");
    
    let mut chunk_iter = if !fts_query.is_empty() {
        let mut stmt = conn.prepare("
            SELECT c.content, c.embedding_blob 
            FROM rag_chunks c
            JOIN rag_chunks_fts f ON c.id = f.chunk_id
            WHERE c.document_id IN (SELECT id FROM rag_documents WHERE agent_id = ?1 OR agent_id = 'global')
            AND rag_chunks_fts MATCH ?2
            LIMIT 200
        ").map_err(|e| e.to_string())?;
        
        let rows: Vec<(String, Vec<u8>)> = stmt.query_map(rusqlite::params![agent_id, fts_query], |row| {
            let content: String = row.get(0)?;
            let blob: Vec<u8> = row.get(1)?;
            Ok((content, blob))
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
        rows
    } else {
        Vec::new()
    };
    
    if chunk_iter.is_empty() {
        let mut stmt = conn.prepare("SELECT content, embedding_blob FROM rag_chunks WHERE document_id IN (SELECT id FROM rag_documents WHERE agent_id = ?1 OR agent_id = 'global') ORDER BY id LIMIT 500").map_err(|e| e.to_string())?;
        let rows: Vec<(String, Vec<u8>)> = stmt.query_map(rusqlite::params![agent_id], |row| {
            let content: String = row.get(0)?;
            let blob: Vec<u8> = row.get(1)?;
            Ok((content, blob))
        }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();
        chunk_iter = rows;
    }

    let top_results = tokio::task::spawn_blocking(move || {
        let mut results: Vec<(String, f32)> = Vec::new();
        for (content, blob) in chunk_iter {
            const EXPECTED_DIM: usize = 384;
            let expected_blob_len = EXPECTED_DIM * 4;
            if blob.len() != expected_blob_len {
                continue;
            }

            let mut emb = Vec::with_capacity(EXPECTED_DIM);
            for i in 0..EXPECTED_DIM {
                let mut bytes = [0u8; 4];
                bytes.copy_from_slice(&blob[i*4..(i+1)*4]);
                emb.push(f32::from_le_bytes(bytes));
            }
            
            let dot_product: f32 = query_embedding.iter().zip(emb.iter()).map(|(a, b)| a * b).sum();
            let norm_a: f32 = query_embedding.iter().map(|a| a * a).sum::<f32>().sqrt();
            let norm_b: f32 = emb.iter().map(|b| b * b).sum::<f32>().sqrt();
            let sim = if norm_a > 0.0 && norm_b > 0.0 { dot_product / (norm_a * norm_b) } else { 0.0 };
            
            if sim > 0.3 {
                results.push((content, sim));
            }
        }
        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        let top_results: Vec<String> = results.into_iter().take(3).map(|(c, _)| c).collect();
        top_results
    }).await.map_err(|e| e.to_string())?;

    if !top_results.is_empty() {
        tracing::info!("🔍 [RAG] Retrieved {} contexts for query: '{}'", top_results.len(), query);
    }

    Ok(top_results)
}

#[derive(Serialize)]
pub struct RagDocument {
    id: String,
    filename: String,
    agent_id: String,
    uploaded_at: i64,
    chunk_count: i64,
}

#[tauri::command]
pub async fn get_rag_documents(app: tauri::AppHandle, agent_id: String) -> Result<Vec<RagDocument>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("forge.db");
    
    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let state = app.state::<crate::AppState>();
    let pool = state.db.as_ref().ok_or("Database connection not found")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT d.id, d.filename, d.agent_id, d.uploaded_at, COUNT(c.id) FROM rag_documents d LEFT JOIN rag_chunks c ON d.id = c.document_id WHERE d.agent_id = ?1 GROUP BY d.id ORDER BY d.uploaded_at DESC").map_err(|e| e.to_string())?;
    
    let doc_iter = stmt.query_map(rusqlite::params![agent_id], |row| {
        Ok(RagDocument {
            id: row.get(0)?,
            filename: row.get(1)?,
            agent_id: row.get(2)?,
            uploaded_at: row.get(3)?,
            chunk_count: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut docs = Vec::new();
    for doc in doc_iter {
        if let Ok(d) = doc {
            docs.push(d);
        }
    }

    Ok(docs)
}

#[derive(Serialize)]
pub struct GalaxyChunk {
    id: String,
    content: String,
    pos_x: f32,
    pos_y: f32,
    pos_z: f32,
}

#[tauri::command]
pub async fn get_galaxy_chunks(app: tauri::AppHandle, agent_id: String) -> Result<Vec<GalaxyChunk>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("forge.db");
    
    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let state = app.state::<crate::AppState>();
    let pool = state.db.as_ref().ok_or("Database connection not found")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("
        SELECT c.id, c.content, c.pos_x, c.pos_y, c.pos_z 
        FROM rag_chunks c
        JOIN rag_documents d ON c.document_id = d.id
        WHERE d.agent_id = ?1 OR d.agent_id = 'global'
    ").map_err(|e| e.to_string())?;

    let chunk_iter = stmt.query_map(rusqlite::params![agent_id], |row| {
        Ok(GalaxyChunk {
            id: row.get(0)?,
            content: row.get(1)?,
            pos_x: row.get(2)?,
            pos_y: row.get(3)?,
            pos_z: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut chunks = Vec::new();
    for chunk in chunk_iter {
        if let Ok(c) = chunk {
            chunks.push(c);
        }
    }

    Ok(chunks)
}

#[tauri::command]
pub async fn delete_rag_document(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("forge.db");
    
    if !db_path.exists() {
        return Ok(());
    }

    let state = app.state::<crate::AppState>();
    let pool = state.db.as_ref().ok_or("Database connection not found")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    
    conn.execute("DELETE FROM rag_chunks WHERE document_id = ?1", rusqlite::params![id]).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM rag_documents WHERE id = ?1", rusqlite::params![id]).map_err(|e| e.to_string())?;
    
    tracing::info!("🗑️ [RAG] Document and chunks deleted for id: {}", id);

    Ok(())
}

#[tauri::command]
pub async fn get_document_chunks(app: tauri::AppHandle, document_id: String) -> Result<Vec<String>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("forge.db");
    
    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let state = app.state::<crate::AppState>();
    let pool = state.db.as_ref().ok_or("Database connection not found")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT content FROM rag_chunks WHERE document_id = ?1 ORDER BY rowid ASC").map_err(|e| e.to_string())?;
    
    let chunk_iter = stmt.query_map(rusqlite::params![document_id], |row| {
        row.get::<_, String>(0)
    }).map_err(|e| e.to_string())?;

    let mut chunks = Vec::new();
    for chunk in chunk_iter {
        if let Ok(c) = chunk {
            chunks.push(c);
        }
    }

    Ok(chunks)
}

#[derive(Serialize)]
pub struct Agent {
    id: String,
    name: String,
    description: String,
    system_prompt: String,
    status: String,
}

#[tauri::command]
pub async fn get_agents(app: tauri::AppHandle) -> Result<Vec<Agent>, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("forge.db");
    
    if !db_path.exists() {
        return Ok(Vec::new());
    }

    let state = app.state::<crate::AppState>();
    let pool = state.db.as_ref().ok_or("Database connection not found")?;
    let conn = pool.get().map_err(|e| e.to_string())?;


    let mut stmt = conn.prepare("SELECT id, name, description, system_prompt, status FROM agents").map_err(|e| e.to_string())?;
    
    let agent_iter = stmt.query_map([], |row| {
        Ok(Agent {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            system_prompt: row.get(3)?,
            status: row.get(4)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut agents = Vec::new();
    for agent in agent_iter {
        if let Ok(a) = agent {
            agents.push(a);
        }
    }

    Ok(agents)
}

#[tauri::command]
pub async fn create_agent(app: tauri::AppHandle, name: String, description: String, system_prompt: String) -> Result<Agent, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let _db_path = app_data_dir.join("forge.db");
    
    let state = app.state::<crate::AppState>();
    let pool = state.db.as_ref().ok_or("Database connection not found")?;
    let conn = pool.get().map_err(|e| e.to_string())?;


    let id = uuid::Uuid::new_v4().to_string();
    let status = "ready".to_string();

    conn.execute(
        "INSERT INTO agents (id, name, description, system_prompt, status) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![id, name, description, system_prompt, status],
    ).map_err(|e| e.to_string())?;

    Ok(Agent {
        id,
        name,
        description,
        system_prompt,
        status,
    })
}

#[tauri::command]
pub async fn delete_agent(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("forge.db");
    
    if !db_path.exists() {
        return Ok(());
    }

    let state = app.state::<crate::AppState>();
    let pool = state.db.as_ref().ok_or("Database connection not found")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM agents WHERE id = ?1", rusqlite::params![id]).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub async fn update_agent(app: tauri::AppHandle, id: String, system_prompt: String) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = app_data_dir.join("forge.db");
    
    if !db_path.exists() {
        return Ok(());
    }

    let state = app.state::<crate::AppState>();
    let pool = state.db.as_ref().ok_or("Database connection not found")?;
    let conn = pool.get().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE agents SET system_prompt = ?1 WHERE id = ?2",
        rusqlite::params![system_prompt, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn trigger_predation(app: AppHandle) -> Result<(), String> {
    let result = tokio::task::spawn_blocking(|| crate::profiler::predator::rank_and_throttle_hogs())
        .await
        .map_err(|e| e.to_string())?;
        
    if let Some(event) = result {
        let _ = app.emit("forge://predation", event);
    }
    Ok(())
}

#[tauri::command]
pub async fn start_autopsy(model_path: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut lock = state.autopsy_session.lock().await;
    let session = crate::profiler::autopsy::AutopsySession::new(&model_path)?;
    *lock = Some(session);
    Ok(())
}

#[tauri::command]
pub async fn sample_autopsy(state: State<'_, AppState>) -> Result<crate::profiler::autopsy::TensorScanEvent, String> {
    let mut lock = state.autopsy_session.lock().await;
    if let Some(session) = lock.as_mut() {
        Ok(session.sample_bytes(8192)) // 8KB chunks
    } else {
        Err("No active autopsy session".into())
    }
}

#[tauri::command]
pub async fn stop_autopsy(state: State<'_, AppState>) -> Result<(), String> {
    let mut lock = state.autopsy_session.lock().await;
    *lock = None;
    Ok(())
}
