pub use submind_runtime::copilot_runtime::CopilotRuntimeFeed;

#[tauri::command]
pub async fn load_copilot_runtime_feed(limit: Option<usize>) -> Result<CopilotRuntimeFeed, String> {
    submind_runtime::copilot_runtime::load_copilot_runtime_feed(limit).await
}
