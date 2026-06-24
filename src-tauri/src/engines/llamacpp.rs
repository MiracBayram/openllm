use async_trait::async_trait;
use std::path::PathBuf;
use std::process::Stdio;
use crate::engines::{EngineAdapter, EngineError, EngineEvent};
use crate::profiler::HardwareProfile;
use crate::router::ModelInfo;
use crate::router::flag_gen::{FlagContext, get_strategy};
use crate::process::spawner::{EngineHandle, SpawnOptions, spawn_engine};

pub struct LlamaCppAdapter;

impl LlamaCppAdapter {
    pub fn new() -> Self {
        Self
    }
}

impl Default for LlamaCppAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl EngineAdapter for LlamaCppAdapter {
    fn name(&self) -> &'static str {
        "llama.cpp"
    }

    async fn is_available(&self) -> bool {
        // Checking via tokio process if binary is in PATH
        tokio::process::Command::new("llama-server")
            .arg("--help")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await
            .is_ok()
    }

    fn suitability_score(&self, profile: &HardwareProfile, model: &ModelInfo) -> f32 {
        let has_gpu = !profile.gpus.is_empty();
        let total_vram = profile.gpus.iter().map(|g| g.vram_mb).sum::<u64>();

        if has_gpu && total_vram as f32 > model.size_mb as f32 * 1.2 {
            0.7
        } else if profile.cpu.features.apple_amx {
            0.90
        } else if profile.cpu.features.avx512f {
            0.85
        } else if profile.memory.available_mb > model.size_mb {
            0.5
        } else {
            0.1
        }
    }

    fn generate_flags(&self, profile: &HardwareProfile, model: &ModelInfo) -> Vec<String> {
        let strategy = get_strategy("llama.cpp");
        let ctx = FlagContext {
            profile,
            model,
            engine_name: "llama.cpp",
        };
        strategy.build_flags(&ctx)
    }

    async fn spawn(
        &self,
        binary_path: PathBuf,
        flags: Vec<String>,
        tx: tokio::sync::mpsc::Sender<EngineEvent>,
    ) -> Result<EngineHandle, EngineError> {
        // Because signature doesn't pass profile/model, we generate envs/wrappers directly here for now
        // A full refactor would pass FlagContext to spawn as well, but this is a solid first step.
        // We'll use empty envs and wrappers here unless we fully refactor the trait signature.
        // For Phase 1, we rely on the central spawn_engine logic.
        
        // Actually, to get the pre_wrapper, we should pass them from generate_flags or change trait.
        // Let's just use empty for now until trait is updated.
        let mut final_flags = flags;
        let mut prompt_text = String::new();
        
        if let Some(pos) = final_flags.iter().position(|x| x == "--prompt") {
            if pos + 1 < final_flags.len() {
                prompt_text = final_flags.remove(pos + 1);
            }
            final_flags.remove(pos);
        }

        // Get a free port
        let listener = std::net::TcpListener::bind("127.0.0.1:0").map_err(|e| EngineError::SpawnFailed(e.to_string()))?;
        let port = listener.local_addr().map_err(|e| EngineError::SpawnFailed(e.to_string()))?.port();
        drop(listener);

        final_flags.push("--port".to_string());
        final_flags.push(port.to_string());

        // Use llama-server instead of llama-cli
        let server_binary_path = if binary_path.file_stem().unwrap_or_default() == "llama-cli" {
            let mut p = binary_path.clone();
            p.set_file_name(if cfg!(windows) { "llama-server.exe" } else { "llama-server" });
            p
        } else {
            binary_path.clone()
        };

        let mut temp: f64 = 0.7;
        let mut n_predict: i64 = 4096;
        
        for i in 0..final_flags.len() {
            if final_flags[i] == "--temp" && i + 1 < final_flags.len() {
                temp = final_flags[i+1].parse().unwrap_or(0.7);
            } else if final_flags[i] == "-n" && i + 1 < final_flags.len() {
                n_predict = final_flags[i+1].parse().unwrap_or(4096);
            }
        }

        let opts = SpawnOptions {
            binary_path: server_binary_path,
            flags: final_flags,
            envs: std::collections::HashMap::new(),
            pre_wrapper: vec![],
        };

        let (handle, _stdout, stderr) = spawn_engine(opts).await?;
        
        let tx_clone = tx.clone();
        tokio::spawn(async move {
            crate::process::stream::stream_llama_server_stderr(stderr, tx_clone, port, prompt_text, temp, n_predict).await;
        });

        Ok(handle)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::profiler::{CpuFeatures, CpuInfo, HardwareProfile, MemoryInfo, Platform};

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

    #[test]
    fn test_generate_flags_mlock() {
        let profile = mock_profile(0, 16000, true); // avx512 = true
        let model = ModelInfo {
            path: "test.gguf".to_string(),
            name: "test".to_string(),
            size_mb: 4000,
            layer_count: 32,
            architecture: "llama".to_string(),
            quant_label: "Q4".to_string(),
            chat_template: None,
            attention_head_count: 32,
            attention_head_count_kv: None,
            embedding_length: 4096,
        };
        let adapter = LlamaCppAdapter::new();
        let flags = adapter.generate_flags(&profile, &model);
        assert!(flags.contains(&"--mlock".to_string()));
    }
}
