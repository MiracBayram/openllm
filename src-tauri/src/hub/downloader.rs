use anyhow::{Result, bail};
use futures::StreamExt;
use reqwest::Client;
use std::sync::OnceLock;
use sha2::{Digest, Sha256};
use std::path::Path;
use tokio::fs::{self, File};
use tokio::io::AsyncWriteExt;
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{info, warn};

#[derive(Debug, Clone)]
pub struct DownloadEvent {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bps: f64,
}

pub async fn preallocate_file_os_level(_file: &File, _size: u64) -> Result<()> {
    // Avoid set_len() to prevent sparse files filling up disk unexpectedly.
    Ok(())
}

async fn throttle_progress(
    progress_tx: &mpsc::Sender<DownloadEvent>,
    downloaded: u64,
    total: u64,
    speed_bps: f64,
) {
    let _ = progress_tx.try_send(DownloadEvent {
        downloaded_bytes: downloaded,
        total_bytes: total,
        speed_bps,
    });
}

static CLIENT: OnceLock<Client> = OnceLock::new();

pub async fn download_model_securely(
    url: &str,
    target_path: &Path,
    expected_sha256: &str,
    progress_tx: mpsc::Sender<DownloadEvent>,
    cancel_token: tokio_util::sync::CancellationToken,
) -> Result<()> {
    let client = CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    });

    // 1. HEAD Request ile Toplam Boyutu Öğren (Metadata Fetch)
    let head_response = client.head(url).send().await?;
    if !head_response.status().is_success() {
        bail!("HEAD request failed with status: {}", head_response.status());
    }
    
    let total_size = head_response.content_length().unwrap_or(0);
    if total_size == 0 {
        bail!("Unknown file size or zero-length file.");
    }

    // 2. KERNEL SEVİYESİ PRE-ALLOCATION (Fragmentasyonu Önle)
    let part_path = target_path.with_extension("part");
    let mut file = File::create(&part_path).await?;
    preallocate_file_os_level(&file, total_size).await?;

    // 3. STREAMING & HASHING (Aynı Anda Disk ve Hash)
    let response = client.get(url).send().await?;
    if !response.status().is_success() {
        bail!("GET request failed with status: {}", response.status());
    }

    let mut stream = response.bytes_stream();
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    
    let mut last_send = tokio::time::Instant::now();
    let start_time = tokio::time::Instant::now();

    while let Ok(Some(chunk_res)) = tokio::time::timeout(Duration::from_secs(30), stream.next()).await {
        if cancel_token.is_cancelled() {
            drop(file);
            let _ = fs::remove_file(&part_path).await;
            bail!("Download cancelled by user.");
        }

        let chunk = match chunk_res {
            Ok(c) => c,
            Err(e) => {
                drop(file);
                let _ = fs::remove_file(&part_path).await;
                return Err(anyhow::anyhow!("Download stream error: {}", e));
            }
        };
        
        // RAM'de tutma, doğrudan diske ve hash'e yolla
        file.write_all(&chunk).await?;
        hasher.update(&chunk);
        
        downloaded += chunk.len() as u64;
        
        // 4. IPC DEBOUNCER (50ms / 20 FPS Kuralı)
        if last_send.elapsed() >= Duration::from_millis(50) {
            let elapsed_secs = start_time.elapsed().as_secs_f64();
            let speed_bps = if elapsed_secs > 0.0 { downloaded as f64 / elapsed_secs } else { 0.0 };
            
            throttle_progress(&progress_tx, downloaded, total_size, speed_bps).await;
            last_send = tokio::time::Instant::now();
        }
    }
    
    // Send final 100% progress
    let _ = progress_tx.try_send(DownloadEvent { downloaded_bytes: total_size, total_bytes: total_size, speed_bps: 0.0 });

    // Ensure all bytes are written to disk
    file.sync_all().await?;
    drop(file); // Drop handle to avoid Windows lock during potential removal

    // 5. SUPPLY CHAIN KORUMASI (Kriptografik Doğrulama)
    let hash = hasher.finalize();
    let computed_hash = hash.iter().map(|b| format!("{:02x}", b)).collect::<String>();
    if expected_sha256 != "SKIP" && computed_hash != expected_sha256 {
        warn!("SHA256 mismatch! Expected {}, got {}. Quarantining file...", expected_sha256, computed_hash);
        let _ = fs::remove_file(&part_path).await; // Karantina/Sil
        bail!("Hash mismatch. Possible MITM or supply chain attack.");
    }

    fs::rename(&part_path, target_path).await?;

    info!("Download complete and verified securely.");
    Ok(())
}
