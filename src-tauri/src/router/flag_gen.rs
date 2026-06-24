use std::collections::HashMap;
use crate::profiler::{HardwareProfile, CpuInfo};
use crate::router::ModelInfo;

pub struct FlagContext<'a> {
    pub profile: &'a HardwareProfile,
    pub model: &'a ModelInfo,
    pub engine_name: &'a str,
}

pub trait FlagStrategy: Send + Sync {
    fn engine_id(&self) -> &'static str;
    
    fn build_flags(&self, ctx: &FlagContext) -> Vec<String>;
    
    fn build_envs(&self, ctx: &FlagContext) -> HashMap<String, String>;
    
    fn build_pre_wrapper(&self, ctx: &FlagContext) -> Vec<String>;
}

// Common heuristics used by strategies
pub fn detect_optimal_threads_and_mask(cpu: &CpuInfo, _model_size_mb: u64) -> (u32, String) {
    // 1. Thread count
    // Often physical cores is the best for threads. 
    // If it's a huge Intel CPU with E-cores (e.g. 13900K has 24 physical, 32 logical)
    // We approximate P-cores. If logical < physical * 2, it has E-cores.
    // For simplicity: thread count = physical cores.
    let threads = cpu.physical_cores;
    
    // 2. CPU Mask
    // Pinning to cores 0..threads
    let mask_max = (1u64 << threads) - 1;
    let mask_hex = format!("{:x}", mask_max);
    
    (threads.max(1), mask_hex)
}

pub fn build_numa_wrapper(cpu: &CpuInfo) -> Vec<String> {
    #[allow(unused_mut)]
    let mut wrapper = Vec::new();
    if cpu.numa_nodes > 1 {
        // Simple numa interleave
        #[cfg(target_os = "linux")]
        {
            wrapper.push("numactl".into());
            wrapper.push("--interleave=all".into());
        }
    }
    wrapper
}

pub fn build_affinity_wrapper(cpu: &CpuInfo) -> Vec<String> {
    #[allow(unused_mut)]
    let mut wrapper = Vec::new();
    #[allow(unused_variables)]
    let (threads, _) = detect_optimal_threads_and_mask(cpu, 0);
    
    #[cfg(target_os = "linux")]
    {
        wrapper.push("taskset".into());
        wrapper.push("-c".into());
        wrapper.push(format!("0-{}", threads.saturating_sub(1)));
    }
    
    // Windows support via cmd /C start /affinity
    #[cfg(target_os = "windows")]
    {
        // Not wrapping directly via command because Windows start requires a separate shell, 
        // which complicates child process killing. We will rely on llama.cpp's internal thread pinning
        // if possible, or just skip wrapper on Windows for now to ensure graceful shutdown.
    }
    
    wrapper
}

pub struct GenericFlagStrategy;

impl FlagStrategy for GenericFlagStrategy {
    fn engine_id(&self) -> &'static str {
        "generic"
    }

    fn build_flags(&self, ctx: &FlagContext) -> Vec<String> {
        let mut flags = vec!["--model".to_string(), ctx.model.path.clone()];
        let cpu = &ctx.profile.cpu;
        
        let ctx_size = (ctx.profile.memory.available_mb / 4).clamp(1024, 32768);
        flags.push("--ctx-size".to_string());
        flags.push(ctx_size.to_string());
        
        // GPU Layers
        if !ctx.profile.gpus.is_empty() {
            let safe_vram_mb = (ctx.profile.gpus[0].vram_available_mb as f32 * 0.9) as u64;
            let bytes_per_layer = (ctx.model.size_mb * 1024 * 1024)
                .checked_div(ctx.model.layer_count as u64)
                .unwrap_or(1);
            let gpu_layers = (safe_vram_mb * 1024 * 1024 / bytes_per_layer).min(ctx.model.layer_count as u64);
            
            flags.push("--n-gpu-layers".to_string());
            flags.push(gpu_layers.to_string());

            if let Some((major, _)) = ctx.profile.gpus[0].compute_capability {
                if major >= 8 {
                    flags.push("--flash-attn".to_string());
                }
            }
        } else {
            flags.push("--n-gpu-layers".to_string());
            flags.push("0".to_string());
        }

        let (threads, cpu_mask) = detect_optimal_threads_and_mask(cpu, ctx.model.size_mb);
        flags.push("--threads".to_string());
        flags.push(threads.to_string());
        
        if ctx.engine_name == "llama.cpp" {
            // llama.cpp supports --cpu-mask
            flags.push("--cpu-mask".to_string());
            flags.push(format!("0x{}", cpu_mask));
            
            // PRIO
            flags.push("--prio".to_string());
            flags.push("2".to_string()); // high priority
        }

        if cpu.features.avx512f {
            if ctx.profile.memory.available_mb > ctx.model.size_mb * 12 / 10 {
                flags.push("--mlock".to_string());
            }
            
            // If AVX-512 BF16 (Sapphire Rapids) or AMX, force K-cache to bf16
            if cpu.features.amx_bf16 || cpu.features.avx512_vnni {
                flags.push("-ctk".to_string()); flags.push("bf16".to_string());
                flags.push("-ctv".to_string()); flags.push("bf16".to_string());
            } else {
                flags.push("-ctk".to_string()); flags.push("q8_0".to_string());
                flags.push("-ctv".to_string()); flags.push("q8_0".to_string());
            }
        } else if cpu.features.apple_amx {
            // Apple Silicon
            flags.push("-ctk".to_string()); flags.push("q8_0".to_string());
            flags.push("-ctv".to_string()); flags.push("q8_0".to_string());
        } else {
            // Check VRAM / RAM ratio for B3 (KV Cache quantization)
            let is_vram_constrained = ctx.profile.gpus.iter().map(|g| g.vram_available_mb).sum::<u64>() < ctx.model.size_mb;
            if is_vram_constrained {
                flags.push("-ctk".to_string()); flags.push("q8_0".to_string());
                flags.push("-ctv".to_string()); flags.push("q8_0".to_string());
            }
        }

        if ctx.engine_name == "llama.cpp" {
            // B2 (NUMA support)
            if cpu.numa_nodes > 1 {
                flags.push("--numa".to_string());
                flags.push("distribute".to_string());
            }
            // B4 (Batch Auto-tune)
            // For fast prompt processing, use larger batches if VRAM/RAM permits
            let batch_size = if ctx.profile.memory.available_mb > 16000 { "2048" } else { "512" };
            flags.push("--batch-size".to_string());
            flags.push(batch_size.to_string());
            flags.push("--ubatch-size".to_string());
            flags.push(batch_size.to_string());
        }

        flags.push("--log-disable".to_string());
        flags
    }

    fn build_envs(&self, _ctx: &FlagContext) -> HashMap<String, String> {
        let mut envs = HashMap::new();
        // OpenMP Pinning just in case
        envs.insert("OMP_PROC_BIND".to_string(), "close".to_string());
        envs.insert("OMP_PLACES".to_string(), "cores".to_string());
        
        #[cfg(target_os = "linux")]
        {
            // Jemalloc tuning
            envs.insert("MALLOC_CONF".to_string(), "dirty_decay_ms:0,muzzy_decay_ms:0".to_string());
        }
        
        envs
    }

    fn build_pre_wrapper(&self, ctx: &FlagContext) -> Vec<String> {
        let mut wrapper = Vec::new();
        
        // Priority
        #[cfg(target_os = "linux")]
        {
            wrapper.push("nice".into());
            wrapper.push("-n".into());
            wrapper.push("-10".into());
        }
        
        // NUMA
        wrapper.extend(build_numa_wrapper(&ctx.profile.cpu));
        
        // Taskset
        if wrapper.is_empty() { // If we didn't use numactl, we can use taskset
            wrapper.extend(build_affinity_wrapper(&ctx.profile.cpu));
        }
        
        wrapper
    }
}

pub fn get_strategy(_engine_name: &str) -> Box<dyn FlagStrategy> {
    // Future proof: return different strategies for vLLM, LMDeploy, etc.
    Box::new(GenericFlagStrategy)
}
