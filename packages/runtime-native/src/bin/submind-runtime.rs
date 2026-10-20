//! Headless host for the same readers/API used by Tauri. No agent execution.
use std::{env, fs, path::PathBuf};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("capture") => {
            let output = PathBuf::from(args.get(2).ok_or("capture requires an output directory")?);
            fs::create_dir_all(&output)?;
            let runtime = tokio::runtime::Runtime::new()?;
            runtime.block_on(async {
                let codex =
                    submind_runtime::codex_runtime::load_codex_runtime_feed(Some(100)).await;
                let copilot =
                    submind_runtime::copilot_runtime::load_copilot_runtime_feed(Some(100)).await;
                for (name, result) in [
                    (
                        "codex",
                        codex.map(|value| serde_json::to_value(value).unwrap()),
                    ),
                    (
                        "copilot",
                        copilot.map(|value| serde_json::to_value(value).unwrap()),
                    ),
                ] {
                    match result {
                        Ok(value) => fs::write(
                            output.join(format!("{name}.json")),
                            serde_json::to_vec(&value)?,
                        )?,
                        Err(error) => eprintln!("{name} observation failed: {error}"),
                    }
                }
                Ok::<(), Box<dyn std::error::Error>>(())
            })?;
        }
        Some("serve") => {
            let path = PathBuf::from(
                args.get(2)
                    .ok_or("serve requires an existing SQLite path")?,
            );
            if !path.is_file() {
                return Err("Database must exist".into());
            }
            if env::var("SUBMIND_API_TOKEN").map_or(true, |token| token.len() < 32) {
                return Err("SUBMIND_API_TOKEN must contain at least 32 characters".into());
            }
            submind_runtime::external_api::start_external_api_server(path);
            loop {
                std::thread::park();
            }
        }
        _ => return Err("Usage: submind-runtime capture <directory> | serve <database>".into()),
    }
    Ok(())
}
