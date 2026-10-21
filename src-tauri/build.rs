fn main() {
  // Naming the app's own commands in a manifest makes each of them need an
  // explicit permission (capabilities/default.json grants them to the main
  // window only). Without a manifest, every window could call every command.
  tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
    tauri_build::AppManifest::new().commands(&[
      "claude_cli_status",
      "claude_cli_run",
      "claude_cli_cancel",
    ]),
  ))
  .expect("failed to run tauri-build");
}
