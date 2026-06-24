use std::path::PathBuf;
use std::process::Stdio;
use tokio::process::Command;
use crate::engines::EngineError;

pub struct EngineHandle {
    pub pid: u32,
    pub stop_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

impl EngineHandle {
    pub async fn stop(&mut self) {
        if let Some(tx) = self.stop_tx.take() {
            let _ = tx.send(());
        }
    }
}

impl Drop for EngineHandle {
    fn drop(&mut self) {
        if let Some(tx) = self.stop_tx.take() {
            tracing::info!("EngineHandle dropped, sending kill signal to PID {}", self.pid);
            let _ = tx.send(());
        }
    }
}

pub struct SpawnOptions {
    pub binary_path: PathBuf,
    pub flags: Vec<String>,
    pub envs: std::collections::HashMap<String, String>,
    pub pre_wrapper: Vec<String>, // e.g. ["taskset", "-c", "0-7"]
}

pub async fn spawn_engine(
    opts: SpawnOptions,
) -> Result<(EngineHandle, tokio::process::ChildStdout, tokio::process::ChildStderr), EngineError> {
    let mut cmd = if opts.pre_wrapper.is_empty() {
        Command::new(&opts.binary_path)
    } else {
        let mut c = Command::new(&opts.pre_wrapper[0]);
        for arg in opts.pre_wrapper.iter().skip(1) {
            c.arg(arg);
        }
        c.arg(&opts.binary_path);
        c
    };

    cmd.args(&opts.flags)
        .envs(&opts.envs)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);

    #[cfg(unix)]
    {
        cmd.process_group(0);
    }
    
    #[cfg(target_os = "linux")]
    {
        // Already imported or not needed
        unsafe {
            cmd.pre_exec(|| {
                let _ = libc::prctl(libc::PR_SET_PDEATHSIG, libc::SIGKILL);
                if libc::getppid() == 1 {
                    return Err(std::io::Error::new(std::io::ErrorKind::Other, "parent already dead"));
                }
                Ok(())
            });
        }
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| EngineError::SpawnFailed(e.to_string()))?;

    let pid = child
        .id()
        .ok_or_else(|| EngineError::SpawnFailed("PID alınamadı".into()))?;

    #[cfg(target_os = "linux")]
    {
        // CPU affinity: sabitle P-cores (0-3)
        let mut cpu_set = nix::sched::CpuSet::new();
        for cpu in 0..4 {
            let _ = cpu_set.set(cpu);
        }
        let _ = nix::sched::sched_setaffinity(nix::unistd::Pid::from_raw(pid as i32), &cpu_set);
        // OOM koruması
        let oom_path = format!("/proc/{}/oom_score_adj", pid);
        let _ = std::fs::write(&oom_path, "-500");
    }
        
    let stdout = child.stdout.take().expect("stdout piped");
    let stderr = child.stderr.take().expect("stderr piped");

    let (stop_tx, stop_rx) = tokio::sync::oneshot::channel::<()>();

    #[cfg(windows)]
    let job_handle = unsafe {
        use windows::Win32::Foundation::{CloseHandle, HANDLE};
        use windows::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };
        use windows::Win32::System::Threading::{OpenProcess, PROCESS_SET_QUOTA, PROCESS_TERMINATE};

        let job = CreateJobObjectW(None, None).unwrap_or(HANDLE::default());
        if !job.is_invalid() {
            let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let _ = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const std::ffi::c_void,
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            );

            if let Ok(process_handle) = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, false, pid) {
                let _ = AssignProcessToJobObject(job, process_handle);
                let _ = CloseHandle(process_handle);
            }
        }
        job
    };

    tokio::spawn(async move {
        tokio::select! {
            _ = child.wait() => {}
            _ = stop_rx => {
                #[cfg(unix)]
                {
                    let _ = nix::sys::signal::killpg(
                        nix::unistd::Pid::from_raw(pid as i32),
                        nix::sys::signal::Signal::SIGTERM,
                    );
                }
                #[cfg(windows)]
                { 
                    let _ = child.kill().await; 
                }

                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                let _ = child.kill().await;
            }
        }
        
        #[cfg(windows)]
        unsafe {
            use windows::Win32::Foundation::{CloseHandle, HANDLE};
            if !job_handle.is_invalid() {
                let _ = CloseHandle(job_handle);
            }
        }
    });

    Ok((EngineHandle { pid, stop_tx: Some(stop_tx) }, stdout, stderr))
}
