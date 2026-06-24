use serde::{Deserialize, Serialize};

pub mod cpu;
pub mod gguf;
pub mod gpu;
pub mod memory;
pub mod predator;
pub mod autopsy;

pub use cpu::*;
pub use gguf::{read_gguf_meta, GgufError, GgufMeta};
pub use gpu::*;
pub use memory::*;
pub use predator::*;
pub use autopsy::*;

use std::sync::{Mutex as StdMutex, OnceLock};

static SYSINFO: OnceLock<StdMutex<sysinfo::System>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareProfile {
    pub cpu: CpuInfo,
    pub memory: MemoryInfo,
    pub gpus: Vec<GpuInfo>,
    pub platform: Platform,
    pub profiled_at: u64, // unix ms
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Platform {
    Windows,
    Linux,
    MacOs,
    Unknown,
}

#[derive(Debug, thiserror::Error)]
pub enum ProfilerError {
    #[error("Failed to gather system information: {0}")]
    SysinfoError(String),
    #[error("I/O Error: {0}")]
    IoError(#[from] std::io::Error),
}

pub async fn profile() -> Result<HardwareProfile, ProfilerError> {
    let platform = if cfg!(target_os = "windows") {
        Platform::Windows
    } else if cfg!(target_os = "linux") {
        Platform::Linux
    } else if cfg!(target_os = "macos") {
        Platform::MacOs
    } else {
        Platform::Unknown
    };

    let (cpu, memory) = tokio::task::spawn_blocking(|| {
        let mut sys_lock = SYSINFO.get_or_init(|| {
            let s = sysinfo::System::new_with_specifics(
                sysinfo::RefreshKind::new()
                    .with_cpu(sysinfo::CpuRefreshKind::everything())
                    .with_memory(sysinfo::MemoryRefreshKind::everything())
            );
            StdMutex::new(s)
        }).lock().unwrap();

        sys_lock.refresh_memory();

        let cpu = cpu::get_cpu_info(&sys_lock);
        let memory = memory::get_memory_info(&sys_lock);

        (cpu, memory)
    })
    .await
    .map_err(|e| ProfilerError::SysinfoError(e.to_string()))?;

    let gpus = tokio::task::spawn_blocking(gpu::get_gpu_info)
        .await
        .map_err(|e| ProfilerError::SysinfoError(e.to_string()))?;

    let profiled_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    Ok(HardwareProfile {
        cpu,
        memory,
        gpus,
        platform,
        profiled_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_profile_runs_without_error() {
        let profile_result = profile().await;
        assert!(profile_result.is_ok(), "Profile should run without error");
        let hw_profile = profile_result.unwrap();

        assert!(hw_profile.cpu.physical_cores > 0);
        assert!(!hw_profile.cpu.brand.is_empty());
    }
}
