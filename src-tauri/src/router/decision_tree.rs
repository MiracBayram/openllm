use serde::{Deserialize, Serialize};

use crate::engines::EngineAdapter;
use crate::profiler::HardwareProfile;
use crate::router::ModelInfo;
use std::fs::File;
use std::io::Read;
use std::collections::HashMap;
use tokio::sync::RwLock;
use std::sync::OnceLock;

static ENGINE_CACHE: OnceLock<RwLock<HashMap<String, bool>>> = OnceLock::new();

pub fn get_engine_cache() -> &'static RwLock<HashMap<String, bool>> {
    ENGINE_CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineRecommendation {
    pub primary: String, // changed from Box<dyn EngineAdapter> for serialization via Tauri
    pub score: f32,
    pub reason: String,
    pub flags: Vec<String>,
    pub estimated_vram_mb: u64,
    pub estimated_ram_mb: u64,
    pub oom_risk: OomRisk,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OomRisk {
    Safe,
    Marginal,
    High,
}

pub fn inspect_magic_bytes(path: &str) -> String {
    let Ok(mut file) = File::open(path) else {
        return "unknown".to_string();
    };
    let mut buf = [0u8; 4];
    if file.read_exact(&mut buf).is_ok() {
        // GGUF magic bytes: "GGUF" in ASCII (0x46554747)
        if buf == [0x47, 0x47, 0x55, 0x46] {
            return "gguf".to_string();
        }
        // Safetensors or AWQ JSON header usually starts with "{" or small endian len + "{"
        if buf[0] == b'{' || buf[2] == b'{' || buf[3] == b'{' {
            return "safetensors_or_awq".to_string();
        }
    }
    "unknown".to_string()
}

pub async fn select_engine(
    profile: &HardwareProfile,
    model: &ModelInfo,
    registry: &[Box<dyn EngineAdapter>],
) -> Result<EngineRecommendation, String> {
    let mut best_score = -1.0;
    let mut best_engine: Option<&Box<dyn EngineAdapter>> = None;

    let magic_format = inspect_magic_bytes(&model.path);
    
    // Forcer route based on magic bytes
    for engine in registry {
        let mut is_avail = false;
        {
            let cache = get_engine_cache().read().await;
            if let Some(&avail) = cache.get(engine.name()) {
                is_avail = avail;
            }
        }
        
        if !is_avail {
            // First time check or cache miss
            is_avail = engine.is_available().await;
            let mut cache = get_engine_cache().write().await;
            cache.insert(engine.name().to_string(), is_avail);
        }

        if is_avail {
            let mut score = engine.suitability_score(profile, model);
            
            // Hard routing rules
            if magic_format == "gguf" && engine.name() == "llama.cpp" {
                score += 1000.0;
            } else if magic_format == "safetensors_or_awq" && (engine.name() == "vLLM" || engine.name() == "LMDeploy") {
                score += 1000.0;
            }

            if score > best_score {
                best_score = score;
                best_engine = Some(engine);
            }
        }
    }

    let engine = best_engine.ok_or_else(|| "No inference engine available".to_string())?;
    
    let flags = engine.generate_flags(profile, model);

    // M1 Fix: Remove restrictive quantization check
    // We trust the model selection algorithm to evaluate memory properly now

    // GQA-Aware KV Cache & CUDA Overhead Estimation
    const CUDA_CONTEXT_OVERHEAD_MB: u64 = 1024;
    
    let context_length = 8192; // Default context, should ideally come from params
    let layers = if model.layer_count > 0 { model.layer_count as u64 } else { 32 };
    
    let kv_heads = model.attention_head_count_kv.unwrap_or(model.attention_head_count).max(1);
    let head_dim = model.embedding_length.checked_div(model.attention_head_count).unwrap_or(128).max(1);
    let _gqa_ratio = model.attention_head_count as f32 / kv_heads as f32;
    
    // GQA (Grouped Query Attention) and Sliding Window / Ring Attention heuristics
    // If gqa_ratio > 1.0, the KV cache is proportionally smaller.
    // 2 * num_layers * num_kv_heads * head_dim * ctx_size * sizeof(f16) -> MB
    let kv_cache_mb = ((2.0 * layers as f32 * kv_heads as f32 * head_dim as f32 * context_length as f32 * 2.0) / 1048576.0) as u64;
    
    let total_required_vram_mb = model.size_mb + kv_cache_mb + CUDA_CONTEXT_OVERHEAD_MB;
    let total_required_ram_mb = model.size_mb + kv_cache_mb + 512; // Base RAM overhead

    let estimated_vram_mb = if !profile.gpus.is_empty() {
        total_required_vram_mb
    } else {
        0
    };

    let estimated_ram_mb = if estimated_vram_mb == 0 {
        total_required_ram_mb
    } else {
        512 // Base overhead
    };

    let oom_risk = if estimated_vram_mb > 0 {
        let vram_avail = profile.gpus[0].vram_available_mb;
        if estimated_vram_mb > vram_avail {
            OomRisk::High
        } else if estimated_vram_mb as f32 > vram_avail as f32 * 0.9 {
            OomRisk::Marginal
        } else {
            OomRisk::Safe
        }
    } else {
        let ram_avail = profile.memory.available_mb;
        if estimated_ram_mb > ram_avail {
            OomRisk::High
        } else if estimated_ram_mb as f32 > ram_avail as f32 * 0.9 {
            OomRisk::Marginal
        } else {
            OomRisk::Safe
        }
    };

    Ok(EngineRecommendation {
        primary: engine.name().to_string(),
        score: best_score,
        reason: format!("Score: {}", best_score),
        flags,
        estimated_vram_mb,
        estimated_ram_mb,
        oom_risk,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engines::{EngineAdapter, EngineEvent};
    use crate::process::spawner::EngineHandle;
    use crate::profiler::{CpuFeatures, CpuInfo, MemoryInfo, Platform};
    use async_trait::async_trait;
    use std::path::PathBuf;
    use tokio::sync::mpsc;

    struct MockEngine;

    #[async_trait]
    impl EngineAdapter for MockEngine {
        fn name(&self) -> &'static str { "mock" }
        async fn is_available(&self) -> bool { true }
        fn suitability_score(&self, _profile: &HardwareProfile, _model: &ModelInfo) -> f32 { 10.0 }
        fn generate_flags(&self, _profile: &HardwareProfile, _model: &ModelInfo) -> Vec<String> { vec![] }
        async fn spawn(&self, _path: PathBuf, _flags: Vec<String>, _tx: mpsc::Sender<EngineEvent>) -> Result<EngineHandle, crate::engines::EngineError> {
            unimplemented!()
        }
    }

    fn mock_profile(vram: u64, ram: u64, avx512: bool) -> HardwareProfile {
        HardwareProfile {
            cpu: CpuInfo {
                brand: "Test CPU".to_string(),
                physical_cores: 8,
                logical_cores: 16,
                base_freq_mhz: 3000,
                features: CpuFeatures {
                    avx: true,
                    avx2: true,
                    avx512f: avx512,
                    avx512_vnni: false,
                    amx_bf16: false,
                    apple_amx: false,
                    neon: false,
                },
                numa_nodes: 1,
                cache_l3_kb: 16384,
            },
            memory: MemoryInfo {
                total_mb: ram,
                available_mb: ram,
                channels: 2,
                bandwidth_gbps: 50.0,
                is_unified: false,
            },
            gpus: if vram > 0 {
                vec![crate::profiler::GpuInfo {
                    name: "Test GPU".to_string(),
                    vendor: crate::profiler::GpuVendor::Nvidia,
                    vram_mb: vram,
                    vram_available_mb: vram,
                    compute_capability: Some((8, 0)),
                    max_power_limit_w: 250,
                    pcie_gen: 4,
                    nvlink: false,
                }]
            } else {
                vec![]
            },
            platform: Platform::Linux,
            profiled_at: 0,
        }
    }

    #[tokio::test]
    async fn test_decision_tree_oom_risk_high() {
        let profile = mock_profile(0, 4000, false);
        let model = ModelInfo {
            path: "".to_string(),
            name: "".to_string(),
            size_mb: 8000,
            layer_count: 32,
            architecture: "llama".to_string(),
            quant_label: "".to_string(),
            chat_template: None,
            attention_head_count: 32,
            attention_head_count_kv: None,
            embedding_length: 4096,
        };
        let registry: Vec<Box<dyn EngineAdapter>> = vec![Box::new(MockEngine)];
        let rec = select_engine(&profile, &model, &registry).await.unwrap();
        assert_eq!(rec.oom_risk, OomRisk::High);
    }
}
