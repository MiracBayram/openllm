use crate::engines::{EngineAdapter, EngineError, EngineEvent};
use crate::process::spawner::EngineHandle;
use crate::profiler::HardwareProfile;
use crate::router::ModelInfo;
use async_trait::async_trait;
use std::path::PathBuf;
use tokio::sync::mpsc;

pub struct PowerInferAdapter;

impl PowerInferAdapter {
    pub fn new() -> Self {
        Self
    }
}

impl Default for PowerInferAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl EngineAdapter for PowerInferAdapter {
    fn name(&self) -> &'static str {
        "PowerInfer-2"
    }

    async fn is_available(&self) -> bool {
        tokio::process::Command::new("powerinfer")
            .arg("--help")
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn suitability_score(&self, profile: &HardwareProfile, model: &ModelInfo) -> f32 {
        let total_vram: u64 = profile.gpus.iter().map(|g| g.vram_available_mb).sum();
        let model_size = model.size_mb;

        // GPU VRAM modelin %30 ile %70 arasındaysa PowerInfer çok iyi
        let ratio = total_vram as f32 / model_size as f32;
        if ratio > 0.3 && ratio < 0.7 {
            0.82
        } else {
            0.30
        }
    }

    fn generate_flags(&self, profile: &HardwareProfile, model: &ModelInfo) -> Vec<String> {
        let mut flags = vec![
            "--model".into(),
            model.path.clone(),
            "--sparse-threshold".into(),
            "0.1".into(),
        ];

        let safe_vram_mb = if !profile.gpus.is_empty() {
            (profile.gpus[0].vram_available_mb as f32 * 0.9) as u64
        } else {
            0
        };

        let bytes_per_layer = (model.size_mb * 1024 * 1024)
            .checked_div(model.layer_count as u64)
            .unwrap_or(1);

        let gpu_layers = if bytes_per_layer > 0 {
            (safe_vram_mb * 1024 * 1024)
                .checked_div(bytes_per_layer)
                .unwrap_or(0)
                .min(model.layer_count as u64) as u32
        } else {
            0
        };

        flags.push("--n-gpu-layers".into());
        flags.push(gpu_layers.to_string());

        let threads = (profile.cpu.physical_cores as f32 * 0.75) as u32;
        flags.push("--threads".into());
        flags.push(threads.max(1).to_string());

        flags
    }

    async fn spawn(
        &self,
        binary_path: PathBuf,
        flags: Vec<String>,
        tx: mpsc::Sender<EngineEvent>,
    ) -> Result<EngineHandle, EngineError> {
        let mut child = tokio::process::Command::new(&binary_path)
            .args(&flags)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| EngineError::SpawnFailed(e.to_string()))?;

        let pid = child
            .id()
            .ok_or_else(|| EngineError::SpawnFailed("PID alınamadı".into()))?;
        let stdout = child.stdout.take().expect("stdout piped");

        tokio::spawn(crate::process::stream::stream_llamacpp(stdout, tx));

        let (stop_tx, stop_rx) = tokio::sync::oneshot::channel::<()>();

        tokio::spawn(async move {
            tokio::select! {
                _ = child.wait() => {}
                _ = stop_rx => {
                    #[cfg(unix)]
                    {
                        let _ = nix::sys::signal::kill(
                            nix::unistd::Pid::from_raw(pid as i32),
                            nix::sys::signal::Signal::SIGTERM,
                        );
                    }
                    #[cfg(windows)]
                    { let _ = child.kill().await; }

                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                    let _ = child.kill().await;
                }
            }
        });

        Ok(EngineHandle { pid, stop_tx: Some(stop_tx) })
    }
}
