mod codex_runtime;
mod copilot_runtime;
mod external_api;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            external_api::start_external_api_server(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            copilot_runtime::load_copilot_runtime_feed,
            codex_runtime::load_codex_runtime_feed
        ])
        .run(tauri::generate_context!())
        .expect("error while running SubMind desktop");
}
