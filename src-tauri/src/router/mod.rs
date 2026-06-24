use serde::{Deserialize, Serialize};

pub mod decision_tree;
pub mod flag_gen;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelInfo {
    pub path: String,
    pub name: String,
    pub size_mb: u64,
    pub layer_count: u32,
    pub architecture: String,
    pub quant_label: String,
    pub chat_template: Option<String>,
    pub attention_head_count: u32,
    pub attention_head_count_kv: Option<u32>,
    pub embedding_length: u32,
}

impl ModelInfo {
    pub fn from_path(path: &std::path::Path) -> Result<Self, crate::profiler::gguf::GgufError> {
        let meta = crate::profiler::gguf::read_gguf_meta(path)?;
        Ok(Self {
            path: path.to_string_lossy().to_string(),
            name: path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string(),
            size_mb: meta.file_size_mb,
            layer_count: meta.layer_count,
            architecture: meta.architecture,
            quant_label: meta.quant_label,
            chat_template: meta.chat_template,
            attention_head_count: meta.attention_head_count,
            attention_head_count_kv: meta.attention_head_count_kv,
            embedding_length: meta.embedding_length,
        })
    }
}
