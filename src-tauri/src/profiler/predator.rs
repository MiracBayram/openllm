use serde::{Deserialize, Serialize};
use sysinfo::ProcessRefreshKind;
use crate::profiler::SYSINFO;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PredationEvent {
    pub pid: u32,
    pub name: String,
    pub memory_kb: u64,
    pub cpu_usage: f32,
    pub action_taken: String,
}

/// Identifies the most resource-heavy process (other than ourselves)
/// and artificially throttles it to free up OS resources.
pub fn rank_and_throttle_hogs() -> Option<PredationEvent> {
    let mut sys_lock = SYSINFO.get_or_init(|| {
        std::sync::Mutex::new(sysinfo::System::new())
    }).lock().ok()?;
    
    // Refresh ONLY processes memory and CPU
    sys_lock.refresh_processes_specifics(
        sysinfo::ProcessesToUpdate::All,
        ProcessRefreshKind::new().with_memory().with_cpu(),
    );

    let my_pid = sysinfo::get_current_pid().ok()?;
    
    // Find highest memory/cpu consumer that is NOT us
    let mut hogs = sys_lock.processes().iter()
        .filter(|(&pid, _)| pid != my_pid)
        .collect::<Vec<_>>();
    
    // Sort by memory usage descending (or CPU)
    hogs.sort_by(|a, b| b.1.memory().cmp(&a.1.memory()));
    
    let (target_pid, target_process) = hogs.first()?;
    
    let pid_u32 = target_pid.as_u32();
    let name = target_process.name().to_string_lossy().into_owned();
    let memory_kb = target_process.memory();
    let cpu_usage = target_process.cpu_usage();

    // Only attack if it's taking significant memory (>500MB) or CPU
    if memory_kb < 500_000 && cpu_usage < 10.0 {
        return None;
    }

    let mut action_taken = "Ranked (No action)".to_string();

    #[cfg(target_os = "linux")]
    {
        use nix::sched::{sched_setaffinity, CpuSet};
        use nix::unistd::Pid as NixPid;

        let mut cpuset = CpuSet::new();
        // Pin to a single CPU core (core 0)
        let _ = cpuset.set(0);
        
        let nix_pid = NixPid::from_raw(pid_u32 as i32);
        if sched_setaffinity(nix_pid, &cpuset).is_ok() {
            action_taken = "Pinned to Core 0".to_string();
        } else {
            action_taken = "Failed to pin (Permission?)".to_string();
        }
    }

    #[cfg(target_os = "windows")]
    {
        use windows::Win32::System::Threading::{OpenProcess, SetPriorityClass, IDLE_PRIORITY_CLASS, PROCESS_SET_INFORMATION};
        use windows::Win32::Foundation::CloseHandle;
        unsafe {
            if let Ok(handle) = OpenProcess(PROCESS_SET_INFORMATION, false, pid_u32) {
                let _ = SetPriorityClass(handle, IDLE_PRIORITY_CLASS);
                let _ = CloseHandle(handle);
                action_taken = "Lowered priority class to IDLE".to_string();
            } else {
                action_taken = "Failed to lower priority (Access Denied)".to_string();
            }
        }
    }

    Some(PredationEvent {
        pid: pid_u32,
        name,
        memory_kb,
        cpu_usage,
        action_taken,
    })
}
