use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use crate::profiler::HardwareProfile;
use crate::router::ModelInfo;

pub mod llamacpp;
pub mod lmdeploy;
pub mod powerinfer;
pub mod vllm;
pub mod flag_sanitizer;
pub mod template_engine;

use std::sync::OnceLock;

static ENGINE_REGISTRY: OnceLock<Vec<Box<dyn EngineAdapter>>> = OnceLock::new();

pub fn build_engine_registry() -> &'static [Box<dyn EngineAdapter>] {
    ENGINE_REGISTRY.get_or_init(|| {
        vec![
            Box::new(llamacpp::LlamaCppAdapter::new()),
            Box::new(vllm::VllmAdapter::new()),
            Box::new(lmdeploy::LmdeployAdapter::new()),
            Box::new(powerinfer::PowerInferAdapter::new()),
        ]
    })
}

#[derive(Debug, thiserror::Error)]
pub enum EngineError {
    #[error("Failed to spawn engine process: {0}")]
    SpawnFailed(String),
    #[error("Engine execution error: {0}")]
    ExecutionError(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum EngineEvent {
    Token(String),
    Done {
        tokens_generated: u32,
        duration_ms: u64,
    },
    Error(String),
    Log(String),
    Stats {
        tokens_per_sec: f32,
        vram_used_mb: u64,
    },
}

#[async_trait]
pub trait EngineAdapter: Send + Sync {
    fn name(&self) -> &'static str;

    /// Sistemde kurulu mu kontrol et (binary PATH'te var mı vb.)
    async fn is_available(&self) -> bool;

    /// Bu motor + bu donanım kombinasyonu ne kadar uygun? (0.0 = hiç, 1.0 = mükemmel)
    fn suitability_score(&self, profile: &HardwareProfile, model: &ModelInfo) -> f32;

    /// OOM vermeyecek CLI argüman listesi üret
    fn generate_flags(&self, profile: &HardwareProfile, model: &ModelInfo) -> Vec<String>;

    /// Motoru başlat, event'leri tx'e gönder
    async fn spawn(
        &self,
        binary_path: PathBuf,
        flags: Vec<String>,
        tx: tokio::sync::mpsc::Sender<EngineEvent>,
    ) -> Result<crate::process::spawner::EngineHandle, EngineError>;
}


