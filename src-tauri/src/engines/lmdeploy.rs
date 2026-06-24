use crate::engines::{EngineAdapter, EngineError, EngineEvent};
use crate::process::spawner::EngineHandle;
use crate::profiler::HardwareProfile;
use crate::router::ModelInfo;
use async_trait::async_trait;
use std::path::PathBuf;
use tokio::sync::mpsc;
use tokio::io::{AsyncBufReadExt, BufReader};
use serde_json::Value;

pub async fn stream_lmdeploy(
    stdout: tokio::process::ChildStdout,
    tx: mpsc::Sender<EngineEvent>,
) -> Result<(), EngineError> {
    let mut reader = BufReader::new(stdout).lines();
    
    while let Ok(Some(line)) = reader.next_line().await {
        if let Ok(json) = serde_json::from_str::<Value>(&line) {
            if let Some(text) = json.get("text").and_then(|t| t.as_str()) {
                let _ = tx.send(EngineEvent::Token(text.to_string())).await;
            }
            if json.get("finish_reason").and_then(|f| f.as_str()) == Some("stop") {
                break;
            }
        }
    }
    Ok(())
}

pub struct LmdeployAdapter;

impl LmdeployAdapter {
    pub fn new() -> Self {
        Self
    }
}

impl Default for LmdeployAdapter {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl EngineAdapter for LmdeployAdapter {
    fn name(&self) -> &'static str {
        "LMDeploy"
    }

    async fn is_available(&self) -> bool {
        tokio::process::Command::new("lmdeploy")
            .arg("--version")
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    fn suitability_score(&self, profile: &HardwareProfile, model: &ModelInfo) -> f32 {
        let is_awq = model.quant_label.to_lowercase().contains("awq");
        let total_vram: u64 = profile.gpus.iter().map(|g| g.vram_available_mb).sum();
        let fits = total_vram > model.size_mb;

        let base_score = if profile.gpus.len() == 1 && fits {
            0.73
        } else {
            0.1
        };
        let bonus = if is_awq { 0.15 } else { 0.0 };
        base_score + bonus
    }

    fn generate_flags(&self, profile: &HardwareProfile, model: &ModelInfo) -> Vec<String> {
        let is_awq = model.quant_label.to_lowercase().contains("awq");
        let gpu_count = profile.gpus.len().max(1);
        vec![
            "serve".into(),
            "api_server".into(),
            model.path.clone(),
            "--backend".into(),
            "turbomind".into(),
            "--tp".into(),
            gpu_count.to_string(),
            "--quant-policy".into(),
            if is_awq { "4".into() } else { "0".into() },
            "--cache-max-entry-count".into(),
            "0.8".into(),
        ]
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

        tokio::spawn(stream_lmdeploy(stdout, tx));

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
