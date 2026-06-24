use serde::{Deserialize, Serialize};
use sysinfo::System;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuInfo {
    pub brand: String,
    pub physical_cores: u32,
    pub logical_cores: u32,
    pub base_freq_mhz: u32,
    pub features: CpuFeatures,
    pub numa_nodes: u32,
    pub cache_l3_kb: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CpuFeatures {
    pub avx: bool,
    pub avx2: bool,
    pub avx512f: bool,
    pub avx512_vnni: bool,
    pub amx_bf16: bool,
    pub apple_amx: bool,
    pub neon: bool,
}

pub fn get_cpu_usage() -> f32 {
    let mut sys = sysinfo::System::new();
    sys.refresh_cpu_usage();
    std::thread::sleep(std::time::Duration::from_millis(100)); // Sleep briefly to get accurate usage
    sys.refresh_cpu_usage();
    sys.cpus().iter().map(|c| c.cpu_usage()).sum::<f32>() / sys.cpus().len().max(1) as f32
}

pub fn get_cpu_info(sys: &System) -> CpuInfo {
    let cpus = sys.cpus();
    let brand = cpus
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_else(|| "Unknown".to_string());
    let logical_cores = cpus.len() as u32;
    let physical_cores = sys.physical_core_count().unwrap_or(logical_cores as usize) as u32;
    let base_freq_mhz = cpus.first().map(|c| c.frequency()).unwrap_or(0) as u32;

    let features = detect_features();
    let numa_nodes = detect_numa_nodes();

    CpuInfo {
        brand,
        physical_cores,
        logical_cores,
        base_freq_mhz,
        features,
        numa_nodes,
        cache_l3_kb: 0,
    }
}

fn detect_features() -> CpuFeatures {
    #[cfg(any(target_arch = "x86", target_arch = "x86_64"))]
    {
        CpuFeatures {
            avx: std::arch::is_x86_feature_detected!("avx"),
            avx2: std::arch::is_x86_feature_detected!("avx2"),
            avx512f: std::arch::is_x86_feature_detected!("avx512f"),
            avx512_vnni: std::arch::is_x86_feature_detected!("avx512vnni"),
            amx_bf16: false, // amx requires specialized CPUID checks not in std yet
            apple_amx: false,
            neon: false,
        }
    }
    #[cfg(target_arch = "aarch64")]
    {
        CpuFeatures {
            avx: false,
            avx2: false,
            avx512f: false,
            avx512_vnni: false,
            amx_bf16: false,
            apple_amx: cfg!(target_os = "macos"),
            neon: std::arch::is_aarch64_feature_detected!("neon"),
        }
    }
    #[cfg(not(any(target_arch = "x86", target_arch = "x86_64", target_arch = "aarch64")))]
    {
        CpuFeatures {
            avx: false,
            avx2: false,
            avx512f: false,
            avx512_vnni: false,
            amx_bf16: false,
            apple_amx: false,
            neon: false,
        }
    }
}

fn detect_numa_nodes() -> u32 {
    #[cfg(target_os = "linux")]
    {
        if let Ok(dir) = std::fs::read_dir("/sys/devices/system/node") {
            let count = dir
                .filter_map(|e| e.ok())
                .filter(|e| e.file_name().to_string_lossy().starts_with("node"))
                .count();
            if count > 0 {
                return count as u32;
            }
        }
        1
    }
    #[cfg(not(target_os = "linux"))]
    {
        1
    }
}
