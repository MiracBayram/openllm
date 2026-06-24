use crate::engines::{EngineAdapter, EngineError, EngineEvent};
use crate::process::spawner::EngineHandle;
use crate::profiler::HardwareProfile;
use crate::router::ModelInfo;
use async_trait::async_trait;
use std::path::PathBuf;
use tokio::sync::mpsc;
use tokio::io::{AsyncBufReadExt, BufReader};
use serde_json::Value;

pub async fn stream_vllm(
    stdout: tokio::process::ChildStdout,
    tx: mpsc::Sender<EngineEvent>,
) -> Result<(), EngineError> {
    let mut reader = BufReader::new(stdout).lines();
    
    while let Ok(Some(line)) = reader.next_line().await {
        if line.starts_with("data: ") {
            let json_str = &line[6..];
            if json_str.trim() == "[DONE]" {
                break;
            }
            
            if let Ok(json) = serde_json::from_str::<Value>(json_str) {
                if let Some(content) = json.get("choices")
                    .and_then(|c| c.get(0))
                    .and_then(|c| c.get("delta"))
                    .and_then(|d| d.get("content"))
                    .and_then(|c| c.as_str())
                {
                    let _ = tx.send(EngineEvent::Token(content.to_string())).await;
                }
            }
        }
    }
    Ok(())
}

pub struct VllmAdapter;

impl VllmAdapter {
    pub fn new() -> Self {
        Self
    }
}

impl Default for VllmAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl EngineAdapter for VllmAdapter {
    fn name(&self) -> &'static str {
        "vLLM"
    }

    async fn is_available(&self) -> bool {
        tokio::process::Command::new("python")
            .args(["-c", "import vllm"])
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn suitability_score(&self, profile: &HardwareProfile, model: &ModelInfo) -> f32 {
        let total_vram: u64 = profile.gpus.iter().map(|g| g.vram_available_mb).sum();
        let gpu_count = profile.gpus.len();
        if gpu_count == 0 {
            return 0.0;
        }

        let fits = total_vram > model.size_mb;
        match (gpu_count, fits) {
            (n, true) if n > 1 => 0.95,
            (1, true) if total_vram > 20_000 => 0.80,
            (1, true) => 0.60,
            _ => 0.05,
        }
    }

    fn generate_flags(&self, profile: &HardwareProfile, model: &ModelInfo) -> Vec<String> {
        let gpu_count = profile.gpus.len().max(1);
        let util = 0.90_f32;
        vec![
            "--model".into(),
            model.path.clone(),
            "--tensor-parallel-size".into(),
            gpu_count.to_string(),
            "--gpu-memory-utilization".into(),
            format!("{:.2}", util),
            "--max-model-len".into(),
            "8192".into(),
            "--dtype".into(),
            if profile
                .gpus
                .first()
                .and_then(|g| g.compute_capability)
                .map(|(major, _)| major >= 8)
                .unwrap_or(false)
            {
                "bfloat16".into()
            } else {
                "float16".into()
            },
        ]
    }

    async fn spawn(
        &self,
        _binary_path: PathBuf,
        flags: Vec<String>,
        tx: mpsc::Sender<EngineEvent>,
    ) -> Result<EngineHandle, EngineError> {
        let mut args = vec![
            "-m".to_string(),
            "vllm.entrypoints.openai.api_server".to_string(),
        ];
        args.extend(flags);
        let mut child = tokio::process::Command::new("python")
            .args(&args)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| EngineError::SpawnFailed(e.to_string()))?;

        let pid = child
            .id()
            .ok_or_else(|| EngineError::SpawnFailed("PID alınamadı".into()))?;
        let stdout = child.stdout.take().expect("stdout piped");

        tokio::spawn(stream_vllm(stdout, tx));

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
