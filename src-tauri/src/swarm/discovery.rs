use std::collections::HashMap;
use std::net::{Ipv4Addr, SocketAddr, SocketAddrV4};
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use socket2::{Domain, Protocol, Socket, Type};
use tokio::sync::{mpsc, RwLock};
use uuid::Uuid;
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HwSignature {
    pub node_id: Uuid,
    pub hostname: String,
    pub gpu_name: String,
    pub gpu_vram_total_bytes: u64,
    pub gpu_vram_free_bytes: u64,
    pub cpu_cores: u16,
    pub ram_total_bytes: u64,
    pub ram_free_bytes: u64,
    pub tensor_cores: u32,
    pub fp16_tflops: f32,
    pub bandwidth_gbps: f32,
    pub role: SwarmRole,
    pub ts: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum SwarmRole { Coordinator, Worker, Peer, Idle }

pub const MULTICAST_ADDR: Ipv4Addr = Ipv4Addr::new(239, 5, 2, 5);
pub const MULTICAST_PORT: u16 = 47823;
pub const BEACON_INTERVAL: Duration = Duration::from_millis(1500);
pub const PRESENCE_TIMEOUT: Duration = Duration::from_secs(5);

pub struct SwarmDiscovery {
    pub local: HwSignature,
    pub peers: RwLock<HashMap<Uuid, (HwSignature, Instant)>>,
    pub tx: mpsc::UnboundedSender<HwSignature>,
}

impl SwarmDiscovery {
    pub async fn spawn(local: HwSignature) -> Result<(Self, mpsc::UnboundedReceiver<HwSignature>)> {
        let (tx, rx) = mpsc::unbounded_channel();
        let sock = bind_multicast(Ipv4Addr::UNSPECIFIED, MULTICAST_ADDR, MULTICAST_PORT)?;
        sock.set_multicast_if_v4(&Ipv4Addr::UNSPECIFIED)?;
        sock.set_multicast_ttl_v4(2)?;
        sock.set_multicast_loop_v4(true)?;
        sock.set_nonblocking(true)?;
        let sock = tokio::net::UdpSocket::from_std(sock.into())?;
        let sock_arc = std::sync::Arc::new(sock);

        // Beacon task
        {
            let sock = sock_arc.clone();
            let local = local.clone();
            tokio::spawn(async move {
                let mut interval = tokio::time::interval(BEACON_INTERVAL);
                loop {
                    interval.tick().await;
                    let mut sig = local.clone();
                    sig.ts = chrono::Utc::now().timestamp_millis() as u64;
                    if let Ok(bytes) = postcard::to_allocvec(&sig) {
                        let addr = SocketAddr::V4(SocketAddrV4::new(MULTICAST_ADDR, MULTICAST_PORT));
                        let _ = sock.send_to(&bytes, addr).await;
                    }
                }
            });
        }

        // Listener task
        {
            let sock = sock_arc.clone();
            let tx = tx.clone();
            tokio::spawn(async move {
                let mut buf = vec![0u8; 1024];
                loop {
                    let (n, _) = match sock.recv_from(&mut buf).await {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    if let Ok(sig) = postcard::from_bytes::<HwSignature>(&buf[..n]) {
                        // Normally we would update the peers map here, but RwLock is not easily sent 
                        // to the task if it's part of Self without Arc. The receiver loop can handle it,
                        // or we pass an Arc<RwLock<HashMap>>.
                        let _ = tx.send(sig);
                    }
                }
            });
        }

        Ok((Self { 
            local, 
            peers: RwLock::new(HashMap::new()), 
            tx 
        }, rx))
    }
}

fn bind_multicast(iface: Ipv4Addr, group: Ipv4Addr, port: u16) -> Result<Socket> {
    let sock = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP))?;
    sock.set_reuse_address(true)?;
    #[cfg(unix)]
    sock.set_reuse_port(true)?;
    sock.bind(&SocketAddr::V4(SocketAddrV4::new(iface, port)).into())?;
    sock.join_multicast_v4(&group, &iface)?;
    Ok(sock)
}

pub struct LayerAssignment {
    pub node_id: Uuid,
    pub model_id: String,
    pub layer_start: u32,
    pub layer_end: u32,
    pub weight_blob_url: String,
    pub weight_blob_sha256: [u8; 32],
}

fn capacity(sig: &HwSignature) -> f32 {
    let vram_gb = sig.gpu_vram_free_bytes as f32 / 1_073_741_824.0;
    (sig.fp16_tflops * vram_gb * sig.bandwidth_gbps) / 1000.0
}

pub fn partition_model(
    model_id: &str,
    total_layers: u32,
    workers: &[HwSignature],
    weight_blob_url: &str,
    weight_blob_sha256: [u8; 32],
) -> Vec<LayerAssignment> {
    let mut scored: Vec<(f32, &HwSignature)> = workers.iter()
        .filter(|w| w.role != SwarmRole::Idle)
        .map(|w| (capacity(w), w))
        .collect();
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    let total_cap: f32 = scored.iter().map(|(c, _)| *c).sum();
    if total_cap <= 0.0 || scored.is_empty() { return Vec::new(); }

    let mut assignments = Vec::with_capacity(scored.len());
    let mut cursor = 0u32;
    for (i, (cap, worker)) in scored.iter().enumerate() {
        let share = if i == scored.len() - 1 {
            total_layers - cursor
        } else {
            ((cap / total_cap) * total_layers as f32).floor() as u32
        };
        if share == 0 { continue; }
        let end = cursor + share;
        assignments.push(LayerAssignment {
            node_id: worker.node_id,
            model_id: model_id.to_string(),
            layer_start: cursor,
            layer_end: end,
            weight_blob_url: weight_blob_url.to_string(),
            weight_blob_sha256,
        });
        cursor = end;
    }
    assignments
}
