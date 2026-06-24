use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    pub name: String,
    pub vendor: GpuVendor,
    pub vram_mb: u64,
    pub vram_available_mb: u64,
    pub compute_capability: Option<(u32, u32)>,
    pub max_power_limit_w: u32,
    pub pcie_gen: u32,
    pub nvlink: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GpuVendor {
    Nvidia,
    Amd,
    Intel,
    Apple,
    Unknown,
}

pub fn get_gpu_info() -> Vec<GpuInfo> {
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    {
        let mut gpus = get_nvml_gpus();
        if gpus.is_empty() {
            gpus = get_sysinfo_fallback();
        }
        gpus
    }
    #[cfg(target_os = "macos")]
    {
        get_sysinfo_fallback()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        get_sysinfo_fallback()
    }
}

#[cfg(any(target_os = "linux", target_os = "windows"))]
fn get_nvml_gpus() -> Vec<GpuInfo> {
    use nvml_wrapper::Nvml;
    let mut gpus = Vec::new();

    match Nvml::init() {
        Ok(nvml) => {
            let count = nvml.device_count().unwrap_or(0);
            for i in 0..count {
                if let Ok(device) = nvml.device_by_index(i) {
                    let name = device
                        .name()
                        .unwrap_or_else(|_| "Unknown NVIDIA GPU".to_string());
                        
                    if let Ok(mem) = device.memory_info() {
                        let cc = device
                            .cuda_compute_capability()
                            .ok()
                            .map(|c| (c.major as u32, c.minor as u32));
                        let max_power = device.power_management_limit().unwrap_or(0) / 1000; // mW to W

                        gpus.push(GpuInfo {
                            name,
                            vendor: GpuVendor::Nvidia,
                            vram_mb: mem.total / 1024 / 1024,
                            vram_available_mb: mem.free / 1024 / 1024,
                            compute_capability: cc,
                            max_power_limit_w: max_power,
                            pcie_gen: device.max_pcie_link_gen().unwrap_or(0),
                            nvlink: false,
                        });
                    }
                }
            }
        }
        Err(e) => {
            tracing::warn!("NVML init failed or unsupported: {}", e);
        }
    }

    gpus
}

fn get_sysinfo_fallback() -> Vec<GpuInfo> {
    use sysinfo::System;
    let mut sys = System::new_all();
    sys.refresh_all();
    
    let _total_ram_mb = sys.total_memory() / 1024 / 1024;
    let _free_ram_mb = sys.free_memory() / 1024 / 1024;

    #[cfg(target_os = "macos")]
    let name = "Apple Silicon (Unified Memory)";
    #[cfg(not(target_os = "macos"))]
    let name = "Unknown GPU / Fallback CPU";

    #[cfg(target_os = "macos")]
    let (vram_mb, vram_available_mb) = (
        (_total_ram_mb as f64 * 0.7) as u64,
        (_free_ram_mb as f64 * 0.7) as u64,
    );
    #[cfg(not(target_os = "macos"))]
    let (vram_mb, vram_available_mb) = (0, 0);

    vec![GpuInfo {
        name: name.to_string(),
        vendor: if cfg!(target_os = "macos") { GpuVendor::Apple } else { GpuVendor::Unknown },
        vram_mb,
        vram_available_mb,
        compute_capability: None,
        max_power_limit_w: 0,
        pcie_gen: 0,
        nvlink: false,
    }]
}
