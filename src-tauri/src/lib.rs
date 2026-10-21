mod party_server;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_opener::init())
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
      party_server::party_start,
      party_server::party_send,
      party_server::party_kick,
      party_server::party_stop,
    ])
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
