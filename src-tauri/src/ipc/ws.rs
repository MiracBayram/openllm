use std::path::PathBuf;
use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::IntoResponse,
    routing::get,
    Router, Extension,
};
use tokio::sync::broadcast;
use std::sync::Arc;

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
    pub port: u16,
}

impl BinaryIpcBus {
    pub async fn start(socket_path: PathBuf) -> std::io::Result<Arc<Self>> {
        let (tx, _rx) = broadcast::channel::<Vec<u8>>(4096);
        let tx_clone = tx.clone();
        
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

        let app = Router::new()
            .route("/", get(ws_handler))
            .layer(Extension(tx_clone));

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let port = listener.local_addr()?.port();
        
        // Write port to socket_path for frontend discovery
        let _ = std::fs::write(&socket_path, port.to_string());

        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });

        Ok(Arc::new(Self { tx, socket_path, port }))
    }

    pub fn broadcast_pulse(&self, seq: u16, payload: &[u8]) {
        let _ = self.tx.send(build_frame(PULSE_CHANNEL, 0x01, seq, payload));
    }
    pub fn broadcast_token(&self, seq: u16, payload: &[u8]) {
        let _ = self.tx.send(build_frame(TOKEN_CHANNEL, 0x01, seq, payload));
    }
    pub fn broadcast_thermal(&self, seq: u16, payload: &[u8]) {
        let _ = self.tx.send(build_frame(PULSE_CHANNEL, 0x02, seq, payload));
    }
    pub fn broadcast_vram_matrix(&self, seq: u16, payload: &[u8]) {
        let _ = self.tx.send(build_frame(PULSE_CHANNEL, 0x03, seq, payload));
    }
    pub fn broadcast_anomaly(&self, seq: u16, payload: &[u8]) {
        let _ = self.tx.send(build_frame(ANOMALY_CHANNEL, 0x01, seq, payload));
    }
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    Extension(tx): Extension<broadcast::Sender<Vec<u8>>>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_socket(socket, tx))
}

async fn handle_socket(mut socket: WebSocket, tx: broadcast::Sender<Vec<u8>>) {
    let mut rx = tx.subscribe();
    loop {
        tokio::select! {
            msg = rx.recv() => {
                match msg {
                    Ok(frame) => {
                        if socket.send(Message::Binary(frame.into())).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(_) => break,
                }
            }
            client_msg = socket.recv() => {
                if client_msg.is_none() {
                    break;
                }
            }
        }
    }
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
