use serde::{Deserialize, Serialize};

pub mod downloader;

#[derive(Serialize)]
pub struct HubModel {
    pub model_id: String,
    pub downloads: u64,
    pub likes: u64,
    pub tags: Vec<String>,
}

#[derive(Deserialize)]
struct HfModelResponse {
    id: String,
    downloads: u64,
    likes: u64,
    tags: Vec<String>,
}

pub async fn search_models(query: &str) -> Result<Vec<HubModel>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    // Reuse a single client to avoid TLS handshake and connection pool overhead per keystroke
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    let client = CLIENT.get_or_init(|| reqwest::Client::new());

    let url = format!("https://huggingface.co/api/models?search={}&sort=downloads&direction=-1&limit=15", query);
    
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    
    if !res.status().is_success() {
        return Err(format!("HF API returned error: {}", res.status()));
    }

    let hf_models: Vec<HfModelResponse> = res.json().await.map_err(|e| e.to_string())?;
    
    let mut models = Vec::new();
    for m in hf_models {
        models.push(HubModel {
            model_id: m.id,
            downloads: m.downloads,
            likes: m.likes,
            tags: m.tags,
        });
    }
    
    tracing::info!("Hugging Face API üzerinden {} modeli sorgulandı.", query);
    
    Ok(models)
}

pub fn build_model_url(model_id: &str, file_name: &str) -> Result<String, String> {
    if model_id.contains("..") || file_name.contains("..") {
        return Err("Geçersiz path (Path traversal girişimi)".to_string());
    }
    
    let parts: Vec<&str> = model_id.split('/').collect();
    if parts.len() != 2 {
        return Err("Geçersiz model_id formatı".to_string());
    }

    let valid_chars = |s: &str| s.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.');
    
    if !valid_chars(parts[0]) || !valid_chars(parts[1]) {
        return Err("Model ID geçersiz karakterler barındırıyor".to_string());
    }

    if !valid_chars(file_name) {
        return Err("Dosya ismi geçersiz karakterler barındırıyor".to_string());
    }

    Ok(format!("https://huggingface.co/{}/resolve/main/{}", model_id, file_name))
}
