use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GgufMeta {
    pub architecture: String,
    pub layer_count: u32,
    pub quant_label: String,
    pub file_size_mb: u64,
    pub chat_template: Option<String>,
    pub attention_head_count: u32,
    pub attention_head_count_kv: Option<u32>,
    pub embedding_length: u32,
}

#[derive(Debug, thiserror::Error)]
pub enum GgufError {
    #[error("File could not be read: {0}")]
    Io(#[from] std::io::Error),
    #[error("Invalid magic number: {0:x}")]
    InvalidMagic(u32),
    #[error("Unsupported GGUF version: {0}")]
    UnsupportedVersion(u32),
    #[error("Parse error: {0}")]
    ParseError(String),
}

fn skip_metadata_value<R: Read>(
    reader: &mut R,
    val_type: u32,
) -> Result<(), GgufError> {
    match val_type {
        0 | 1 | 7 => { let mut b = [0u8; 1]; reader.read_exact(&mut b)?; }
        2 | 3 => { let mut b = [0u8; 2]; reader.read_exact(&mut b)?; }
        4..=6 => { let mut b = [0u8; 4]; reader.read_exact(&mut b)?; }
        8 => {
            let mut b = [0u8; 8]; reader.read_exact(&mut b)?;
            let len = u64::from_le_bytes(b);
            if len > 1024 * 1024 * 50 { return Err(GgufError::ParseError("String length exceeds 50MB safety limit".into())); }
            let mut sbytes = vec![0u8; len as usize];
            reader.read_exact(&mut sbytes)?;
        }
        9 => {
            let mut b = [0u8; 4]; reader.read_exact(&mut b)?;
            let arr_type = u32::from_le_bytes(b);
            let mut b2 = [0u8; 8]; reader.read_exact(&mut b2)?;
            let arr_len = u64::from_le_bytes(b2);
            if arr_len > 1_000_000 { return Err(GgufError::ParseError("Array length exceeds safety limit".into())); }
            for _ in 0..arr_len { skip_metadata_value(reader, arr_type)?; }
        }
        10 | 11 => { let mut b = [0u8; 8]; reader.read_exact(&mut b)?; }
        12 => {
            let mut b = [0u8; 8]; reader.read_exact(&mut b)?;
            let map_len = u64::from_le_bytes(b);
            if map_len > 1_000_000 { return Err(GgufError::ParseError("Map length exceeds safety limit".into())); }
            for _ in 0..map_len {
                let mut b2 = [0u8; 8]; reader.read_exact(&mut b2)?;
                let key_len = u64::from_le_bytes(b2);
                if key_len > 1024 { return Err(GgufError::ParseError("Map key length exceeds 1KB safety limit".into())); }
                let mut key_bytes = vec![0u8; key_len as usize];
                reader.read_exact(&mut key_bytes)?;
                let mut b3 = [0u8; 4]; reader.read_exact(&mut b3)?;
                let val_type = u32::from_le_bytes(b3);
                skip_metadata_value(reader, val_type)?;
            }
        }
        _ => return Err(GgufError::ParseError(format!("Bilinmeyen tip: {}", val_type))),
    }
    Ok(())
}


pub fn read_gguf_meta(path: &Path) -> Result<GgufMeta, GgufError> {
    let file = File::open(path)?;
    let file_size_mb = file.metadata()?.len() / 1_048_576;

    let mut reader = BufReader::new(file);

    let mut magic = [0u8; 4];
    reader.read_exact(&mut magic)?;
    if magic != [0x47, 0x47, 0x55, 0x46] {
        return Err(GgufError::InvalidMagic(u32::from_le_bytes(magic)));
    }

    let mut ver_buf = [0u8; 4];
    reader.read_exact(&mut ver_buf)?;
    let version = u32::from_le_bytes(ver_buf);
    if !(2..=3).contains(&version) {
        return Err(GgufError::UnsupportedVersion(version));
    }

    let mut tensor_count_buf = [0u8; 8];
    reader.read_exact(&mut tensor_count_buf)?;

    let mut kv_count_buf = [0u8; 8];
    reader.read_exact(&mut kv_count_buf)?;
    let kv_count = u64::from_le_bytes(kv_count_buf);
    if kv_count > 1_000_000 { return Err(GgufError::ParseError("KV count exceeds safety limit".into())); }

    let mut architecture = String::from("llama");
    let mut layer_count = 0;
    let mut chat_template = None;
    let mut attention_head_count = 32;
    let mut attention_head_count_kv = None;
    let mut embedding_length = 4096;

    for _ in 0..kv_count {
        let mut key_len_buf = [0u8; 8];
        if reader.read_exact(&mut key_len_buf).is_err() {
            break;
        }
        let key_len = u64::from_le_bytes(key_len_buf);
        if key_len > 1024 { return Err(GgufError::ParseError("Key length exceeds 1KB safety limit".into())); }

        let mut key_bytes = vec![0u8; key_len as usize];
        if reader.read_exact(&mut key_bytes).is_err() {
            break;
        }
        let key = String::from_utf8_lossy(&key_bytes).to_string();

        let mut val_type_buf = [0u8; 4];
        if reader.read_exact(&mut val_type_buf).is_err() {
            break;
        }
        let val_type = u32::from_le_bytes(val_type_buf);

        match val_type {
            0 | 1 | 7 => {
                // u8, i8, bool
                let mut v = [0u8; 1];
                if reader.read_exact(&mut v).is_err() {
                    break;
                }
            }
            2 | 3 => {
                // u16, i16
                let mut v = [0u8; 2];
                if reader.read_exact(&mut v).is_err() {
                    break;
                }
            }
            4..=6 => {
                // u32, i32, f32
                let mut v = [0u8; 4];
                if reader.read_exact(&mut v).is_err() {
                    break;
                }
                if key.ends_with(".block_count") {
                    layer_count = u32::from_le_bytes(v);
                } else if key.ends_with(".attention.head_count") {
                    attention_head_count = u32::from_le_bytes(v);
                } else if key.ends_with(".attention.head_count_kv") {
                    attention_head_count_kv = Some(u32::from_le_bytes(v));
                } else if key.ends_with(".embedding_length") {
                    embedding_length = u32::from_le_bytes(v);
                }
            }
            8 => {
                // string
                let mut slen_buf = [0u8; 8];
                if reader.read_exact(&mut slen_buf).is_err() {
                    break;
                }
                let slen = u64::from_le_bytes(slen_buf);
                if slen > 1024 * 1024 * 50 { return Err(GgufError::ParseError("String value length exceeds limit".into())); }
                let mut sbytes = vec![0u8; slen as usize];
                if reader.read_exact(&mut sbytes).is_err() {
                    break;
                }
                if key == "general.architecture" {
                    architecture = String::from_utf8_lossy(&sbytes).to_string();
                } else if key == "tokenizer.chat_template" {
                    chat_template = Some(String::from_utf8_lossy(&sbytes).to_string());
                }
            }
            9 => {
                let arr_type = {
                    let mut b = [0u8; 4];
                    if reader.read_exact(&mut b).is_err() { break; }
                    u32::from_le_bytes(b)
                };
                let arr_len = {
                    let mut b = [0u8; 8];
                    if reader.read_exact(&mut b).is_err() { break; }
                    u64::from_le_bytes(b)
                };
                for _ in 0..arr_len {
                    if skip_metadata_value(&mut reader, arr_type).is_err() {
                        break;
                    }
                }
            }
            10 => {
                // u64
                let mut v = [0u8; 8];
                if reader.read_exact(&mut v).is_err() {
                    break;
                }
            }
            11 => {
                // array (according to user report)
                let arr_type = {
                    let mut b = [0u8; 4];
                    if reader.read_exact(&mut b).is_err() { break; }
                    u32::from_le_bytes(b)
                };
                let arr_len = {
                    let mut b = [0u8; 8];
                    if reader.read_exact(&mut b).is_err() { break; }
                    u64::from_le_bytes(b)
                };
                for _ in 0..arr_len {
                    if skip_metadata_value(&mut reader, arr_type).is_err() {
                        break;
                    }
                }
            }
            12 => {
                // map (according to user report)
                let mut b = [0u8; 8];
                if reader.read_exact(&mut b).is_err() { break; }
                let map_len = u64::from_le_bytes(b);
                if map_len > 1_000_000 { return Err(GgufError::ParseError("Map length exceeds limit".into())); }
                for _ in 0..map_len {
                    let mut b2 = [0u8; 8]; 
                    if reader.read_exact(&mut b2).is_err() { break; }
                    let key_len = u64::from_le_bytes(b2);
                    if key_len > 1024 { return Err(GgufError::ParseError("Map key length exceeds 1KB limit".into())); }
                    let mut key_bytes = vec![0u8; key_len as usize];
                    if reader.read_exact(&mut key_bytes).is_err() { break; }
                    let mut b3 = [0u8; 4];
                    if reader.read_exact(&mut b3).is_err() { break; }
                    let v_type = u32::from_le_bytes(b3);
                    if skip_metadata_value(&mut reader, v_type).is_err() { break; }
                }
            }
            _ => {
                if skip_metadata_value(&mut reader, val_type).is_err() {
                    break;
                }
            }
        }
    }

    let file_name = path.file_name().unwrap_or_default().to_string_lossy();
    let quant_label = file_name
        .split('.')
        .rev()
        .nth(1)
        .unwrap_or("Q4_K_M")
        .to_string();

    let layer_count = if layer_count == 0 { 32 } else { layer_count };

    Ok(GgufMeta {
        architecture,
        layer_count,
        quant_label,
        file_size_mb,
        chat_template,
        attention_head_count,
        attention_head_count_kv,
        embedding_length,
    })
}
