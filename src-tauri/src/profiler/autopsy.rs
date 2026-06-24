use memmap2::MmapOptions;
use std::fs::File;
use std::path::Path;
use serde::Serialize;
use rand::Rng;

#[derive(Serialize)]
pub struct TensorScanEvent {
    pub bytes: Vec<u8>,
    pub entropy: f32,
    pub block_index: usize,
}

pub struct AutopsySession {
    mmap: memmap2::Mmap,
    pub file_size: usize,
    current_block: usize,
}

impl AutopsySession {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self, String> {
        let file = File::open(path).map_err(|e| e.to_string())?;
        let mmap = unsafe { MmapOptions::new().map(&file).map_err(|e| e.to_string())? };
        let file_size = mmap.len();
        
        Ok(Self {
            mmap,
            file_size,
            current_block: 0,
        })
    }

    pub fn sample_bytes(&mut self, sample_size: usize) -> TensorScanEvent {
        // Start roughly after 10MB to skip metadata
        let metadata_offset = 10_000_000.min(self.file_size / 10);
        let active_region = self.file_size.saturating_sub(metadata_offset);
        
        if active_region < sample_size {
            // File too small, just return zeros
            return TensorScanEvent {
                bytes: vec![0; sample_size],
                entropy: 0.0,
                block_index: 0,
            };
        }

        // Simulate scanning through the file
        let mut rng = rand::thread_rng();
        // Jump forward randomly, or loop back
        self.current_block = (self.current_block + rng.gen_range(1..100) * sample_size) % active_region;
        let start = metadata_offset + self.current_block;
        let end = (start + sample_size).min(self.file_size);

        let slice = &self.mmap[start..end];
        let mut bytes = vec![0u8; sample_size];
        
        // Downsample: instead of copying contiguous bytes, copy every Nth byte 
        // to get a "broader" picture of the block, or just take it as is.
        // We'll just take it as is for raw density.
        bytes[..slice.len()].copy_from_slice(slice);

        // Calculate a rough entropy/magnitude score
        let mut sum = 0u64;
        for &b in &bytes {
            sum += b as u64;
        }
        let avg = sum as f32 / bytes.len() as f32;
        let entropy = avg / 255.0; // 0.0 to 1.0 roughly

        TensorScanEvent {
            bytes,
            entropy,
            block_index: self.current_block,
        }
    }
}
