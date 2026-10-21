fn main() {
  // App commands get generated `allow-<command>` permissions, so they only
  // work where capabilities/default.json grants them (the main window).
  tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
    tauri_build::AppManifest::new().commands(&["party_start", "party_send", "party_kick", "party_stop"]),
  ))
  .expect("failed to run tauri-build");
}
