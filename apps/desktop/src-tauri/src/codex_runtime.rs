pub use submind_runtime::codex_runtime::CodexRuntimeFeed;

#[tauri::command]
pub async fn load_codex_runtime_feed(limit: Option<usize>) -> Result<CodexRuntimeFeed, String> {
    submind_runtime::codex_runtime::load_codex_runtime_feed(limit).await
}
