use std::path::PathBuf;
use tokio::net::{UnixListener, UnixStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::broadcast;
use tokio::sync::broadcast::error::RecvError;

pub const PULSE_CHANNEL: u8 = 0x01;
pub const TOKEN_CHANNEL: u8 = 0x02;
pub const ANOMALY_CHANNEL: u8 = 0x03;
pub const CLUSTER_CHANNEL: u8 = 0x04;
pub const PIPELINE_CHANNEL: u8 = 0x05;
pub const HEARTBEAT: u8 = 0xFF;

#[derive(Clone)]
pub struct BinaryIpcBus {
    pub tx: broadcast::Sender<Vec<u8>>,
    pub socket_path: PathBuf,
}

impl BinaryIpcBus {
    pub async fn start(socket_path: PathBuf) -> std::io::Result<std::sync::Arc<Self>> {
        let _ = std::fs::remove_file(&socket_path);
        let listener = UnixListener::bind(&socket_path)?;
        let (tx, _rx) = broadcast::channel::<Vec<u8>>(4096);

        let tx_clone = tx.clone();
        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((stream, _)) => {
                        let tx = tx_clone.clone();
                        tokio::spawn(serve_client(stream, tx));
                    }
                    Err(_) => continue,
                }
            }
        });

        // Heartbeat task — 1Hz
        let tx_hb = tx.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
            let mut seq: u16 = 0;
            loop {
                interval.tick().await;
                seq = seq.wrapping_add(1);
                let frame = build_frame(HEARTBEAT, 0x01, seq, &[]);
                let _ = tx_hb.send(frame);
            }
        });

        Ok(std::sync::Arc::new(Self { tx, socket_path }))
    }

    pub fn broadcast_pulse(&self, seq: u16, payload: &[u8]) {
        let frame = build_frame(PULSE_CHANNEL, 0x01, seq, payload);
        let _ = self.tx.send(frame);
    }
    pub fn broadcast_token(&self, seq: u16, payload: &[u8]) {
        let frame = build_frame(TOKEN_CHANNEL, 0x01, seq, payload);
        let _ = self.tx.send(frame);
    }
    pub fn broadcast_thermal(&self, seq: u16, payload: &[u8]) {
        let frame = build_frame(PULSE_CHANNEL, 0x02, seq, payload);
        let _ = self.tx.send(frame);
    }
    pub fn broadcast_vram_matrix(&self, seq: u16, payload: &[u8]) {
        let frame = build_frame(PULSE_CHANNEL, 0x03, seq, payload);
        let _ = self.tx.send(frame);
    }
    pub fn broadcast_anomaly(&self, seq: u16, payload: &[u8]) {
        let frame = build_frame(ANOMALY_CHANNEL, 0x01, seq, payload);
        let _ = self.tx.send(frame);
    }
}

async fn serve_client(stream: UnixStream, tx: broadcast::Sender<Vec<u8>>) {
    let mut rx = tx.subscribe();
    let (mut read_half, mut write_half) = stream.into_split();
    let writer = tokio::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(frame) => {
                    if write_half.write_all(&frame).await.is_err() { return; }
                }
                Err(RecvError::Lagged(_)) => continue,
                Err(_) => return,
            }
        }
    });
    let mut cmd = [0u8; 1];
    loop {
        match read_half.read_exact(&mut cmd).await {
            Ok(_) => {}
            Err(_) => break,
        }
    }
    writer.abort();
}

#[inline]
fn build_frame(channel_id: u8, frame_type: u8, seq: u16, payload: &[u8]) -> Vec<u8> {
    let mut frame = Vec::with_capacity(8 + payload.len());
    frame.push(channel_id);
    frame.push(frame_type);
    frame.extend_from_slice(&seq.to_be_bytes());
    frame.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    frame.extend_from_slice(payload);
    frame
}
