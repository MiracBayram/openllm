use crate::engines::EngineEvent;

#[derive(serde::Deserialize)]
struct LlamaLine {
    #[serde(rename = "type")]
    kind: String,
    content: Option<String>,
    tokens_predicted: Option<u32>,
    generation_time_ms: Option<u64>,
}

pub fn parse_llamacpp_line(line: &str) -> EngineEvent {
    if let Ok(parsed) = serde_json::from_str::<LlamaLine>(line) {
        match parsed.kind.as_str() {
            "token" => {
                if let Some(content) = parsed.content {
                    return EngineEvent::Token(content);
                }
            }
            "generation_complete" => {
                return EngineEvent::Done {
                    tokens_generated: parsed.tokens_predicted.unwrap_or(0),
                    duration_ms: parsed.generation_time_ms.unwrap_or(0),
                };
            }
            _ => {}
        }
    }
    EngineEvent::Log(line.to_string())
}

pub async fn stream_llamacpp(
    stdout: tokio::process::ChildStdout,
    tx: tokio::sync::mpsc::Sender<EngineEvent>,
) {
    use tokio::io::{AsyncBufReadExt, BufReader};
    let mut reader = BufReader::new(stdout).lines();
    while let Ok(Some(line)) = reader.next_line().await {
        let event = parse_llamacpp_line(&line);
        if tx.send(event).await.is_err() {
            break;
        }
    }
}
pub async fn stream_llamacpp_stderr(
    stderr: tokio::process::ChildStderr,
    tx: tokio::sync::mpsc::Sender<EngineEvent>,
) {
    use tokio::io::{AsyncBufReadExt, BufReader};
    let mut reader = BufReader::new(stderr).lines();
    while let Ok(Some(line)) = reader.next_line().await {
        let line_lower = line.to_lowercase();
        let is_error = line_lower.starts_with("error:")
            || line_lower.starts_with("err:")
            || line_lower.contains(" segmentation fault")
            || line_lower.contains("aborted (core dumped)")
            || line_lower.contains("cuda error")
            || line_lower.contains("out of memory");
            
        if is_error {
            let _ = tx.send(EngineEvent::Error(line.clone())).await;
        } else if line_lower.contains("llama_print_timings") && line_lower.contains("tokens per second") {
            // Very naive parsing of tps just to emit stats
            let parts: Vec<&str> = line.split("tokens per second").collect();
            if parts.len() > 1 {
                let left = parts[0].trim();
                let last_word = left.split_whitespace().last().unwrap_or("0");
                if let Ok(tps) = last_word.parse::<f32>() {
                    let _ = tx.send(EngineEvent::Stats {
                        tokens_per_sec: tps,
                        vram_used_mb: 0,
                    }).await;
                }
            }
        } else {
            let _ = tx.send(EngineEvent::Log(line)).await;
        }
    }
}

pub async fn stream_llama_server_stderr(
    stderr: tokio::process::ChildStderr,
    tx: tokio::sync::mpsc::Sender<EngineEvent>,
    port: u16,
    prompt: String,
    temp: f64,
    n_predict: i64,
) {
    use tokio::io::{AsyncBufReadExt, BufReader};
    let mut reader = BufReader::new(stderr).lines();
    let mut server_ready = false;

    while let Ok(Some(line)) = reader.next_line().await {
        let line_lower = line.to_lowercase();
        if !server_ready && line_lower.contains("http server listening") {
            server_ready = true;
            let _ = tx.send(EngineEvent::Log("HTTP Server Ready. Starting inference...".to_string())).await;
            
            let tx_clone = tx.clone();
            let prompt_clone = prompt.clone();
            tokio::spawn(async move {
                run_llama_server_sse(port, prompt_clone, tx_clone, temp, n_predict).await;
            });
        }

        let is_error = line_lower.starts_with("error:")
            || line_lower.starts_with("err:")
            || line_lower.contains(" segmentation fault")
            || line_lower.contains("aborted (core dumped)")
            || line_lower.contains("cuda error")
            || line_lower.contains("out of memory");

        if is_error {
            let _ = tx.send(EngineEvent::Error(line.clone())).await;
        } else if line_lower.contains("llama_print_timings") && line_lower.contains("tokens per second") {
            let parts: Vec<&str> = line.split("tokens per second").collect();
            if parts.len() > 1 {
                let left = parts[0].trim();
                let last_word = left.split_whitespace().last().unwrap_or("0");
                if let Ok(tps) = last_word.parse::<f32>() {
                    let _ = tx.send(EngineEvent::Stats {
                        tokens_per_sec: tps,
                        vram_used_mb: 0,
                    }).await;
                }
            }
        } else {
            let _ = tx.send(EngineEvent::Log(line)).await;
        }
    }
}

async fn run_llama_server_sse(
    port: u16,
    prompt: String,
    tx: tokio::sync::mpsc::Sender<EngineEvent>,
    temp: f64,
    n_predict: i64,
) {
    let client = reqwest::Client::new();
    let payload = serde_json::json!({
        "prompt": prompt,
        "stream": true,
        "n_predict": n_predict,
        "temperature": temp
    });

    let res = match client.post(format!("http://127.0.0.1:{}/completion", port))
        .json(&payload)
        .send()
        .await {
            Ok(r) => r,
            Err(e) => {
                let _ = tx.send(EngineEvent::Error(format!("Failed to connect to llama-server: {}", e))).await;
                return;
            }
        };

    use futures::StreamExt;
    let mut stream = res.bytes_stream();
    let mut buffer = String::new();
    
    let start_time = std::time::Instant::now();
    let mut tokens = 0;

    while let Some(chunk_res) = stream.next().await {
        if let Ok(chunk) = chunk_res {
            buffer.push_str(&String::from_utf8_lossy(&chunk));
            
            while let Some(pos) = buffer.find("\n\n") {
                let event_str = buffer[..pos].to_string();
                buffer = buffer[pos+2..].to_string();
                
                if event_str.starts_with("data: ") {
                    let data = &event_str[6..];
                    if data == "[DONE]" {
                        let duration = start_time.elapsed().as_millis() as u64;
                        let _ = tx.send(EngineEvent::Done { tokens_generated: tokens, duration_ms: duration }).await;
                        return;
                    }
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(content) = json.get("content").and_then(|v| v.as_str()) {
                            tokens += 1;
                            let _ = tx.send(EngineEvent::Token(content.to_string())).await;
                        }
                    }
                }
            }
        }
    }
    
    let duration = start_time.elapsed().as_millis() as u64;
    let _ = tx.send(EngineEvent::Done { tokens_generated: tokens, duration_ms: duration }).await;
}
