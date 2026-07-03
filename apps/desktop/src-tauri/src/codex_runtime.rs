use serde::Serialize;
use serde_json::{json, Value};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::Row;
use std::env;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

const DEFAULT_THREAD_LIMIT: usize = 24;
const MAX_EVENTS_PER_THREAD: usize = 32;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRuntimeFeed {
    profile_name: String,
    threads: Vec<CodexRuntimeThreadRecord>,
    events: Vec<CodexRuntimeEventRecord>,
    file_changes: Vec<CodexRuntimeFileChangeRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRuntimeThreadRecord {
    id: String,
    title: String,
    cwd: String,
    created_at: i64,
    updated_at: i64,
    git_branch: Option<String>,
    git_origin_url: Option<String>,
    first_user_message: Option<String>,
    descriptor_hints: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRuntimeEventRecord {
    id: String,
    thread_id: String,
    timestamp: String,
    r#type: String,
    summary: String,
    metadata: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexRuntimeFileChangeRecord {
    id: String,
    thread_id: String,
    event_id: String,
    timestamp: String,
    path: String,
    change_type: String,
    summary: Option<String>,
}

#[derive(Debug)]
struct CodexThreadRow {
    id: String,
    title: String,
    cwd: String,
    created_at: i64,
    updated_at: i64,
    git_branch: Option<String>,
    git_origin_url: Option<String>,
    first_user_message: Option<String>,
    rollout_path: Option<String>,
}

#[tauri::command]
pub async fn load_codex_runtime_feed(limit: Option<usize>) -> Result<CodexRuntimeFeed, String> {
    let codex_dir = resolve_codex_dir().ok_or_else(|| {
        "Could not resolve the local Codex home directory from USERPROFILE or HOME.".to_string()
    })?;
    let state_db_path = codex_dir.join("state_5.sqlite");

    if !state_db_path.exists() {
        return Ok(CodexRuntimeFeed {
            profile_name: resolve_profile_name(),
            threads: Vec::new(),
            events: Vec::new(),
            file_changes: Vec::new(),
        });
    }

    let thread_rows =
        read_codex_threads(&state_db_path, limit.unwrap_or(DEFAULT_THREAD_LIMIT)).await?;
    let threads: Vec<CodexRuntimeThreadRecord> = thread_rows
        .iter()
        .map(|row| CodexRuntimeThreadRecord {
            id: row.id.clone(),
            title: normalize_title(&row.title, &row.first_user_message),
            cwd: normalize_windows_path(&row.cwd),
            created_at: row.created_at,
            updated_at: row.updated_at,
            git_branch: row.git_branch.clone(),
            git_origin_url: row.git_origin_url.clone(),
            first_user_message: row.first_user_message.clone(),
            descriptor_hints: build_descriptor_hints(Path::new(&normalize_windows_path(&row.cwd))),
        })
        .collect();

    let mut events = Vec::new();
    let mut file_changes = Vec::new();

    for row in &thread_rows {
        let (mut thread_events, mut thread_file_changes) = parse_rollout_file(row);
        events.append(&mut thread_events);
        file_changes.append(&mut thread_file_changes);
    }

    events.sort_by(|left, right| right.timestamp.cmp(&left.timestamp));
    file_changes.sort_by(|left, right| right.timestamp.cmp(&left.timestamp));

    Ok(CodexRuntimeFeed {
        profile_name: resolve_profile_name(),
        threads,
        events,
        file_changes,
    })
}

fn resolve_codex_dir() -> Option<PathBuf> {
    env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .or_else(|| env::var_os("HOME").map(PathBuf::from))
        .map(|home| home.join(".codex"))
}

fn resolve_profile_name() -> String {
    env::var("USERNAME")
        .ok()
        .or_else(|| env::var("USER").ok())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "Operator".to_string())
}

fn normalize_windows_path(value: &str) -> String {
    value
        .strip_prefix(r"\\?\")
        .unwrap_or(value)
        .replace('\\', "/")
}

fn normalize_title(title: &str, first_user_message: &Option<String>) -> String {
    let trimmed_title = title.trim();

    if !trimmed_title.is_empty() {
        return trimmed_title.to_string();
    }

    first_user_message
        .as_ref()
        .map(|message| summarize_text(message, 120))
        .filter(|message| !message.is_empty())
        .unwrap_or_else(|| "Codex thread".to_string())
}

fn build_descriptor_hints(cwd: &Path) -> Vec<String> {
    let mut hints = Vec::new();

    if cwd.join("package.json").exists() {
        hints.push("node".to_string());
    }

    if cwd.join("tsconfig.json").exists() {
        hints.push("typescript".to_string());
    }

    if cwd.join("Cargo.toml").exists() {
        hints.push("rust".to_string());
    }

    if cwd.join("pnpm-lock.yaml").exists() {
        hints.push("pnpm".to_string());
    } else if cwd.join("package-lock.json").exists() {
        hints.push("npm".to_string());
    }

    if cwd.join("src-tauri").join("tauri.conf.json").exists()
        || cwd.join("tauri.conf.json").exists()
    {
        hints.push("tauri".to_string());
    }

    if cwd.join(".git").exists() {
        hints.push("git".to_string());
    }

    if hints.is_empty() {
        hints.push("workspace".to_string());
    }

    hints
}

async fn read_codex_threads(
    state_db_path: &Path,
    limit: usize,
) -> Result<Vec<CodexThreadRow>, String> {
    let options = SqliteConnectOptions::new()
        .filename(state_db_path)
        .create_if_missing(false)
        .read_only(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|error| format!("Failed to open Codex state DB: {error}"))?;
    let rows = sqlx::query(
    "SELECT id, title, cwd, created_at, updated_at, git_branch, git_origin_url, first_user_message, rollout_path
     FROM threads
     WHERE archived = 0
     ORDER BY updated_at DESC
     LIMIT ?1",
  )
  .bind(limit as i64)
  .fetch_all(&pool)
  .await
  .map_err(|error| format!("Failed to execute Codex thread query: {error}"))?;
    let mut threads = Vec::new();

    for row in rows {
        let thread = CodexThreadRow {
            id: row.get::<String, _>("id"),
            title: row
                .try_get::<Option<String>, _>("title")
                .map_err(|error| format!("Failed to read Codex thread title: {error}"))?
                .unwrap_or_default(),
            cwd: row
                .try_get::<Option<String>, _>("cwd")
                .map_err(|error| format!("Failed to read Codex thread cwd: {error}"))?
                .unwrap_or_default(),
            created_at: row
                .try_get("created_at")
                .map_err(|error| format!("Failed to read Codex thread created_at: {error}"))?,
            updated_at: row
                .try_get("updated_at")
                .map_err(|error| format!("Failed to read Codex thread updated_at: {error}"))?,
            git_branch: row
                .try_get("git_branch")
                .map_err(|error| format!("Failed to read Codex thread git_branch: {error}"))?,
            git_origin_url: row
                .try_get("git_origin_url")
                .map_err(|error| format!("Failed to read Codex thread git_origin_url: {error}"))?,
            first_user_message: row.try_get("first_user_message").map_err(|error| {
                format!("Failed to read Codex thread first_user_message: {error}")
            })?,
            rollout_path: row
                .try_get("rollout_path")
                .map_err(|error| format!("Failed to read Codex thread rollout_path: {error}"))?,
        };
        let normalized_cwd = normalize_windows_path(&thread.cwd);

        if normalized_cwd.is_empty() || !Path::new(&normalized_cwd).exists() {
            continue;
        }

        threads.push(CodexThreadRow {
            cwd: normalized_cwd,
            ..thread
        });
    }

    pool.close().await;

    Ok(threads)
}

fn parse_rollout_file(
    thread: &CodexThreadRow,
) -> (
    Vec<CodexRuntimeEventRecord>,
    Vec<CodexRuntimeFileChangeRecord>,
) {
    let Some(raw_rollout_path) = &thread.rollout_path else {
        return (
            create_thread_opened_event(thread).into_iter().collect(),
            Vec::new(),
        );
    };
    let rollout_path = PathBuf::from(raw_rollout_path);

    if !rollout_path.exists() {
        return (
            create_thread_opened_event(thread).into_iter().collect(),
            Vec::new(),
        );
    }

    let Ok(file) = File::open(&rollout_path) else {
        return (
            create_thread_opened_event(thread).into_iter().collect(),
            Vec::new(),
        );
    };
    let reader = BufReader::new(file);
    let mut events = Vec::new();
    let mut file_changes = Vec::new();
    let mut patch_counter = 0usize;
    let mut event_counter = 0usize;

    if let Some(opened_event) = create_thread_opened_event(thread) {
        events.push(opened_event);
    }

    for line_result in reader.lines() {
        let Ok(line) = line_result else {
            continue;
        };
        let Ok(item) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        let Some(item_type) = item.get("type").and_then(Value::as_str) else {
            continue;
        };

        match item_type {
            "event_msg" => {
                if let Some(event) = parse_event_message_record(thread, &item, &mut event_counter) {
                    events.push(event);
                }
            }
            "response_item" => {
                if let Some((mut patch_event, mut patch_changes)) =
                    parse_patch_record(thread, &item, &mut patch_counter)
                {
                    patch_event.id = format!("event-{}-patch-{}", thread.id, patch_counter);
                    for (index, file_change) in patch_changes.iter_mut().enumerate() {
                        file_change.id = format!(
                            "file-change-{}-patch-{}-{}",
                            thread.id, patch_counter, index
                        );
                        file_change.event_id = patch_event.id.clone();
                    }
                    events.push(patch_event);
                    file_changes.append(&mut patch_changes);
                }
            }
            _ => {}
        }
    }

    if events.len() > MAX_EVENTS_PER_THREAD {
        let first_event = events.first().cloned();
        let keep_count = MAX_EVENTS_PER_THREAD.saturating_sub(usize::from(first_event.is_some()));
        let start_index = events.len().saturating_sub(keep_count);
        let mut trimmed_events = first_event.into_iter().collect::<Vec<_>>();
        trimmed_events.extend(events.into_iter().skip(start_index));
        events = trimmed_events;
    }

    (events, file_changes)
}

fn create_thread_opened_event(thread: &CodexThreadRow) -> Option<CodexRuntimeEventRecord> {
    Some(CodexRuntimeEventRecord {
        id: format!("event-{}-opened", thread.id),
        thread_id: thread.id.clone(),
        timestamp: unix_seconds_to_iso(thread.created_at)?,
        r#type: "thread_opened".to_string(),
        summary: format!(
            "Opened Codex thread: {}.",
            normalize_title(&thread.title, &thread.first_user_message)
        ),
        metadata: json!({
          "cwd": thread.cwd,
          "gitBranch": thread.git_branch,
          "gitOriginUrl": thread.git_origin_url
        }),
    })
}

fn parse_event_message_record(
    thread: &CodexThreadRow,
    item: &Value,
    event_counter: &mut usize,
) -> Option<CodexRuntimeEventRecord> {
    let timestamp = item.get("timestamp").and_then(Value::as_str)?.to_string();
    let payload = item.get("payload")?;
    let payload_type = payload.get("type").and_then(Value::as_str)?;
    *event_counter += 1;

    match payload_type {
        "user_message" => {
            let message = payload
                .get("message")
                .and_then(Value::as_str)
                .unwrap_or_default();

            Some(CodexRuntimeEventRecord {
                id: format!("event-{}-user-{}", thread.id, event_counter),
                thread_id: thread.id.clone(),
                timestamp,
                r#type: "user_message".to_string(),
                summary: summarize_text(message, 180),
                metadata: json!({
                  "images": payload.get("images"),
                  "localImages": payload.get("local_images")
                }),
            })
        }
        "task_started" => Some(CodexRuntimeEventRecord {
            id: format!("event-{}-task-started-{}", thread.id, event_counter),
            thread_id: thread.id.clone(),
            timestamp,
            r#type: "task_started".to_string(),
            summary: "Started a Codex turn.".to_string(),
            metadata: json!({
              "turnId": payload.get("turn_id"),
              "modelContextWindow": payload.get("model_context_window")
            }),
        }),
        "task_complete" => {
            let last_agent_message = payload
                .get("last_agent_message")
                .and_then(Value::as_str)
                .unwrap_or_default();

            Some(CodexRuntimeEventRecord {
                id: format!("event-{}-task-complete-{}", thread.id, event_counter),
                thread_id: thread.id.clone(),
                timestamp,
                r#type: "task_complete".to_string(),
                summary: summarize_text(last_agent_message, 180),
                metadata: json!({
                  "turnId": payload.get("turn_id")
                }),
            })
        }
        _ => None,
    }
}

fn parse_patch_record(
    thread: &CodexThreadRow,
    item: &Value,
    patch_counter: &mut usize,
) -> Option<(CodexRuntimeEventRecord, Vec<CodexRuntimeFileChangeRecord>)> {
    let payload = item.get("payload")?;
    if payload.get("type").and_then(Value::as_str)? != "custom_tool_call_output" {
        return None;
    }

    let raw_output = payload.get("output").and_then(Value::as_str)?;
    let tool_output = decode_tool_output(raw_output);
    let parsed_files = extract_patch_file_changes(&tool_output);

    if parsed_files.is_empty() {
        return None;
    }

    *patch_counter += 1;
    let timestamp = item.get("timestamp").and_then(Value::as_str)?.to_string();
    let patch_event = CodexRuntimeEventRecord {
        id: String::new(),
        thread_id: thread.id.clone(),
        timestamp: timestamp.clone(),
        r#type: "apply_patch".to_string(),
        summary: if parsed_files.len() == 1 {
            format!("Applied patch to {}.", parsed_files[0].1)
        } else {
            format!("Applied patch touching {} files.", parsed_files.len())
        },
        metadata: json!({
          "tool": "apply_patch",
          "fileCount": parsed_files.len()
        }),
    };
    let file_changes = parsed_files
        .into_iter()
        .map(|(change_type, path)| CodexRuntimeFileChangeRecord {
            id: String::new(),
            thread_id: thread.id.clone(),
            event_id: String::new(),
            timestamp: timestamp.clone(),
            path: path.clone(),
            change_type,
            summary: Some(format!("apply_patch updated {}", path)),
        })
        .collect();

    Some((patch_event, file_changes))
}

fn decode_tool_output(raw_output: &str) -> String {
    serde_json::from_str::<Value>(raw_output)
        .ok()
        .and_then(|value| {
            value
                .get("output")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| raw_output.to_string())
}

fn extract_patch_file_changes(output: &str) -> Vec<(String, String)> {
    let mut changes = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();

        if trimmed.len() < 3 {
            continue;
        }

        let Some((code, remainder)) = trimmed.split_once(' ') else {
            continue;
        };
        let change_type = match code {
            "A" => "added",
            "M" => "updated",
            "D" => "deleted",
            "R" => "renamed",
            _ => continue,
        };
        let path = remainder
            .split(" -> ")
            .last()
            .map(str::trim)
            .unwrap_or(remainder)
            .to_string();

        if path.is_empty() {
            continue;
        }

        changes.push((change_type.to_string(), path));
    }

    changes
}

fn summarize_text(value: &str, max_length: usize) -> String {
    let normalized = value
        .replace('\r', " ")
        .replace('\n', " ")
        .replace('#', " ")
        .replace('*', " ")
        .replace('`', " ")
        .replace('[', " ")
        .replace(']', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    if normalized.is_empty() {
        return "Codex activity updated this thread.".to_string();
    }

    if normalized.len() <= max_length {
        return normalized;
    }

    format!(
        "{}…",
        normalized
            .chars()
            .take(max_length.saturating_sub(1))
            .collect::<String>()
    )
}

fn unix_seconds_to_iso(value: i64) -> Option<String> {
    use std::time::{Duration, UNIX_EPOCH};

    let duration = Duration::from_secs(value.max(0) as u64);
    let timestamp = UNIX_EPOCH.checked_add(duration)?;
    let datetime: chrono::DateTime<chrono::Utc> = timestamp.into();
    Some(datetime.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
}
