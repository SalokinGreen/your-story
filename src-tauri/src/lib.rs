// The bridge to the player's own `claude` CLI (docs/claude-gm-design.md §4).
// Desktop only: a phone cannot run the CLI (decision 10).
#[cfg(desktop)]
mod claude_cli;
// Party mode's LAN server (docs/party-mode-design.md §4.1). Desktop only: it
// is the table, and phones are the players.
#[cfg(desktop)]
mod party_server;

#[cfg(desktop)]
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_opener::init());

  // One invoke_handler for every command: a second one would replace the first.
  #[cfg(desktop)]
  let builder = builder
    .manage(claude_cli::CliProcesses::default())
    .manage(party_server::PartyServer::default())
    // A full page load (a reload, or the webview navigating away) ends the
    // JavaScript that owns an open party table, so the LAN server stops with
    // it: it runs only while party mode is open.
    .on_page_load(|webview, payload| {
      if matches!(payload.event(), tauri::webview::PageLoadEvent::Started) {
        let app = webview.app_handle().clone();
        tauri::async_runtime::spawn(async move {
          if let Some(party) = app.try_state::<party_server::PartyServer>() {
            party.stop().await;
          }
        });
      }
    })
    .invoke_handler(tauri::generate_handler![
      claude_cli::claude_cli_status,
      claude_cli::claude_cli_run,
      claude_cli::claude_cli_cancel,
      party_server::party_start,
      party_server::party_send,
      party_server::party_kick,
      party_server::party_stop
    ]);

  builder
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
