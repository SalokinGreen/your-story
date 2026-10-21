//! The bridge to the player's own `claude` CLI, for playing on their Claude
//! subscription (docs/claude-gm-design.md §4, implementation plan B1).
//!
//! The webview never gets a general "run a program" capability. It sends a
//! typed request - a model family, an effort level, a mode, the response
//! schema, the system prompt and the prompt - and this module builds the
//! whole command line itself. The guardrails of design §5.2 are rules here:
//!
//! - The unmodified `claude` binary found on the player's PATH is run as it
//!   is. Nothing is bundled, patched or modified.
//! - No credential is read. The child starts from a cleared environment that
//!   holds only the OS variables it needs, so no `ANTHROPIC_*` or `CLAUDE_*`
//!   variable reaches it: an `ANTHROPIC_API_KEY` would silently bill the API
//!   instead of the subscription, and `CLAUDE_CODE_SIMPLE` (inherited when the
//!   app is started from inside Claude Code) ignores the sign-in.
//! - `claude auth status` also prints the account's e-mail and organisation;
//!   they are never read out of it, so they cannot reach the webview.
//!
//! Each run happens in an empty folder the app owns, with CLAUDE.md loading,
//! every built-in tool, MCP servers, slash commands and session saving off,
//! and `--safe-mode` keeping the player's own plugins and hooks out (checked
//! on the author's machine before building, plan B0). The system prompt goes
//! through a file and the conversation through stdin, so neither runs into
//! Windows' command-line length limit; the response schema (~1.5 KB) is the
//! only variable argument, and it must parse as a JSON object.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ffi::OsString;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, State};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::{oneshot, Mutex};

/// A model family; the pinned model id is chosen here, never by the webview.
#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CliModel {
    Opus,
    Sonnet,
    Haiku,
}

impl CliModel {
    pub fn id(self) -> &'static str {
        match self {
            CliModel::Opus => "claude-opus-5-5",
            CliModel::Sonnet => "claude-sonnet-5-5",
            CliModel::Haiku => "claude-haiku-5-5",
        }
    }
}

/// `--effort`. Claude 5.5's thinking cannot be turned off, so there is no
/// "none": the TypeScript side maps the tier's `none` to `low`.
#[derive(Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CliEffort {
    Low,
    Medium,
    High,
    Xhigh,
}

impl CliEffort {
    pub fn as_str(self) -> &'static str {
        match self {
            CliEffort::Low => "low",
            CliEffort::Medium => "medium",
            CliEffort::High => "high",
            CliEffort::Xhigh => "xhigh",
        }
    }
}

/// `Structured`: the answer is JSON matching `schema`, read from the final
/// `result` event's `structured_output` (a GM round, or any call that offers
/// tools). `Stream`: plain text, streamed as partial-message events.
#[derive(Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CliMode {
    Structured { schema: String },
    Stream,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CliRequest {
    /// The app's id for this run, used to cancel it.
    pub request_id: String,
    pub model: CliModel,
    pub effort: CliEffort,
    pub mode: CliMode,
    /// Written to a file and passed with `--system-prompt-file`.
    pub system_prompt: String,
    /// Written to the child's stdin.
    pub prompt: String,
}

/// What the webview hears about a run, in order: every stdout line (the
/// CLI's NDJSON events), then one `Exit`.
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum CliEvent {
    Line { json: String },
    Exit {
        code: Option<i32>,
        stderr_tail: String,
    },
}

/// Settings' status row. Deliberately has no field for the e-mail or the
/// organisation that `claude auth status` also prints.
#[derive(Serialize, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CliStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub logged_in: bool,
    pub auth_method: Option<String>,
    pub subscription_type: Option<String>,
    /// "firstParty" on the claude.ai sign-in; another value when the CLI's
    /// own settings send it to Bedrock, Vertex or similar instead.
    pub api_provider: Option<String>,
}

/// The fields read out of `claude auth status`. Nothing else is.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct AuthFields {
    pub logged_in: bool,
    pub auth_method: Option<String>,
    pub subscription_type: Option<String>,
    pub api_provider: Option<String>,
}

/// Running CLI processes by the app's request id; sending on the channel
/// kills that process.
#[derive(Default)]
pub struct CliProcesses(Mutex<HashMap<String, oneshot::Sender<()>>>);

const MAX_SCHEMA_LEN: usize = 8_000;
const STDERR_TAIL_BYTES: usize = 2_048;
const STATUS_TIMEOUT: Duration = Duration::from_secs(15);
/// After the process ends, how long to wait for the last stdout lines.
const DRAIN_TIMEOUT: Duration = Duration::from_secs(3);

/// Keeps a console window from flashing up for each run (the app is a GUI
/// process starting a console program).
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// The OS variables the child gets; everything else is cleared.
#[cfg(windows)]
const PASSED_ENV: &[&str] = &[
    "PATH",
    "SYSTEMROOT",
    "WINDIR",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "HOMEDRIVE",
    "HOMEPATH",
    "APPDATA",
    "LOCALAPPDATA",
    "PROGRAMDATA",
    "PROGRAMFILES",
    "COMSPEC",
    "PATHEXT",
    "USERNAME",
];
#[cfg(not(windows))]
const PASSED_ENV: &[&str] = &["PATH", "HOME", "TMPDIR", "USER", "LOGNAME", "LANG"];

/// Errors start with a code the TypeScript side maps to its message.
fn coded(code: &str, detail: impl std::fmt::Display) -> String {
    format!("{code}: {detail}")
}

/// The full argument list for one run. Built here from typed values only.
pub fn build_args(
    model: CliModel,
    effort: CliEffort,
    mode: &CliMode,
    system_prompt_file: &Path,
) -> Vec<OsString> {
    let mut args: Vec<OsString> = ["-p", "--output-format", "stream-json", "--verbose"]
        .iter()
        .map(OsString::from)
        .collect();
    if *mode == CliMode::Stream {
        args.push("--include-partial-messages".into());
    }
    for arg in [
        "--tools",
        "",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--no-session-persistence",
        "--safe-mode",
        "--model",
        model.id(),
        "--effort",
        effort.as_str(),
        "--system-prompt-file",
    ] {
        args.push(arg.into());
    }
    args.push(system_prompt_file.as_os_str().to_owned());
    if let CliMode::Structured { schema } = mode {
        args.push("--json-schema".into());
        args.push(schema.into());
    }
    args
}

/// The child's whole environment: the OS variables in `PASSED_ENV` that are
/// set, and `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`. Nothing else.
pub fn build_env(get: impl Fn(&str) -> Option<OsString>) -> Vec<(String, OsString)> {
    let mut env: Vec<(String, OsString)> = PASSED_ENV
        .iter()
        .filter_map(|key| get(key).map(|value| (key.to_string(), value)))
        .collect();
    env.push(("CLAUDE_CODE_DISABLE_CLAUDE_MDS".into(), "1".into()));
    env
}

/// `claude` on PATH (honouring PATHEXT on Windows, so `claude.exe` before
/// `claude.cmd`), else the native installer's `~/.local/bin`: an app started
/// from the desktop does not always see the shell's PATH.
fn resolve_claude() -> Option<PathBuf> {
    if let Ok(path) = which::which("claude") {
        return Some(path);
    }
    let home = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })?;
    let dir = PathBuf::from(home).join(".local").join("bin");
    let names: &[&str] = if cfg!(windows) {
        &["claude.exe", "claude.cmd"]
    } else {
        &["claude"]
    };
    names.iter().map(|name| dir.join(name)).find(|path| path.is_file())
}

fn base_command(binary: &Path, args: &[OsString], cwd: &Path) -> Command {
    let mut cmd = Command::new(binary);
    cmd.args(args)
        .env_clear()
        .envs(build_env(|key| std::env::var_os(key)))
        .current_dir(cwd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

pub fn validate_request_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok {
        Ok(())
    } else {
        Err(coded("CLI_FAILED", "invalid request id"))
    }
}

/// The schema is the one variable command-line argument: it must be a JSON
/// object (so it cannot read as a flag) and short enough for the command line.
pub fn validate_schema(schema: &str) -> Result<(), String> {
    if schema.len() > MAX_SCHEMA_LEN {
        return Err(coded(
            "CLI_FAILED",
            format!("response schema too long ({} chars)", schema.len()),
        ));
    }
    match serde_json::from_str::<serde_json::Value>(schema) {
        Ok(serde_json::Value::Object(_)) => Ok(()),
        _ => Err(coded("CLI_FAILED", "response schema is not a JSON object")),
    }
}

/// `claude --version` prints e.g. "2.1.306 (Claude Code)".
pub fn parse_version(stdout: &str) -> Option<String> {
    stdout.split_whitespace().next().map(str::to_string)
}

/// Reads only `loggedIn`, `authMethod`, `subscriptionType` and
/// `apiProvider` out of `claude auth status`'s JSON.
pub fn parse_auth_status(stdout: &str) -> AuthFields {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(stdout.trim()) else {
        return AuthFields::default();
    };
    let text = |key: &str| value.get(key).and_then(|v| v.as_str()).map(str::to_string);
    AuthFields {
        logged_in: value.get("loggedIn").and_then(|v| v.as_bool()).unwrap_or(false),
        auth_method: text("authMethod"),
        subscription_type: text("subscriptionType"),
        api_provider: text("apiProvider"),
    }
}

/// Runs `claude <args>` with the cleared environment and returns its stdout,
/// whatever the exit code (`auth status` exits non-zero when signed out).
async fn capture(binary: &Path, args: &[&str]) -> Option<String> {
    let args: Vec<OsString> = args.iter().map(OsString::from).collect();
    let mut cmd = base_command(binary, &args, &std::env::temp_dir());
    cmd.stdin(Stdio::null());
    let output = tokio::time::timeout(STATUS_TIMEOUT, cmd.output())
        .await
        .ok()?
        .ok()?;
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

async fn read_tail<R: AsyncRead + Unpin>(mut reader: R, max: usize) -> String {
    let mut tail: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 4096];
    loop {
        match reader.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                tail.extend_from_slice(&chunk[..n]);
                if tail.len() > max {
                    let cut = tail.len() - max;
                    tail.drain(..cut);
                }
            }
        }
    }
    String::from_utf8_lossy(&tail).into_owned()
}

/// Settings' status: installed or not, the version, and whether (and how)
/// the CLI is signed in.
#[tauri::command]
pub async fn claude_cli_status() -> Result<CliStatus, String> {
    let Some(binary) = resolve_claude() else {
        return Ok(CliStatus::default());
    };
    let version = capture(&binary, &["--version"])
        .await
        .and_then(|out| parse_version(&out));
    let auth = capture(&binary, &["auth", "status", "--json"])
        .await
        .map(|out| parse_auth_status(&out))
        .unwrap_or_default();
    Ok(CliStatus {
        installed: true,
        version,
        logged_in: auth.logged_in,
        auth_method: auth.auth_method,
        subscription_type: auth.subscription_type,
        api_provider: auth.api_provider,
    })
}

/// Runs the CLI once: every stdout line goes to `on_event` as it arrives,
/// then an `Exit` with the code and the end of stderr. Returns when the
/// process has ended, been cancelled, or failed to start.
#[tauri::command]
pub async fn claude_cli_run(
    app: AppHandle,
    req: CliRequest,
    on_event: Channel<CliEvent>,
    state: State<'_, CliProcesses>,
) -> Result<(), String> {
    validate_request_id(&req.request_id)?;
    if let CliMode::Structured { schema } = &req.mode {
        validate_schema(schema)?;
    }

    // Registered before anything slow (the PATH scan, the folders, the
    // prompt file, the spawn), so a Stop pressed in that window is not lost.
    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
    state.0.lock().await.insert(req.request_id.clone(), cancel_tx);
    let result = prepare_and_run(&app, &req, cancel_rx, &on_event).await;
    state.0.lock().await.remove(&req.request_id);
    result
}

async fn prepare_and_run(
    app: &AppHandle,
    req: &CliRequest,
    cancel_rx: oneshot::Receiver<()>,
    on_event: &Channel<CliEvent>,
) -> Result<(), String> {
    let binary = resolve_claude().ok_or_else(|| {
        coded(
            "CLI_NOT_FOUND",
            "the claude CLI is not installed, or not on PATH",
        )
    })?;

    // An empty folder the app owns: nothing in it for the CLI to pick up.
    let workdir = app
        .path()
        .app_data_dir()
        .map_err(|e| coded("CLI_FAILED", e))?
        .join("claude-cli");
    let prompt_dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| coded("CLI_FAILED", e))?
        .join("claude-cli-prompts");
    for dir in [&workdir, &prompt_dir] {
        tokio::fs::create_dir_all(dir)
            .await
            .map_err(|e| coded("CLI_FAILED", format!("cannot create {}: {e}", dir.display())))?;
    }
    let system_file = prompt_dir.join(format!("{}.txt", req.request_id));
    tokio::fs::write(&system_file, req.system_prompt.as_bytes())
        .await
        .map_err(|e| coded("CLI_FAILED", format!("cannot write the system prompt: {e}")))?;

    let result = run_process(&binary, req, &system_file, &workdir, on_event, cancel_rx).await;
    let _ = tokio::fs::remove_file(&system_file).await;
    result
}

async fn run_process(
    binary: &Path,
    req: &CliRequest,
    system_file: &Path,
    workdir: &Path,
    on_event: &Channel<CliEvent>,
    mut cancel_rx: oneshot::Receiver<()>,
) -> Result<(), String> {
    // Stopped before the process ever started. A sender dropped without
    // sending counts as stopped too: polling the receiver again after it
    // reported `Closed` would panic.
    if !matches!(cancel_rx.try_recv(), Err(oneshot::error::TryRecvError::Empty)) {
        let _ = on_event.send(CliEvent::Exit {
            code: None,
            stderr_tail: String::new(),
        });
        return Ok(());
    }

    let args = build_args(req.model, req.effort, &req.mode, system_file);
    let mut cmd = base_command(binary, &args, workdir);
    cmd.stdin(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            coded("CLI_NOT_FOUND", e)
        } else {
            coded("CLI_FAILED", format!("could not start claude: {e}"))
        }
    })?;

    // The prompt goes in on stdin, which is then closed: `claude -p` reads
    // its prompt until EOF. Written from a task so a large prompt cannot
    // block this one while the child is not reading yet.
    let mut stdin = child.stdin.take().expect("stdin is piped");
    let prompt = req.prompt.clone();
    let writer = tokio::spawn(async move {
        let _ = stdin.write_all(prompt.as_bytes()).await;
        let _ = stdin.shutdown().await;
    });

    let stderr = child.stderr.take().expect("stderr is piped");
    let mut stderr_task = tokio::spawn(read_tail(stderr, STDERR_TAIL_BYTES));

    let stdout = child.stdout.take().expect("stdout is piped");
    let lines = on_event.clone();
    let mut stdout_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout);
        let mut buf = Vec::new();
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(_) => {
                    let line = String::from_utf8_lossy(&buf).trim().to_string();
                    if !line.is_empty() {
                        let _ = lines.send(CliEvent::Line { json: line });
                    }
                }
            }
        }
    });

    let code = tokio::select! {
        status = child.wait() => status.ok().and_then(|s| s.code()),
        _ = cancel_rx => {
            kill_tree(&mut child).await;
            None
        }
    };

    // The child's pipes close when it ends; a grandchild that kept them open
    // must not hold the run up.
    if tokio::time::timeout(DRAIN_TIMEOUT, &mut stdout_task).await.is_err() {
        stdout_task.abort();
    }
    writer.abort();
    let stderr_tail = match tokio::time::timeout(Duration::from_secs(1), &mut stderr_task).await {
        Ok(Ok(tail)) => tail,
        _ => {
            stderr_task.abort();
            String::new()
        }
    };
    let _ = on_event.send(CliEvent::Exit { code, stderr_tail });
    Ok(())
}

/// Kills the run. On Windows an npm-installed CLI is `claude.cmd`, which runs
/// `node.exe` under `cmd.exe`: killing the child alone would leave the model
/// call running, so the whole process tree goes (`taskkill /T`).
async fn kill_tree(child: &mut tokio::process::Child) {
    #[cfg(windows)]
    if let Some(pid) = child.id() {
        let taskkill = std::env::var_os("SYSTEMROOT")
            .map(|root| PathBuf::from(root).join("System32").join("taskkill.exe"))
            .unwrap_or_else(|| PathBuf::from("taskkill.exe"));
        let mut cmd = Command::new(taskkill);
        cmd.args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW);
        let _ = tokio::time::timeout(Duration::from_secs(5), cmd.status()).await;
    }
    let _ = child.kill().await;
}

/// Stop: kills the run with this id, if it is still going.
#[tauri::command]
pub async fn claude_cli_cancel(
    request_id: String,
    state: State<'_, CliProcesses>,
) -> Result<(), String> {
    if let Some(cancel) = state.0.lock().await.remove(&request_id) {
        let _ = cancel.send(());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn strs(args: &[OsString]) -> Vec<String> {
        args.iter().map(|a| a.to_string_lossy().into_owned()).collect()
    }

    #[test]
    fn structured_args_carry_every_guard_flag_and_the_schema() {
        let schema = r#"{"type":"object"}"#.to_string();
        let args = strs(&build_args(
            CliModel::Sonnet,
            CliEffort::High,
            &CliMode::Structured { schema: schema.clone() },
            Path::new("prompt.txt"),
        ));
        assert_eq!(
            args,
            vec![
                "-p",
                "--output-format",
                "stream-json",
                "--verbose",
                "--tools",
                "",
                "--strict-mcp-config",
                "--disable-slash-commands",
                "--no-session-persistence",
                "--safe-mode",
                "--model",
                "claude-sonnet-5-5",
                "--effort",
                "high",
                "--system-prompt-file",
                "prompt.txt",
                "--json-schema",
                &schema,
            ]
        );
    }

    #[test]
    fn stream_args_add_partial_messages_and_no_schema() {
        let args = strs(&build_args(
            CliModel::Haiku,
            CliEffort::Low,
            &CliMode::Stream,
            Path::new("p.txt"),
        ));
        assert!(args.contains(&"--include-partial-messages".to_string()));
        assert!(!args.contains(&"--json-schema".to_string()));
        for flag in [
            "--safe-mode",
            "--strict-mcp-config",
            "--disable-slash-commands",
            "--no-session-persistence",
            "--tools",
        ] {
            assert!(args.contains(&flag.to_string()), "missing {flag}");
        }
    }

    #[test]
    fn models_map_to_the_pinned_ids() {
        assert_eq!(CliModel::Opus.id(), "claude-opus-5-5");
        assert_eq!(CliModel::Sonnet.id(), "claude-sonnet-5-5");
        assert_eq!(CliModel::Haiku.id(), "claude-haiku-5-5");
    }

    #[test]
    fn the_environment_carries_no_anthropic_or_claude_variable() {
        // Everything set, including what a Claude Code shell or a player's
        // own setup would leak.
        let env = build_env(|key| Some(OsString::from(format!("value-of-{key}"))));
        for (key, _) in &env {
            let upper = key.to_ascii_uppercase();
            let allowed = upper == "CLAUDE_CODE_DISABLE_CLAUDE_MDS";
            assert!(
                allowed || !(upper.starts_with("ANTHROPIC") || upper.starts_with("CLAUDE")),
                "{key} reached the child"
            );
        }
        // The getter is only ever asked for PASSED_ENV keys, so an
        // ANTHROPIC_API_KEY in the parent cannot be copied over.
        let keys: Vec<&str> = env.iter().map(|(k, _)| k.as_str()).collect();
        assert!(keys.contains(&"PATH"));
        assert!(keys.contains(&"CLAUDE_CODE_DISABLE_CLAUDE_MDS"));
        assert_eq!(env.len(), PASSED_ENV.len() + 1);
    }

    #[test]
    fn unset_os_variables_are_skipped() {
        let env = build_env(|key| (key == "PATH").then(|| OsString::from("x")));
        assert_eq!(
            env.iter().map(|(k, _)| k.as_str()).collect::<Vec<_>>(),
            vec!["PATH", "CLAUDE_CODE_DISABLE_CLAUDE_MDS"]
        );
    }

    #[test]
    fn auth_status_keeps_no_account_details() {
        let out = r#"{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty",
            "email":"someone@example.com","orgId":"org-1","orgName":"Someone's Org","subscriptionType":"max"}"#;
        let auth = parse_auth_status(out);
        assert!(auth.logged_in);
        assert_eq!(auth.auth_method.as_deref(), Some("claude.ai"));
        assert_eq!(auth.subscription_type.as_deref(), Some("max"));
        assert_eq!(auth.api_provider.as_deref(), Some("firstParty"));

        let status = CliStatus {
            installed: true,
            version: parse_version("2.1.306 (Claude Code)\n"),
            logged_in: auth.logged_in,
            auth_method: auth.auth_method,
            subscription_type: auth.subscription_type,
            api_provider: auth.api_provider,
        };
        let json = serde_json::to_string(&status).unwrap();
        assert!(!json.contains("example.com"));
        assert!(!json.contains("org-1"));
        assert_eq!(status.version.as_deref(), Some("2.1.306"));
    }

    #[test]
    fn auth_status_reads_signed_out_and_garbage_as_signed_out() {
        assert_eq!(parse_auth_status(r#"{"loggedIn":false}"#), AuthFields::default());
        assert_eq!(parse_auth_status("Not logged in"), AuthFields::default());
    }

    #[test]
    fn request_ids_and_schemas_are_validated() {
        assert!(validate_request_id("cli_lz3k9_0").is_ok());
        assert!(validate_request_id("").is_err());
        assert!(validate_request_id("../../evil").is_err());
        assert!(validate_request_id(&"a".repeat(65)).is_err());

        assert!(validate_schema(r#"{"type":"object"}"#).is_ok());
        assert!(validate_schema("--dangerously-skip-permissions").is_err());
        assert!(validate_schema("[1,2]").is_err());
        assert!(validate_schema(&format!(r#"{{"x":"{}"}}"#, "a".repeat(MAX_SCHEMA_LEN))).is_err());
    }

    #[test]
    fn requests_and_events_use_the_webview_shapes() {
        let req: CliRequest = serde_json::from_str(
            r#"{"requestId":"r1","model":"opus","effort":"xhigh",
                "mode":{"kind":"structured","schema":"{}"},
                "systemPrompt":"sys","prompt":"hi"}"#,
        )
        .unwrap();
        assert_eq!(req.model, CliModel::Opus);
        assert_eq!(req.effort, CliEffort::Xhigh);
        assert_eq!(req.mode, CliMode::Structured { schema: "{}".into() });

        let stream: CliRequest = serde_json::from_str(
            r#"{"requestId":"r2","model":"haiku","effort":"low","mode":{"kind":"stream"},
                "systemPrompt":"","prompt":""}"#,
        )
        .unwrap();
        assert_eq!(stream.mode, CliMode::Stream);

        assert_eq!(
            serde_json::to_string(&CliEvent::Line { json: "{}".into() }).unwrap(),
            r#"{"type":"line","json":"{}"}"#
        );
        assert_eq!(
            serde_json::to_string(&CliEvent::Exit { code: Some(1), stderr_tail: "x".into() }).unwrap(),
            r#"{"type":"exit","code":1,"stderrTail":"x"}"#
        );

        // An unknown model or effort is refused at the boundary.
        assert!(serde_json::from_str::<CliModel>(r#""claude-opus-5-5""#).is_err());
        assert!(serde_json::from_str::<CliEffort>(r#""max""#).is_err());
    }
}
