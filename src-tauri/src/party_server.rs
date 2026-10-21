//! Party mode's LAN server (docs/party-mode-design.md §4.1, plan S1).
//!
//! While party mode is open, the desktop serves the phone controller page
//! (`/party`, from the app's own bundled frontend) and a WebSocket on the PC's
//! home-network address. It is only a relay: phone messages go to the webview
//! as events, and the webview tells it what to send to which phone. All game
//! logic, and every decision about what a phone may see, stays in the
//! desktop's TypeScript (app/misc/party/). Nothing here parses a message.
//!
//! Every request must come from a private-network address. A WebSocket must
//! also carry the session token from the QR code and an expected Origin.

use std::{
    collections::{HashMap, HashSet},
    net::{IpAddr, Ipv4Addr, SocketAddr},
    sync::{Arc, Mutex},
    time::Duration,
};

use axum::{
    extract::{
        ws::{rejection::WebSocketUpgradeRejection, Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, Query, State,
    },
    http::{header, HeaderMap, HeaderValue, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use serde::{Deserialize, Serialize};
use tauri::{ipc::Channel, AppHandle, Runtime};
use tokio::sync::{mpsc, watch};

pub const DEFAULT_PORT: u16 = 8787;
/// Ports tried after the preferred one when it is taken or reserved.
const PORT_ATTEMPTS: u16 = 10;
/// One WebSocket message. Room for a voice chunk (S8), which the phone splits.
pub const MAX_MESSAGE_BYTES: usize = 256 * 1024;
const MAX_CLIENTS: usize = 16;
/// Messages queued for one phone before it counts as stuck and is dropped.
const CLIENT_QUEUE: usize = 64;
const USER_AGENT_MAX: usize = 200;
/// The Android app's WebView origin (Capacitor's default), for PR P2.
const APP_ORIGINS: &[&str] = &["https://localhost"];

// ---------------------------------------------------------------- IPC types

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartyStartOpts {
    pub preferred_port: Option<u16>,
    pub interface_ip: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NetInterface {
    pub name: String,
    pub ip: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PartyInfo {
    /// What the QR code holds: http://<ip>:<port>/party?t=<token>
    pub url: String,
    pub ip: String,
    pub port: u16,
    pub token: String,
    pub interfaces: Vec<NetInterface>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum PartyEvent {
    Connected { client_id: String, user_agent: String },
    Message { client_id: String, json: String },
    Disconnected { client_id: String },
    Error { code: String, message: String },
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PartyTarget {
    All,
    Client { id: String },
}

/// An error the lobby can explain. `code` picks the help text.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PartyError {
    pub code: &'static str,
    pub message: String,
}

impl PartyError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }
}

// ---------------------------------------------------------------- pure checks

/// A peer on the home network: 10/8, 172.16/12, 192.168/16 or link-local
/// 169.254/16 (an IPv4-mapped IPv6 address counts as its IPv4 address).
pub fn is_private_peer(ip: IpAddr) -> bool {
    let v4 = match ip {
        IpAddr::V4(v4) => v4,
        IpAddr::V6(v6) => match v6.to_ipv4_mapped() {
            Some(v4) => v4,
            None => return false,
        },
    };
    v4.is_private() || v4.is_link_local()
}

/// The addresses a phone can reach: private IPv4, not link-local.
fn is_lan_address(ip: Ipv4Addr) -> bool {
    ip.is_private()
}

/// Compare the presented token without leaking where it differs.
pub fn token_matches(presented: Option<&str>, expected: &str) -> bool {
    let Some(presented) = presented else { return false };
    let (a, b) = (presented.as_bytes(), expected.as_bytes());
    if a.len() != b.len() || b.is_empty() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

pub fn origin_allowed(origin: Option<&str>, allowed: &[String]) -> bool {
    match origin {
        Some(o) => allowed.iter().any(|a| a == o),
        None => false,
    }
}

/// The origins a WebSocket may come from: the page this server serves, and
/// the Android app.
pub fn allowed_origins(ip: Ipv4Addr, port: u16) -> Vec<String> {
    let mut origins = vec![format!("http://{ip}:{port}")];
    origins.extend(APP_ORIGINS.iter().map(|o| o.to_string()));
    origins
}

/// Map a request path to the bundled asset it may serve. Only the phone page
/// and the files it loads are served, never the rest of the app.
pub fn map_request_path(path: &str) -> Option<String> {
    if path.contains("..") || path.contains('\\') || path.contains('%') || path.contains('\0')
        || path.contains("//")
    {
        return None;
    }
    match path {
        "/party" | "/party/" | "/party.html" => return Some("/party.html".into()),
        "/favicon.ico" => return Some("/favicon.ico".into()),
        _ => {}
    }
    let rest = path.strip_prefix("/_next/static/")?;
    if rest.is_empty() || rest.ends_with('/') {
        return None;
    }
    Some(path.to_string())
}

fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::fill(&mut buf[..]);
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

// ---------------------------------------------------------------- interfaces

/// The PC's home-network IPv4 addresses, the default-route one first.
pub fn lan_interfaces(
    all: &[(String, IpAddr)],
    default_ip: Option<IpAddr>,
) -> Vec<NetInterface> {
    let mut out: Vec<NetInterface> = Vec::new();
    for (name, ip) in all {
        let IpAddr::V4(v4) = ip else { continue };
        if !is_lan_address(*v4) || out.iter().any(|i| i.ip == v4.to_string()) {
            continue;
        }
        out.push(NetInterface {
            name: name.clone(),
            ip: v4.to_string(),
            is_default: default_ip == Some(*ip),
        });
    }
    // If the default route isn't on a home network (a VPN, say), the first
    // LAN address stands in for it.
    if !out.iter().any(|i| i.is_default) {
        if let Some(first) = out.first_mut() {
            first.is_default = true;
        }
    }
    out.sort_by_key(|i| !i.is_default);
    out
}

/// The interface to bind: the one asked for if it's one of ours, else the default.
pub fn choose_interface(
    interfaces: &[NetInterface],
    wanted: Option<&str>,
) -> Result<Ipv4Addr, PartyError> {
    let pick = match wanted {
        Some(w) => interfaces.iter().find(|i| i.ip == w).ok_or_else(|| {
            PartyError::new("BIND_FAILED", format!("{w} is not one of this PC's home-network addresses"))
        })?,
        None => interfaces.iter().find(|i| i.is_default).ok_or_else(|| {
            PartyError::new("NO_NETWORK", "This PC isn't connected to a home network")
        })?,
    };
    pick.ip
        .parse()
        .map_err(|_| PartyError::new("BIND_FAILED", format!("Bad address {}", pick.ip)))
}

fn bind_error_code(e: &std::io::Error) -> &'static str {
    // WSAEACCES (10013): Windows reserved this port, often for Hyper-V or WSL.
    if e.raw_os_error() == Some(10013) || e.kind() == std::io::ErrorKind::PermissionDenied {
        "PORT_RESERVED"
    } else if e.kind() == std::io::ErrorKind::AddrInUse {
        "PORT_IN_USE"
    } else {
        "BIND_FAILED"
    }
}

async fn bind(ip: Ipv4Addr, preferred: u16) -> Result<tokio::net::TcpListener, PartyError> {
    let mut last: Option<std::io::Error> = None;
    for offset in 0..PORT_ATTEMPTS {
        let Some(port) = preferred.checked_add(offset) else { break };
        match tokio::net::TcpListener::bind(SocketAddr::new(IpAddr::V4(ip), port)).await {
            Ok(listener) => return Ok(listener),
            Err(e) => {
                let code = bind_error_code(&e);
                if code == "BIND_FAILED" {
                    return Err(PartyError::new(code, format!("Couldn't listen on {ip}:{port}: {e}")));
                }
                last = Some(e);
            }
        }
    }
    let e = last.unwrap_or_else(|| std::io::Error::other("no port"));
    Err(PartyError::new(
        bind_error_code(&e),
        format!("Ports {preferred}-{} on {ip} are all unavailable: {e}", preferred.saturating_add(PORT_ATTEMPTS - 1)),
    ))
}

// ---------------------------------------------------------------- the server

enum Outgoing {
    Text(String),
    Close,
}

type AssetFn = dyn Fn(&str) -> Option<(Vec<u8>, String)> + Send + Sync;
type EventFn = dyn Fn(PartyEvent) -> bool + Send + Sync;

struct Shared {
    token: String,
    origins: Vec<String>,
    /// Bundled asset keys ("/party.html"…). Empty in `tauri dev`, where
    /// assets are read from out/ on disk and a missing one is simply None.
    asset_keys: HashSet<String>,
    assets: Box<AssetFn>,
    /// Hands an event to the webview. False when the webview is gone.
    emit: Box<EventFn>,
    peer_ok: fn(IpAddr) -> bool,
    clients: Mutex<HashMap<String, mpsc::Sender<Outgoing>>>,
    shutdown_tx: watch::Sender<bool>,
}

impl Shared {
    fn emit(&self, event: PartyEvent) {
        if !(self.emit)(event) {
            // Nobody is listening any more: the party is over.
            let _ = self.shutdown_tx.send(true);
        }
    }

    fn asset(&self, key: &str) -> Option<(Vec<u8>, String)> {
        if !self.asset_keys.is_empty() && !self.asset_keys.contains(key) {
            // Tauri's resolver falls back to index.html for a missing path;
            // never hand that out for a file the export doesn't have.
            return None;
        }
        (self.assets)(key)
    }

    fn send(&self, target: &PartyTarget, json: &str) {
        let mut clients = self.clients.lock().unwrap();
        let ids: Vec<String> = match target {
            PartyTarget::All => clients.keys().cloned().collect(),
            PartyTarget::Client { id } => vec![id.clone()],
        };
        for id in ids {
            let full = match clients.get(&id) {
                Some(tx) => tx.try_send(Outgoing::Text(json.to_string())).is_err(),
                None => false,
            };
            if full {
                // A phone that stopped reading: dropping its sender ends it.
                clients.remove(&id);
            }
        }
    }

    fn kick(&self, id: &str) {
        if let Some(tx) = self.clients.lock().unwrap().remove(id) {
            let _ = tx.try_send(Outgoing::Close);
        }
    }
}

fn router(shared: Arc<Shared>) -> Router {
    Router::new()
        .route("/ws", get(ws_handler))
        .fallback(static_handler)
        .with_state(shared)
}

async fn static_handler(
    State(s): State<Arc<Shared>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    uri: Uri,
) -> Response {
    if !(s.peer_ok)(peer.ip()) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let Some(key) = map_request_path(uri.path()) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Some((bytes, mime)) = s.asset(&key) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let mut res = bytes.into_response();
    let h = res.headers_mut();
    if let Ok(v) = HeaderValue::from_str(&mime) {
        h.insert(header::CONTENT_TYPE, v);
    }
    h.insert(header::X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    // The page's URL carries the token: never let it leak as a Referer.
    h.insert(header::REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
    if key.ends_with(".html") {
        h.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        h.insert("x-frame-options", HeaderValue::from_static("DENY"));
    } else if key.starts_with("/_next/static/") {
        h.insert(header::CACHE_CONTROL, HeaderValue::from_static("public, max-age=31536000, immutable"));
    }
    res
}

// The upgrade is extracted last and as a Result, so the checks below run
// before anything about the upgrade itself is looked at.
async fn ws_handler(
    State(s): State<Arc<Shared>>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    Query(q): Query<HashMap<String, String>>,
    headers: HeaderMap,
    ws: Result<WebSocketUpgrade, WebSocketUpgradeRejection>,
) -> Response {
    if !(s.peer_ok)(peer.ip()) {
        return StatusCode::FORBIDDEN.into_response();
    }
    if !token_matches(q.get("t").map(String::as_str), &s.token) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let origin = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok());
    if !origin_allowed(origin, &s.origins) {
        return StatusCode::FORBIDDEN.into_response();
    }
    if s.clients.lock().unwrap().len() >= MAX_CLIENTS {
        return StatusCode::SERVICE_UNAVAILABLE.into_response();
    }
    let ws = match ws {
        Ok(ws) => ws,
        Err(rejection) => return rejection.into_response(),
    };
    let user_agent: String = headers
        .get(header::USER_AGENT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .chars()
        .take(USER_AGENT_MAX)
        .collect();
    ws.max_message_size(MAX_MESSAGE_BYTES)
        .max_frame_size(MAX_MESSAGE_BYTES)
        .on_upgrade(move |socket| run_client(s, socket, user_agent))
}

async fn run_client(s: Arc<Shared>, mut socket: WebSocket, user_agent: String) {
    let client_id = random_hex(8);
    let (tx, mut rx) = mpsc::channel::<Outgoing>(CLIENT_QUEUE);
    s.clients.lock().unwrap().insert(client_id.clone(), tx);
    let mut shutdown = s.shutdown_tx.subscribe();
    s.emit(PartyEvent::Connected { client_id: client_id.clone(), user_agent });

    loop {
        tokio::select! {
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Text(text))) => {
                    s.emit(PartyEvent::Message { client_id: client_id.clone(), json: text.to_string() });
                }
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                // Binary is not part of the protocol; pings are answered by axum.
                Some(Ok(_)) => {}
            },
            outgoing = rx.recv() => match outgoing {
                Some(Outgoing::Text(text)) => {
                    if socket.send(Message::Text(text.into())).await.is_err() {
                        break;
                    }
                }
                Some(Outgoing::Close) | None => {
                    let _ = socket.send(Message::Close(None)).await;
                    break;
                }
            },
            _ = shutdown.changed() => {
                let _ = socket.send(Message::Close(None)).await;
                break;
            }
        }
    }
    s.clients.lock().unwrap().remove(&client_id);
    s.emit(PartyEvent::Disconnected { client_id });
}

struct Running {
    shared: Arc<Shared>,
    task: tauri::async_runtime::JoinHandle<()>,
}

/// Tauri-managed state: the party server, while party mode is open.
#[derive(Default)]
pub struct PartyServer {
    running: tokio::sync::Mutex<Option<Running>>,
}

struct StartParams {
    ip: Ipv4Addr,
    preferred_port: u16,
    token: String,
    asset_keys: HashSet<String>,
    assets: Box<AssetFn>,
    emit: Box<EventFn>,
    peer_ok: fn(IpAddr) -> bool,
}

async fn start_server(p: StartParams) -> Result<(Running, u16), PartyError> {
    let listener = bind(p.ip, p.preferred_port).await?;
    let port = listener
        .local_addr()
        .map_err(|e| PartyError::new("BIND_FAILED", e.to_string()))?
        .port();
    let (shutdown_tx, mut shutdown_rx) = watch::channel(false);
    let shared = Arc::new(Shared {
        token: p.token,
        origins: allowed_origins(p.ip, port),
        asset_keys: p.asset_keys,
        assets: p.assets,
        emit: p.emit,
        peer_ok: p.peer_ok,
        clients: Mutex::new(HashMap::new()),
        shutdown_tx,
    });
    let app = router(shared.clone()).into_make_service_with_connect_info::<SocketAddr>();
    let task_shared = shared.clone();
    let task = tauri::async_runtime::spawn(async move {
        let stop = async move {
            let _ = shutdown_rx.wait_for(|stop| *stop).await;
        };
        // If the listener dies while the party is open, say so: the lobby
        // would otherwise go on showing a QR code nobody can reach.
        if let Err(e) = axum::serve(listener, app).with_graceful_shutdown(stop).await {
            task_shared.emit(PartyEvent::Error {
                code: "SERVER_FAILED".into(),
                message: e.to_string(),
            });
        }
    });
    Ok((Running { shared, task }, port))
}

async fn stop_running(running: Running) {
    let _ = running.shared.shutdown_tx.send(true);
    running.shared.clients.lock().unwrap().clear();
    // Connections close on the shutdown signal; don't wait forever on one.
    let _ = tokio::time::timeout(Duration::from_secs(3), running.task).await;
}

// ---------------------------------------------------------------- commands

#[tauri::command]
pub async fn party_start<R: Runtime>(
    app: AppHandle<R>,
    opts: PartyStartOpts,
    on_event: Channel<PartyEvent>,
    state: tauri::State<'_, PartyServer>,
) -> Result<PartyInfo, PartyError> {
    let mut running = state.running.lock().await;
    // A fresh start replaces any party still running (a reloaded page).
    if let Some(old) = running.take() {
        stop_running(old).await;
    }

    let all = local_ip_address::list_afinet_netifas()
        .map_err(|e| PartyError::new("NO_NETWORK", e.to_string()))?;
    let default_ip = local_ip_address::local_ip().ok();
    let interfaces = lan_interfaces(&all, default_ip);
    let ip = choose_interface(&interfaces, opts.interface_ip.as_deref())?;
    let token = random_hex(16);

    let resolver = app.asset_resolver();
    let asset_keys: HashSet<String> = resolver.iter().map(|(k, _)| k.into_owned()).collect();
    let assets_app = app.clone();
    let assets: Box<AssetFn> = Box::new(move |key: &str| {
        assets_app
            .asset_resolver()
            .get(key.to_string())
            .map(|a| (a.bytes().to_vec(), a.mime_type().to_string()))
    });
    let emit: Box<EventFn> = Box::new(move |event| on_event.send(event).is_ok());

    let (server, port) = start_server(StartParams {
        ip,
        preferred_port: opts.preferred_port.unwrap_or(DEFAULT_PORT),
        token: token.clone(),
        asset_keys,
        assets,
        emit,
        peer_ok: is_private_peer,
    })
    .await?;
    *running = Some(server);
    Ok(PartyInfo {
        url: format!("http://{ip}:{port}/party?t={token}"),
        ip: ip.to_string(),
        port,
        token,
        interfaces,
    })
}

#[tauri::command]
pub async fn party_send(
    to: PartyTarget,
    json: String,
    state: tauri::State<'_, PartyServer>,
) -> Result<(), PartyError> {
    if json.len() > MAX_MESSAGE_BYTES {
        return Err(PartyError::new("TOO_LARGE", "Message too large for a phone"));
    }
    match state.running.lock().await.as_ref() {
        Some(r) => {
            r.shared.send(&to, &json);
            Ok(())
        }
        None => Err(PartyError::new("NOT_RUNNING", "Party mode isn't running")),
    }
}

#[tauri::command]
pub async fn party_kick(
    client_id: String,
    state: tauri::State<'_, PartyServer>,
) -> Result<(), PartyError> {
    if let Some(r) = state.running.lock().await.as_ref() {
        r.shared.kick(&client_id);
    }
    Ok(())
}

#[tauri::command]
pub async fn party_stop(state: tauri::State<'_, PartyServer>) -> Result<(), PartyError> {
    if let Some(r) = state.running.lock().await.take() {
        stop_running(r).await;
    }
    Ok(())
}

// ---------------------------------------------------------------- tests

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, extract::connect_info::MockConnectInfo, http::Request};
    use tower::ServiceExt;

    fn v4(s: &str) -> IpAddr {
        s.parse().unwrap()
    }

    #[test]
    fn private_ranges() {
        for ok in ["10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.0.253", "169.254.39.80"] {
            assert!(is_private_peer(v4(ok)), "{ok}");
        }
        for bad in ["8.8.8.8", "172.32.0.1", "100.122.14.19", "25.0.0.1", "127.0.0.1", "::1", "2001:db8::1"] {
            assert!(!is_private_peer(v4(bad)), "{bad}");
        }
        assert!(is_private_peer(v4("::ffff:192.168.1.2")));
    }

    #[test]
    fn token_check() {
        assert!(token_matches(Some("abc123"), "abc123"));
        assert!(!token_matches(Some("abc124"), "abc123"));
        assert!(!token_matches(Some("abc12"), "abc123"));
        assert!(!token_matches(None, "abc123"));
        assert!(!token_matches(Some(""), ""));
    }

    #[test]
    fn tokens_are_128_bit_and_differ() {
        let a = random_hex(16);
        assert_eq!(a.len(), 32);
        assert!(a.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(a, random_hex(16));
    }

    #[test]
    fn origin_check() {
        let allowed = allowed_origins("192.168.0.85".parse().unwrap(), 8787);
        assert!(origin_allowed(Some("http://192.168.0.85:8787"), &allowed));
        assert!(origin_allowed(Some("https://localhost"), &allowed));
        assert!(!origin_allowed(Some("http://192.168.0.85:8788"), &allowed));
        assert!(!origin_allowed(Some("http://evil.example"), &allowed));
        assert!(!origin_allowed(Some("null"), &allowed));
        assert!(!origin_allowed(None, &allowed));
    }

    #[test]
    fn path_mapping() {
        assert_eq!(map_request_path("/party").as_deref(), Some("/party.html"));
        assert_eq!(map_request_path("/party/").as_deref(), Some("/party.html"));
        assert_eq!(map_request_path("/favicon.ico").as_deref(), Some("/favicon.ico"));
        assert_eq!(
            map_request_path("/_next/static/chunks/0_lta6jo6er2-.css").as_deref(),
            Some("/_next/static/chunks/0_lta6jo6er2-.css")
        );
        for refused in [
            "/",
            "/library",
            "/story",
            "/index.html",
            "/_next/static/",
            "/_next/static/../../index.html",
            "/_next/static/%2e%2e/x.js",
            "/_next/static/chunks\\x.js",
            "/_next/data/x.json",
            "//party",
            "/assets/themes/default/default.json",
        ] {
            assert_eq!(map_request_path(refused), None, "{refused}");
        }
    }

    #[test]
    fn interface_choice() {
        let all = vec![
            ("Tailscale".to_string(), v4("100.122.14.19")),
            ("Ethernet".to_string(), v4("192.168.0.85")),
            ("Bluetooth".to_string(), v4("169.254.39.80")),
            ("Loopback".to_string(), v4("127.0.0.1")),
            ("Wi-Fi".to_string(), v4("10.0.0.7")),
            ("Ethernet".to_string(), v4("fe80::1")),
        ];
        let list = lan_interfaces(&all, Some(v4("192.168.0.85")));
        assert_eq!(
            list.iter().map(|i| (i.ip.as_str(), i.is_default)).collect::<Vec<_>>(),
            vec![("192.168.0.85", true), ("10.0.0.7", false)]
        );
        assert_eq!(choose_interface(&list, None).unwrap(), "192.168.0.85".parse::<Ipv4Addr>().unwrap());
        assert_eq!(choose_interface(&list, Some("10.0.0.7")).unwrap(), "10.0.0.7".parse::<Ipv4Addr>().unwrap());
        assert_eq!(choose_interface(&list, Some("8.8.8.8")).unwrap_err().code, "BIND_FAILED");

        // A VPN holding the default route: the first LAN address stands in.
        let vpn = lan_interfaces(&all, Some(v4("25.0.0.2")));
        assert_eq!(vpn[0].ip, "192.168.0.85");
        assert!(vpn[0].is_default);

        assert_eq!(choose_interface(&[], None).unwrap_err().code, "NO_NETWORK");
    }

    #[test]
    fn bind_errors_are_named() {
        assert_eq!(bind_error_code(&std::io::Error::from_raw_os_error(10013)), "PORT_RESERVED");
        assert_eq!(bind_error_code(&std::io::Error::from(std::io::ErrorKind::AddrInUse)), "PORT_IN_USE");
        assert_eq!(bind_error_code(&std::io::Error::from(std::io::ErrorKind::AddrNotAvailable)), "BIND_FAILED");
    }

    #[tokio::test]
    async fn port_fallback_skips_a_taken_port() {
        let ip: Ipv4Addr = "127.0.0.1".parse().unwrap();
        let taken = tokio::net::TcpListener::bind((ip, 0)).await.unwrap();
        let port = taken.local_addr().unwrap().port();
        let next = bind(ip, port).await.unwrap();
        assert_ne!(next.local_addr().unwrap().port(), port);
    }

    fn test_shared(assets: &[(&str, &str, &str)], peer_ok: fn(IpAddr) -> bool) -> Arc<Shared> {
        let map: HashMap<String, (Vec<u8>, String)> = assets
            .iter()
            .map(|(k, body, mime)| (k.to_string(), (body.as_bytes().to_vec(), mime.to_string())))
            .collect();
        let keys = map.keys().cloned().collect();
        let (shutdown_tx, _) = watch::channel(false);
        Arc::new(Shared {
            token: "tok".into(),
            origins: allowed_origins("192.168.0.85".parse().unwrap(), 8787),
            asset_keys: keys,
            // Like Tauri's resolver: an unknown path falls back to index.html.
            assets: Box::new(move |k| {
                map.get(k).cloned().or_else(|| Some((b"<index>".to_vec(), "text/html".into())))
            }),
            emit: Box::new(|_| true),
            peer_ok,
            clients: Mutex::new(HashMap::new()),
            shutdown_tx,
        })
    }

    async fn get(shared: Arc<Shared>, peer: &str, path: &str) -> (StatusCode, HeaderMap, String) {
        let peer: SocketAddr = peer.parse().unwrap();
        let res = router(shared)
            .layer(MockConnectInfo(peer))
            .oneshot(Request::get(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        let status = res.status();
        let headers = res.headers().clone();
        let body = axum::body::to_bytes(res.into_body(), 1 << 20).await.unwrap();
        (status, headers, String::from_utf8_lossy(&body).into_owned())
    }

    #[tokio::test]
    async fn serves_only_the_party_page_and_its_files() {
        let shared = test_shared(
            &[
                ("/party.html", "<party>", "text/html"),
                ("/_next/static/chunks/a.js", "js", "text/javascript"),
            ],
            is_private_peer,
        );
        let (status, headers, body) = get(shared.clone(), "192.168.0.253:5000", "/party?t=tok").await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(body, "<party>");
        assert_eq!(headers[header::CACHE_CONTROL], "no-store");
        assert_eq!(headers[header::REFERRER_POLICY], "no-referrer");

        let (status, _, body) = get(shared.clone(), "192.168.0.253:5000", "/_next/static/chunks/a.js").await;
        assert_eq!((status, body.as_str()), (StatusCode::OK, "js"));

        // A missing chunk is a 404, not the resolver's index.html fallback.
        let (status, _, _) = get(shared.clone(), "192.168.0.253:5000", "/_next/static/chunks/missing.js").await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        let (status, _, _) = get(shared.clone(), "192.168.0.253:5000", "/library").await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn refuses_peers_outside_the_home_network() {
        let shared = test_shared(&[("/party.html", "<party>", "text/html")], is_private_peer);
        let (status, _, _) = get(shared, "8.8.8.8:5000", "/party").await;
        assert_eq!(status, StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn websocket_needs_token_and_origin() {
        let shared = test_shared(&[], is_private_peer);
        let ws = |t: &str, origin: &str, peer: &str| {
            let peer: SocketAddr = peer.parse().unwrap();
            let req = Request::get(format!("/ws?t={t}"))
                .header(header::ORIGIN, origin)
                .header(header::CONNECTION, "upgrade")
                .header(header::UPGRADE, "websocket")
                .header(header::SEC_WEBSOCKET_VERSION, "13")
                .header(header::SEC_WEBSOCKET_KEY, "dGhlIHNhbXBsZSBub25jZQ==")
                .body(Body::empty())
                .unwrap();
            router(shared.clone()).layer(MockConnectInfo(peer)).oneshot(req)
        };
        let ok_origin = "http://192.168.0.85:8787";
        assert_eq!(ws("nope", ok_origin, "192.168.0.2:1").await.unwrap().status(), StatusCode::FORBIDDEN);
        assert_eq!(ws("tok", "http://evil.example", "192.168.0.2:1").await.unwrap().status(), StatusCode::FORBIDDEN);
        assert_eq!(ws("tok", ok_origin, "8.8.8.8:1").await.unwrap().status(), StatusCode::FORBIDDEN);
        // With everything right the request gets past the checks; oneshot
        // can't complete a real upgrade, so axum answers 426 here instead of 101.
        let status = ws("tok", ok_origin, "192.168.0.2:1").await.unwrap().status();
        assert_ne!(status, StatusCode::FORBIDDEN);
    }

    // A real socket on loopback: relay both ways, kick, and shut down.
    #[tokio::test]
    async fn relays_messages_over_a_real_socket() {
        use futures_util::{SinkExt, StreamExt};
        use tokio_tungstenite::tungstenite::{client::IntoClientRequest, Message as TMessage};

        let events: Arc<Mutex<Vec<PartyEvent>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = events.clone();
        let (running, port) = start_server(StartParams {
            ip: "127.0.0.1".parse().unwrap(),
            preferred_port: 0,
            token: "tok".into(),
            asset_keys: HashSet::new(),
            assets: Box::new(|_| None),
            emit: Box::new(move |e| {
                sink.lock().unwrap().push(e);
                true
            }),
            peer_ok: |ip| ip.is_loopback(),
        })
        .await
        .unwrap();

        let mut req = format!("ws://127.0.0.1:{port}/ws?t=tok").into_client_request().unwrap();
        req.headers_mut()
            .insert("origin", format!("http://127.0.0.1:{port}").parse().unwrap());
        let (mut phone, _) = tokio_tungstenite::connect_async(req).await.unwrap();

        phone.send(TMessage::Text("{\"type\":\"ping\"}".into())).await.unwrap();
        let client_id = wait_for(&events, |e| match e {
            PartyEvent::Message { client_id, json } if json == "{\"type\":\"ping\"}" => Some(client_id.clone()),
            _ => None,
        })
        .await;

        running.shared.send(&PartyTarget::Client { id: client_id.clone() }, "{\"type\":\"pong\"}");
        let reply = phone.next().await.unwrap().unwrap();
        assert_eq!(reply.into_text().unwrap().as_str(), "{\"type\":\"pong\"}");

        running.shared.kick(&client_id);
        loop {
            match phone.next().await {
                Some(Ok(TMessage::Close(_))) | None | Some(Err(_)) => break,
                Some(Ok(_)) => continue,
            }
        }
        wait_for(&events, |e| match e {
            PartyEvent::Disconnected { client_id: id } if *id == client_id => Some(()),
            _ => None,
        })
        .await;

        stop_running(running).await;
        assert!(tokio_tungstenite::connect_async(format!("ws://127.0.0.1:{port}/ws?t=tok")).await.is_err());
    }

    async fn wait_for<T>(
        events: &Arc<Mutex<Vec<PartyEvent>>>,
        pick: impl Fn(&PartyEvent) -> Option<T>,
    ) -> T {
        for _ in 0..200 {
            if let Some(found) = events.lock().unwrap().iter().find_map(&pick) {
                return found;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        panic!("event never arrived: {:?}", events.lock().unwrap());
    }
}
