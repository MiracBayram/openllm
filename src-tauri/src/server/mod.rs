use axum::{routing::post, Router};
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;
use tauri::{AppHandle, Manager, Emitter};
use std::future::IntoFuture;
use tower_http::cors::{CorsLayer, Any};
use axum::{
    extract::Request,
    http::{header, Method, StatusCode},
    middleware::{self, Next},
    response::Response,
    Extension,
};
use subtle::ConstantTimeEq;

#[derive(Clone)]
struct ServerState {
    api_key: String,
}

async fn auth_middleware(
    Extension(state): Extension<ServerState>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth_header = req
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "));

    if let Some(token) = auth_header {
        if token.len() == state.api_key.len() && token.as_bytes().ct_eq(state.api_key.as_bytes()).into() {
            return Ok(next.run(req).await);
        }
    }

    Err(StatusCode::UNAUTHORIZED)
}

pub async fn start_server(app: AppHandle, mut port: u16, api_key: String, mut bind_address: String, cancel_token: CancellationToken) -> Result<u16, String> {
    let _app_state = app.state::<crate::AppState>();
    
    // Security restriction: Don't allow binding to 0.0.0.0 unless explicitly enabled via LAN mode.
    if bind_address == "0.0.0.0" {
        tracing::warn!("Blocked attempt to bind API server to 0.0.0.0. Forcing 127.0.0.1.");
        bind_address = "127.0.0.1".to_string();
    }
    
    // Fallback port finding
    let listener = loop {
        match TcpListener::bind(format!("{}:{}", bind_address, port)).await {
            Ok(l) => break l,
            Err(_) => {
                tracing::warn!("Port {} dolu, {} deneniyor...", port, port + 1);
                port += 1;
                if port > 1250 {
                    return Err("Suitable port not found".to_string());
                }
            }
        }
    };

    let actual_port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let msg = format!("Axum sunucusu {}:{} üzerinde başlatıldı.", bind_address, actual_port);
    tracing::info!("{}", msg);
    let _ = app.emit("forge://server_log", serde_json::json!({
        "level": "info",
        "message": msg
    }));

    let cors = CorsLayer::new()
        .allow_origin(["http://localhost:1420".parse().unwrap(), "http://127.0.0.1:1420".parse().unwrap()])
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers(Any);

    let app_router = Router::new()
        .route("/v1/models", axum::routing::get(list_models))
        .route("/v1/chat/completions", post(chat_completions))
        .layer(middleware::from_fn(auth_middleware))
        .layer(Extension(ServerState { api_key }))
        .layer(Extension(app.clone()))
        .layer(cors);

    tokio::spawn(async move {
        let serve = axum::serve(listener, app_router);
        tokio::select! {
            _ = serve.into_future() => {},
            _ = cancel_token.cancelled() => {
                tracing::info!("Axum sunucusu başarıyla durduruldu.");
                let _ = app.emit("forge://server_log", serde_json::json!({
                    "level": "info",
                    "message": "Axum sunucusu başarıyla durduruldu."
                }));
            }
        }
    });

    Ok(actual_port)
}

async fn proxy_request(
    Extension(app_handle): Extension<AppHandle>,
    req: Request<axum::body::Body>
) -> Result<Response<axum::body::Body>, StatusCode> {
    let path_query = req
        .uri()
        .path_and_query()
        .map(|v| v.as_str())
        .unwrap_or(req.uri().path());

    // Get the dynamic port from AppState instead of hardcoded 8080
    let state = app_handle.state::<crate::AppState>();
    let port = {
        let lock = state.active_server_ports.lock().await;
        lock.get("default").copied().unwrap_or(8080)
    };

    let uri = format!("http://127.0.0.1:{}{}", port, path_query);
    let client = reqwest::Client::new();
    
    let method = req.method().clone();
    let mut headers = req.headers().clone();
    headers.remove(header::HOST);
    headers.remove(header::AUTHORIZATION); // Don't forward our local token to llama-server

    // 10MB limit instead of usize::MAX to prevent OOM
    let body_bytes = axum::body::to_bytes(req.into_body(), 10 * 1024 * 1024)
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?;

    let mut proxy_req = client.request(method, uri).body(body_bytes);
    for (name, value) in headers {
        if let Some(n) = name {
            proxy_req = proxy_req.header(n, value);
        }
    }

    match proxy_req.send().await {
        Ok(res) => {
            let mut response_builder = Response::builder().status(res.status());
            for (name, value) in res.headers() {
                response_builder = response_builder.header(name, value);
            }
            let stream = res.bytes_stream();
            let body = axum::body::Body::from_stream(stream);
            Ok(response_builder.body(body).unwrap())
        }
        Err(e) => {
            tracing::error!("Proxy error: {:?}", e);
            Err(StatusCode::BAD_GATEWAY)
        }
    }
}

async fn chat_completions(
    Extension(app): Extension<AppHandle>,
    req: Request<axum::body::Body>
) -> Result<Response<axum::body::Body>, StatusCode> {
    proxy_request(Extension(app), req).await
}

async fn list_models(
    Extension(app): Extension<AppHandle>,
    req: Request<axum::body::Body>
) -> Result<Response<axum::body::Body>, StatusCode> {
    proxy_request(Extension(app), req).await
}
