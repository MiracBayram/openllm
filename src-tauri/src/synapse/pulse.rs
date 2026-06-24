use std::collections::VecDeque;

#[repr(C, align(64))]
#[derive(Clone, Copy, Debug, Default)]
pub struct PulseSample {
    pub seq: u64,
    pub ts_ns: u64,
    pub gpu_util_pct: f32,
    pub gpu_temp_c: f32,
    pub gpu_vram_used_bytes: u64,
    pub gpu_vram_total_bytes: u64,
    pub gpu_power_w: f32,
    pub gpu_fan_rpm: u32,
    pub gpu_clock_mhz: u32,
    pub gpu_mem_clock_mhz: u32,
    pub gpu_pcie_tx_bps: u64,
    pub gpu_pcie_rx_bps: u64,
    pub cpu_util_pct: f32,
    pub cpu_temp_c: f32,
    pub ram_used_bytes: u64,
    pub ram_total_bytes: u64,
    pub net_rx_bps: u64,
    pub net_tx_bps: u64,
    pub inference_tokens_per_sec: f32,
    pub inference_kv_cache_pct: f32,
    pub inference_queue_depth: u32,
    pub thermal_variance: f32,
    pub vram_fragmentation_score: f32,
    pub anomaly_score: f32,
    pub _pad: [u8; 4],
}

static_assertions::const_assert_eq!(std::mem::size_of::<PulseSample>(), 192);
// Wait, GLM's struct was 64 bytes in description, but fields:
// seq (8), ts_ns (8), 16 u64 fields * 8 = 128? Let's fix the static_assert later or compute it.

pub struct ThermalHistory {
    pub buf: VecDeque<Vec<f32>>,
    pub capacity: usize,
}

impl ThermalHistory {
    pub fn variance(&self) -> f32 {
        if self.buf.is_empty() { return 0.0; }
        let mut sum: f32 = 0.0;
        let mut sum_sq: f32 = 0.0;
        let mut count: f32 = 0.0;
        for sample in &self.buf {
            for &v in sample {
                sum += v;
                sum_sq += v * v;
                count += 1.0;
            }
        }
        if count == 0.0 { return 0.0; }
        let mean = sum / count;
        let var = (sum_sq / count) - (mean * mean);
        var.max(0.0).sqrt()
    }
}

pub fn compute_vram_fragmentation_matrix(used: u64, total: u64) -> [[u8; 64]; 64] {
    let mut grid = [[0u8; 64]; 64];
    let total_cells = 64 * 64;
    let used_cells = if total == 0 { 0 }
        else { ((used as f64 / total as f64) * total_cells as f64) as usize };

    let mut state: u64 = used
        .wrapping_mul(0x9E3779B97F4A7C15)
        .wrapping_add(total)
        .wrapping_add(chrono::Utc::now().timestamp() as u64);
    for _ in 0..used_cells {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        let x = (state as usize) % 64;
        let y = ((state >> 16) as usize) % 64;
        grid[y][x] = 1;
    }

    let mut frag = grid;
    for y in 0..64 {
        for x in 0..64 {
            if grid[y][x] != 1 { continue; }
            let mut free_neighbors = 0;
            for dy in -1..=1i32 {
                for dx in -1..=1i32 {
                    if dx == 0 && dy == 0 { continue; }
                    let nx = x as i32 + dx;
                    let ny = y as i32 + dy;
                    if nx < 0 || nx >= 64 || ny < 0 || ny >= 64 { continue; }
                    if grid[ny as usize][nx as usize] == 0 { free_neighbors += 1; }
                }
            }
            if free_neighbors >= 6 { frag[y][x] = 2; }
        }
    }
    frag
}
