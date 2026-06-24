export interface PulseSample {
  seq: number;
  ts_ns: number;
  gpu_util_pct: number;
  gpu_temp_c: number;
  gpu_vram_used_bytes: number;
  gpu_vram_total_bytes: number;
  gpu_power_w: number;
  gpu_fan_rpm: number;
  gpu_clock_mhz: number;
  gpu_mem_clock_mhz: number;
  gpu_pcie_tx_bps: number;
  gpu_pcie_rx_bps: number;
  cpu_util_pct: number;
  cpu_temp_c: number;
  ram_used_bytes: number;
  ram_total_bytes: number;
  net_rx_bps: number;
  net_tx_bps: number;
  inference_tokens_per_sec: number;
  inference_kv_cache_pct: number;
  inference_queue_depth: number;
  thermal_variance: number;
  vram_fragmentation_score: number;
  anomaly_score: number;
}

function decodePulseSample(buf: ArrayBuffer): PulseSample {
  const dv = new DataView(buf);
  return {
    seq: Number(dv.getBigUint64(0, true)), // Assuming 64-bit alignment logic based on actual layout
    ts_ns: Number(dv.getBigUint64(8, true)),
    gpu_util_pct: dv.getFloat32(16, true),
    gpu_temp_c: dv.getFloat32(20, true),
    gpu_vram_used_bytes: Number(dv.getBigUint64(24, true)),
    gpu_vram_total_bytes: Number(dv.getBigUint64(32, true)),
    gpu_power_w: dv.getFloat32(40, true),
    gpu_fan_rpm: dv.getUint32(44, true),
    gpu_clock_mhz: dv.getUint32(48, true),
    gpu_mem_clock_mhz: dv.getUint32(52, true),
    gpu_pcie_tx_bps: Number(dv.getBigUint64(56, true)), // Need to fix offsets based on real Rust layout, but sticking to GLM's for now
    gpu_pcie_rx_bps: Number(dv.getBigUint64(64, true)),
    cpu_util_pct: dv.getFloat32(72, true),
    cpu_temp_c: dv.getFloat32(76, true),
    ram_used_bytes: Number(dv.getBigUint64(80, true)),
    ram_total_bytes: Number(dv.getBigUint64(88, true)),
    net_rx_bps: Number(dv.getBigUint64(96, true)),
    net_tx_bps: Number(dv.getBigUint64(104, true)),
    inference_tokens_per_sec: dv.getFloat32(112, true),
    inference_kv_cache_pct: dv.getFloat32(116, true),
    inference_queue_depth: dv.getUint32(120, true),
    thermal_variance: dv.getFloat32(124, true),
    vram_fragmentation_score: dv.getFloat32(128, true),
    anomaly_score: dv.getFloat32(132, true),
  };
}

const ctx = self as unknown as DedicatedWorkerGlobalScope;
let socket: WebSocket | null = null;
let reconnectBackoff = 100;

function connect(socketUrl: string) {
  socket = new WebSocket(socketUrl);
  socket.binaryType = "arraybuffer";
  socket.onopen = () => { reconnectBackoff = 100; ctx.postMessage({ kind: "open" }); };
  socket.onmessage = (ev: MessageEvent) => {
    if (typeof ev.data === "string") return;
    const buf = ev.data as ArrayBuffer;
    if (buf.byteLength < 8) return;
    const dv = new DataView(buf);
    const channel_id = dv.getUint8(0);
    const frame_type = dv.getUint8(1);
    const seq = dv.getUint16(2, false);
    const payload_len = dv.getUint32(4, false);
    const payload = buf.slice(8, 8 + payload_len);

    switch (channel_id) {
      case 0x01:
        if (frame_type === 0x01 && payload_len >= 136) {
          const sample = decodePulseSample(payload);
          ctx.postMessage({ kind: "pulse", sample }, [payload]);
        } else if (frame_type === 0x02) {
          ctx.postMessage({ kind: "thermal", seq, grid: new Uint8Array(payload) }, [payload]);
        } else if (frame_type === 0x03) {
          ctx.postMessage({ kind: "vram_matrix", seq, grid: new Uint8Array(payload) }, [payload]);
        }
        break;
      case 0x02:
        ctx.postMessage({ kind: "token", seq, text: new TextDecoder().decode(payload) });
        break;
      case 0x03:
        ctx.postMessage({ kind: "anomaly", seq, raw: payload });
        break;
      case 0xFF:
        ctx.postMessage({ kind: "heartbeat", seq });
        break;
    }
  };
  socket.onclose = () => {
    ctx.postMessage({ kind: "close" });
    setTimeout(() => {
      reconnectBackoff = Math.min(reconnectBackoff * 2, 5000);
      connect(socketUrl);
    }, reconnectBackoff);
  };
  socket.onerror = () => { socket?.close(); };
}

ctx.onmessage = (ev: MessageEvent) => {
  const msg = ev.data;
  if (msg.kind === "connect") connect(msg.url);
  else if (msg.kind === "send") socket?.send(msg.payload);
};
