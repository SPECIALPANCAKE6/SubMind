use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeSet;
use std::env;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

const DEFAULT_SESSION_LIMIT: usize = 24;
const MAX_TEXT_LENGTH: usize = 4000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopilotRuntimeFeed {
    profile_name: String,
    sessions: Vec<CopilotRuntimeSessionRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopilotRuntimeSessionRecord {
    id: String,
    title: String,
    workspace_path: Option<String>,
    storage_key: String,
    source: String,
    created_at: i64,
    updated_at: i64,
    responder_username: Option<String>,
    mode: Option<String>,
    model_identifier: Option<String>,
    model_name: Option<String>,
    latest_user_message: Option<String>,
    requests: Vec<CopilotRuntimeRequestRecord>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopilotRuntimeRequestRecord {
    id: String,
    timestamp: i64,
    message: String,
    response: Option<String>,
    command: Option<String>,
    model_id: Option<String>,
    referenced_files: Vec<String>,
    edited_files: Vec<String>,
    tool_names: Vec<String>,
}

#[derive(Debug, Default)]
struct CopilotSessionState {
    id: Option<String>,
    title: Option<String>,
    created_at: Option<i64>,
    updated_at: Option<i64>,
    responder_username: Option<String>,
    mode: Option<String>,
    model_identifier: Option<String>,
    model_name: Option<String>,
    latest_user_message: Option<String>,
    latest_user_message_at: Option<i64>,
    requests: Vec<CopilotRuntimeRequestRecord>,
}

#[tauri::command]
pub async fn load_copilot_runtime_feed(limit: Option<usize>) -> Result<CopilotRuntimeFeed, String> {
    let code_user_dir = resolve_code_user_dir().ok_or_else(|| {
        "Could not resolve the VS Code user directory from APPDATA, USERPROFILE, or HOME."
            .to_string()
    })?;

    let mut sessions = read_workspace_copilot_sessions(&code_user_dir.join("workspaceStorage"))?;
    sessions.append(&mut read_empty_window_copilot_sessions(
        &code_user_dir
            .join("globalStorage")
            .join("emptyWindowChatSessions"),
    )?);
    sessions.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then(right.created_at.cmp(&left.created_at))
    });

    if sessions.len() > limit.unwrap_or(DEFAULT_SESSION_LIMIT) {
        sessions.truncate(limit.unwrap_or(DEFAULT_SESSION_LIMIT));
    }

    Ok(CopilotRuntimeFeed {
        profile_name: resolve_profile_name(),
        sessions,
    })
}

fn resolve_code_user_dir() -> Option<PathBuf> {
    env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| {
            env::var_os("USERPROFILE")
                .map(PathBuf::from)
                .map(|home| home.join("AppData").join("Roaming"))
        })
        .or_else(|| {
            env::var_os("HOME")
                .map(PathBuf::from)
                .map(|home| home.join(".config"))
        })
        .map(|base| base.join("Code").join("User"))
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

fn decode_uri_component(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0usize;

    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let upper = from_hex(bytes[index + 1]);
            let lower = from_hex(bytes[index + 2]);

            if let (Some(upper), Some(lower)) = (upper, lower) {
                decoded.push(upper * 16 + lower);
                index += 3;
                continue;
            }
        }

        decoded.push(bytes[index]);
        index += 1;
    }

    String::from_utf8_lossy(&decoded).into_owned()
}

fn from_hex(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        b'A'..=b'F' => Some(value - b'A' + 10),
        _ => None,
    }
}

fn resolve_storage_uri(value: &str) -> String {
    if let Some(path) = value.strip_prefix("file://") {
        let decoded = decode_uri_component(path);

        if decoded.starts_with('/') && decoded.as_bytes().get(2) == Some(&b':') {
            return normalize_windows_path(&decoded[1..]);
        }

        return normalize_windows_path(&decoded);
    }

    if let Some(path) = value.strip_prefix("vscode-remote://") {
        if let Some(path_start) = path.find('/') {
            return normalize_windows_path(&decode_uri_component(&path[path_start..]));
        }
    }

    normalize_windows_path(value)
}

fn file_uri_to_path(value: &str) -> Option<PathBuf> {
    let resolved = resolve_storage_uri(value);

    if resolved.is_empty() {
        return None;
    }

    Some(PathBuf::from(resolved))
}

fn read_workspace_copilot_sessions(
    workspace_storage_root: &Path,
) -> Result<Vec<CopilotRuntimeSessionRecord>, String> {
    let mut sessions = Vec::new();

    if !workspace_storage_root.exists() {
        return Ok(sessions);
    }

    let entries = fs::read_dir(workspace_storage_root)
        .map_err(|error| format!("Failed to read VS Code workspace storage: {error}"))?;

    for entry_result in entries {
        let entry = match entry_result {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if !file_type.is_dir() {
            continue;
        }

        let storage_dir = entry.path();
        let chat_sessions_dir = storage_dir.join("chatSessions");

        if !chat_sessions_dir.exists() {
            continue;
        }

        let storage_key = entry.file_name().to_string_lossy().to_string();
        let workspace_path = resolve_workspace_locator(&storage_dir);
        let mut parsed_sessions = read_chat_session_directory(
            &chat_sessions_dir,
            workspace_path.as_deref(),
            &storage_key,
            "workspace",
        )?;
        sessions.append(&mut parsed_sessions);
    }

    Ok(sessions)
}

fn read_empty_window_copilot_sessions(
    empty_window_root: &Path,
) -> Result<Vec<CopilotRuntimeSessionRecord>, String> {
    if !empty_window_root.exists() {
        return Ok(Vec::new());
    }

    read_chat_session_directory(empty_window_root, None, "empty-window", "empty_window")
}

fn resolve_workspace_locator(storage_dir: &Path) -> Option<String> {
    let workspace_json_path = storage_dir.join("workspace.json");

    if !workspace_json_path.exists() {
        return None;
    }

    let file = File::open(&workspace_json_path).ok()?;
    let value: Value = serde_json::from_reader(file).ok()?;

    if let Some(folder) = value.get("folder").and_then(Value::as_str) {
        return Some(folder.to_string());
    }

    let workspace_uri = value.get("workspace").and_then(Value::as_str)?;
    resolve_workspace_file_folder(workspace_uri).or_else(|| Some(workspace_uri.to_string()))
}

fn resolve_workspace_file_folder(workspace_uri: &str) -> Option<String> {
    let workspace_path = file_uri_to_path(workspace_uri)?;

    if !workspace_path.exists() {
        return None;
    }

    let file = File::open(&workspace_path).ok()?;
    let value: Value = serde_json::from_reader(file).ok()?;
    let folders = value.get("folders").and_then(Value::as_array)?;

    if folders.len() != 1 {
        return Some(workspace_uri.to_string());
    }

    let folder = folders.first()?;

    if let Some(uri) = folder.get("uri").and_then(Value::as_str) {
        return Some(uri.to_string());
    }

    let path = folder.get("path").and_then(Value::as_str)?;

    if path.contains("://") {
        return Some(path.to_string());
    }

    let resolved_path = workspace_path.parent()?.join(path);
    Some(normalize_windows_path(
        resolved_path.to_string_lossy().as_ref(),
    ))
}

fn read_chat_session_directory(
    chat_sessions_dir: &Path,
    workspace_path: Option<&str>,
    storage_key: &str,
    source: &str,
) -> Result<Vec<CopilotRuntimeSessionRecord>, String> {
    let mut sessions = Vec::new();
    let entries = fs::read_dir(chat_sessions_dir)
        .map_err(|error| format!("Failed to read Copilot chat sessions: {error}"))?;

    for entry_result in entries {
        let entry = match entry_result {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default();

        let session = match extension {
            "jsonl" => parse_jsonl_chat_session(&path, workspace_path, storage_key, source),
            "json" => parse_json_chat_session(&path, workspace_path, storage_key, source),
            _ => None,
        };

        if let Some(session) = session {
            sessions.push(session);
        }
    }

    Ok(sessions)
}

fn parse_jsonl_chat_session(
    path: &Path,
    workspace_path: Option<&str>,
    storage_key: &str,
    source: &str,
) -> Option<CopilotRuntimeSessionRecord> {
    let file = File::open(path).ok()?;
    let reader = BufReader::new(file);
    let mut state = CopilotSessionState::default();

    for line_result in reader.lines() {
        let line = line_result.ok()?;

        if line.trim().is_empty() {
            continue;
        }

        let value = serde_json::from_str::<Value>(&line).ok()?;
        let kind = value
            .get("kind")
            .and_then(Value::as_i64)
            .unwrap_or_default();

        match kind {
            0 => {
                if let Some(session_value) = value.get("v") {
                    merge_session_value(&mut state, session_value);
                }
            }
            1 => {
                if matches_path(&value, &["customTitle"]) {
                    if let Some(title) = value.get("v").and_then(Value::as_str) {
                        state.title = Some(title.trim().to_string());
                    }
                }
            }
            2 => {
                if matches_path(&value, &["requests"]) {
                    if let Some(requests) = value.get("v").and_then(Value::as_array) {
                        for request in requests {
                            if let Some(parsed_request) = parse_request(request) {
                                add_request(&mut state, parsed_request);
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }

    finalize_session_state(&path, workspace_path, storage_key, source, state)
}

fn parse_json_chat_session(
    path: &Path,
    workspace_path: Option<&str>,
    storage_key: &str,
    source: &str,
) -> Option<CopilotRuntimeSessionRecord> {
    let file = File::open(path).ok()?;
    let value: Value = serde_json::from_reader(file).ok()?;
    let mut state = CopilotSessionState::default();
    merge_session_value(&mut state, &value);

    finalize_session_state(path, workspace_path, storage_key, source, state)
}

fn matches_path(value: &Value, expected: &[&str]) -> bool {
    value
        .get("k")
        .and_then(Value::as_array)
        .map(|items| {
            items.len() == expected.len()
                && items
                    .iter()
                    .zip(expected.iter())
                    .all(|(item, expected)| item.as_str() == Some(*expected))
        })
        .unwrap_or(false)
}

fn merge_session_value(state: &mut CopilotSessionState, session_value: &Value) {
    if state.id.is_none() {
        state.id = session_value
            .get("sessionId")
            .and_then(Value::as_str)
            .map(str::to_string);
    }

    if state.created_at.is_none() {
        state.created_at = session_value.get("creationDate").and_then(Value::as_i64);
    }

    if let Some(last_message_date) = session_value.get("lastMessageDate").and_then(Value::as_i64) {
        state.updated_at = Some(state.updated_at.unwrap_or_default().max(last_message_date));
    }

    if state.responder_username.is_none() {
        state.responder_username = session_value
            .get("responderUsername")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .map(str::to_string);
    }

    if state.mode.is_none() {
        state.mode = session_value
            .pointer("/inputState/mode/id")
            .and_then(Value::as_str)
            .map(str::to_string);
    }

    if state.model_identifier.is_none() {
        state.model_identifier = session_value
            .pointer("/inputState/selectedModel/identifier")
            .and_then(Value::as_str)
            .map(str::to_string);
    }

    if state.model_name.is_none() {
        state.model_name = session_value
            .pointer("/inputState/selectedModel/metadata/name")
            .and_then(Value::as_str)
            .map(str::to_string);
    }

    if let Some(requests) = session_value.get("requests").and_then(Value::as_array) {
        for request in requests {
            if let Some(parsed_request) = parse_request(request) {
                add_request(state, parsed_request);
            }
        }
    }
}

fn add_request(state: &mut CopilotSessionState, request: CopilotRuntimeRequestRecord) {
    if let Some(existing_index) = state.requests.iter().position(|item| item.id == request.id) {
        state.requests[existing_index] = request.clone();
    } else {
        state.requests.push(request.clone());
    }

    state.updated_at = Some(state.updated_at.unwrap_or_default().max(request.timestamp));

    if !request.message.trim().is_empty() {
        let should_replace_latest = state
            .latest_user_message_at
            .map(|value| request.timestamp >= value)
            .unwrap_or(true);

        if should_replace_latest {
            state.latest_user_message = Some(summarize_text(&request.message, 220));
            state.latest_user_message_at = Some(request.timestamp);
        }
    }
}

fn finalize_session_state(
    path: &Path,
    workspace_path: Option<&str>,
    storage_key: &str,
    source: &str,
    mut state: CopilotSessionState,
) -> Option<CopilotRuntimeSessionRecord> {
    state
        .requests
        .sort_by(|left, right| right.timestamp.cmp(&left.timestamp));
    let file_stem = path.file_stem()?.to_string_lossy().to_string();
    let created_at = state.created_at?;
    let updated_at = state.updated_at.unwrap_or(created_at).max(created_at);
    let latest_user_message = state.latest_user_message.clone();
    let title = state
        .title
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            latest_user_message
                .clone()
                .map(|value| summarize_text(&value, 120))
                .unwrap_or_else(|| "GitHub Copilot chat".to_string())
        });

    Some(CopilotRuntimeSessionRecord {
        id: state.id.unwrap_or(file_stem),
        title,
        workspace_path: workspace_path.map(str::to_string),
        storage_key: storage_key.to_string(),
        source: source.to_string(),
        created_at,
        updated_at,
        responder_username: state.responder_username,
        mode: state.mode,
        model_identifier: state.model_identifier,
        model_name: state.model_name,
        latest_user_message,
        requests: state.requests,
    })
}

fn parse_request(request: &Value) -> Option<CopilotRuntimeRequestRecord> {
    let id = request
        .get("requestId")
        .and_then(Value::as_str)?
        .to_string();
    let timestamp = request.get("timestamp").and_then(Value::as_i64)?;
    let message = extract_request_message(request);

    if message.trim().is_empty() {
        return None;
    }

    Some(CopilotRuntimeRequestRecord {
        id,
        timestamp,
        message: summarize_text(&message, MAX_TEXT_LENGTH),
        response: extract_response_text(request)
            .map(|value| summarize_text(&value, MAX_TEXT_LENGTH)),
        command: extract_command(request),
        model_id: request
            .pointer("/result/resolvedModel")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| {
                request
                    .get("modelId")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            }),
        referenced_files: extract_referenced_files(request),
        edited_files: extract_edited_files(request),
        tool_names: extract_tool_names(request),
    })
}

fn extract_request_message(request: &Value) -> String {
    if let Some(text) = request.pointer("/message/text").and_then(Value::as_str) {
        return text.to_string();
    }

    let mut parts = Vec::new();

    if let Some(items) = request.pointer("/message/parts").and_then(Value::as_array) {
        for item in items {
            if let Some(text) = item.get("text").and_then(Value::as_str) {
                if !text.trim().is_empty() {
                    parts.push(text.trim().to_string());
                }
            }
        }
    }

    parts.join("\n")
}

fn extract_response_text(request: &Value) -> Option<String> {
    if let Some(rounds) = request
        .pointer("/result/metadata/toolCallRounds")
        .and_then(Value::as_array)
    {
        let mut responses = Vec::new();

        for round in rounds {
            if let Some(response) = round.get("response").and_then(Value::as_str) {
                if !response.trim().is_empty() {
                    responses.push(response.trim().to_string());
                }
            }
        }

        if !responses.is_empty() {
            return Some(responses.join("\n\n"));
        }
    }

    let items = request.get("response").and_then(Value::as_array)?;
    let mut response = Vec::new();

    for item in items {
        let kind = item.get("kind").and_then(Value::as_str).unwrap_or_default();

        if matches!(
            kind,
            "thinking"
                | "toolInvocationSerialized"
                | "inlineReference"
                | "codeblockUri"
                | "textEditGroup"
                | "undoStop"
                | "mcpServersStarting"
        ) {
            continue;
        }

        if let Some(value) = item.get("value").and_then(Value::as_str) {
            if !value.trim().is_empty() {
                response.push(value.trim().to_string());
            }
        }
    }

    if response.is_empty() {
        None
    } else {
        Some(response.join("\n"))
    }
}

fn extract_command(request: &Value) -> Option<String> {
    request
        .pointer("/slashCommand/name")
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn extract_referenced_files(request: &Value) -> Vec<String> {
    let mut files = BTreeSet::new();

    if let Some(references) = request.get("contentReferences").and_then(Value::as_array) {
        for reference in references {
            if let Some(path) = reference.get("reference").and_then(extract_fs_path) {
                files.insert(path);
            }
        }
    }

    if let Some(variables) = request
        .pointer("/variableData/variables")
        .and_then(Value::as_array)
    {
        for variable in variables {
            if let Some(path) = variable.get("value").and_then(extract_fs_path) {
                files.insert(path);
                continue;
            }

            if let Some(path) = variable.pointer("/value/uri").and_then(extract_fs_path) {
                files.insert(path);
            }
        }
    }

    files.into_iter().collect()
}

fn extract_edited_files(request: &Value) -> Vec<String> {
    let mut files = BTreeSet::new();

    if let Some(response_items) = request.get("response").and_then(Value::as_array) {
        for item in response_items {
            if item.get("kind").and_then(Value::as_str) != Some("textEditGroup") {
                continue;
            }

            if let Some(path) = item.get("uri").and_then(extract_fs_path) {
                files.insert(path);
            }
        }
    }

    files.into_iter().collect()
}

fn extract_tool_names(request: &Value) -> Vec<String> {
    let mut names = BTreeSet::new();

    if let Some(rounds) = request
        .pointer("/result/metadata/toolCallRounds")
        .and_then(Value::as_array)
    {
        for round in rounds {
            if let Some(tool_calls) = round.get("toolCalls").and_then(Value::as_array) {
                for tool_call in tool_calls {
                    if let Some(name) = tool_call.get("name").and_then(Value::as_str) {
                        names.insert(name.to_string());
                    }
                }
            }
        }
    }

    names.into_iter().collect()
}

fn extract_fs_path(value: &Value) -> Option<String> {
    if let Some(fs_path) = value.get("fsPath").and_then(Value::as_str) {
        return Some(normalize_windows_path(fs_path));
    }

    if let Some(external) = value.get("external").and_then(Value::as_str) {
        return Some(resolve_storage_uri(external));
    }

    if let Some(path) = value.get("path").and_then(Value::as_str) {
        return Some(resolve_storage_uri(path));
    }

    None
}

fn summarize_text(value: &str, max_length: usize) -> String {
    let normalized = value.replace('\r', "").replace('\n', " ");
    let normalized = normalized.split_whitespace().collect::<Vec<_>>().join(" ");

    if normalized.len() <= max_length {
        return normalized;
    }

    format!("{}…", normalized[..max_length.saturating_sub(1)].trim_end())
}
