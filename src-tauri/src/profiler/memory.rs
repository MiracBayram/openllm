use serde::{Deserialize, Serialize};
use sysinfo::System;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryInfo {
    pub total_mb: u64,
    pub available_mb: u64,
    pub channels: u32,
    pub bandwidth_gbps: f32,
    pub is_unified: bool,
}

pub fn get_memory_info(sys: &System) -> MemoryInfo {
    let total_mb = sys.total_memory() / 1024 / 1024;
    let available_mb = sys.available_memory() / 1024 / 1024;

    MemoryInfo {
        total_mb,
        available_mb,
        channels: 2,         // fallback dual channel
        bandwidth_gbps: 0.0, // fallback
        is_unified: cfg!(target_os = "macos") && cfg!(target_arch = "aarch64"),
    }
}
