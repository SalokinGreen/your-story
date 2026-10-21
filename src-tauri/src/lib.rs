// The bridge to the player's own `claude` CLI (docs/claude-gm-design.md §4).
// Desktop only: a phone cannot run the CLI (decision 10).
#[cfg(desktop)]
mod claude_cli;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_opener::init());

  #[cfg(desktop)]
  let builder = builder
    .manage(claude_cli::CliProcesses::default())
    .invoke_handler(tauri::generate_handler![
      claude_cli::claude_cli_status,
      claude_cli::claude_cli_run,
      claude_cli::claude_cli_cancel
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
