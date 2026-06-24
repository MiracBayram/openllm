use std::fs::OpenOptions;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use memmap2::{MmapMut, MmapOptions};

pub const RING_CAPACITY: usize = 4 * 1024 * 1024;
pub const SLOT_SIZE: usize = 128;

#[repr(C, align(64))]
pub struct RingHeader {
    pub head: AtomicU64,
    pub tail: AtomicU64,
    pub seq: AtomicU64,
    pub _pad: [u8; 40],
}

pub struct TokenRing {
    mmap: MmapMut,
    path: PathBuf,
    header: Arc<RingHeader>,
}

impl TokenRing {
    pub fn create(path: PathBuf) -> std::io::Result<Self> {
        let file = OpenOptions::new()
            .read(true).write(true).create(true).truncate(true)
            .open(&path)?;
        file.set_len((RING_CAPACITY + 64) as u64)?;
        let mmap = unsafe { MmapOptions::new().map_mut(&file)? };
        let header_ptr = mmap.as_ptr() as *mut RingHeader;
        unsafe {
            std::ptr::write(header_ptr, RingHeader {
                head: AtomicU64::new(0),
                tail: AtomicU64::new(0),
                seq: AtomicU64::new(0),
                _pad: [0u8; 40],
            });
        }
        let header = Arc::new(unsafe { std::ptr::read(header_ptr) });
        Ok(Self { mmap, path, header })
    }

    #[inline]
    pub fn push(&self, token: &[u8]) -> bool {
        if token.len() > SLOT_SIZE - 8 { return false; }
        let head = self.header.head.load(Ordering::Relaxed);
        let tail = self.header.tail.load(Ordering::Acquire);
        let used = head.wrapping_sub(tail);
        if used >= RING_CAPACITY as u64 { return false; }

        let slot_offset = 64 + ((head as usize % RING_CAPACITY) / SLOT_SIZE) * SLOT_SIZE;
        let slot_ptr = unsafe { self.mmap.as_ptr().add(slot_offset) };

        unsafe {
            std::ptr::copy_nonoverlapping(
                (token.len() as u64).to_le_bytes().as_ptr(), slot_ptr as *mut u8, 8);
            std::ptr::copy_nonoverlapping(token.as_ptr(), slot_ptr.add(8) as *mut u8, token.len());
        }

        self.header.head.store(head.wrapping_add(SLOT_SIZE as u64), Ordering::Release);
        self.header.seq.fetch_add(1, Ordering::Relaxed);
        true
    }

    #[inline]
    pub fn drain_into(&self, out: &mut Vec<&[u8]>) -> u32 {
        let mut count = 0u32;
        let mut tail = self.header.tail.load(Ordering::Relaxed);
        let head = self.header.head.load(Ordering::Acquire);
        while tail < head && out.len() < 256 {
            let slot_offset = 64 + ((tail as usize % RING_CAPACITY) / SLOT_SIZE) * SLOT_SIZE;
            let slot_ptr = unsafe { self.mmap.as_ptr().add(slot_offset) };
            let len = unsafe { std::ptr::read_unaligned(slot_ptr as *const u64) } as usize;
            if len > 0 && len <= SLOT_SIZE - 8 {
                let token = unsafe { std::slice::from_raw_parts(slot_ptr.add(8), len) };
                out.push(token);
                count += 1;
            }
            tail = tail.wrapping_add(SLOT_SIZE as u64);
        }
        self.header.tail.store(tail, Ordering::Release);
        count
    }
}
