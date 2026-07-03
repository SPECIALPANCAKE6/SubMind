use chrono::SecondsFormat;
use regex::Regex;
use serde::Serialize;
use serde_json::{json, Map, Value};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions, SqliteRow};
use sqlx::{Row, SqlitePool};
use std::env;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const DEFAULT_API_PORT: u16 = 47821;
const MAX_REQUEST_BYTES: usize = 16 * 1024;
const MAX_PROJECT_LIST_LIMIT: usize = 100;
const MIN_TOKEN_LENGTH: usize = 32;

#[derive(Clone)]
struct ExternalApiConfig {
    bind_addr: SocketAddr,
    token: String,
    db_path: PathBuf,
}

#[derive(Debug)]
struct HttpRequest {
    method: String,
    target: String,
    headers: Vec<(String, String)>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ApiProject {
    kind: &'static str,
    id: String,
    created_at: String,
    updated_at: String,
    profile_id: String,
    name: String,
    description: Option<String>,
    summary: Option<String>,
    workspace_path: Option<String>,
    repository_remote: Option<String>,
    descriptors: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ApiSession {
    kind: &'static str,
    id: String,
    created_at: String,
    updated_at: String,
    profile_id: String,
    project_id: String,
    status: String,
    summary: Option<String>,
    started_at: String,
    completed_at: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ApiThread {
    kind: &'static str,
    id: String,
    created_at: String,
    updated_at: String,
    session_id: String,
    project_id: String,
    title: String,
    status: String,
    summary: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ApiTask {
    kind: &'static str,
    id: String,
    created_at: String,
    updated_at: String,
    session_id: String,
    thread_id: String,
    project_id: String,
    title: String,
    status: String,
    priority: String,
    summary: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ApiEvent {
    kind: &'static str,
    id: String,
    created_at: String,
    updated_at: String,
    project_id: String,
    session_id: Option<String>,
    thread_id: Option<String>,
    task_id: Option<String>,
    file_change_id: Option<String>,
    guidance_item_id: Option<String>,
    action_item_id: Option<String>,
    memory_item_id: Option<String>,
    origin_type: String,
    event_type: String,
    category: String,
    node_category: String,
    timestamp: String,
    summary: String,
    metadata: Value,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ApiFileChange {
    kind: &'static str,
    id: String,
    created_at: String,
    updated_at: String,
    event_id: String,
    project_id: String,
    session_id: Option<String>,
    thread_id: Option<String>,
    task_id: Option<String>,
    path: String,
    change_type: String,
    from_path: Option<String>,
    summary: Option<String>,
    diff_preview: Option<String>,
    language: Option<String>,
    file_type: String,
    git_ref: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ApiMemoryItem {
    kind: &'static str,
    id: String,
    created_at: String,
    updated_at: String,
    project_id: Option<String>,
    session_id: Option<String>,
    thread_id: Option<String>,
    bucket: String,
    status: String,
    summary: String,
    content: String,
    confidence: f64,
    freshness: f64,
    curation_state: String,
    source_event_ids: Vec<String>,
    source_file_change_ids: Vec<String>,
    linked_action_item_ids: Vec<String>,
    linked_guidance_item_ids: Vec<String>,
    change_summary: Option<String>,
    is_pinned: bool,
    is_edited: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ApiGuidanceItem {
    kind: &'static str,
    id: String,
    created_at: String,
    updated_at: String,
    project_id: String,
    session_id: Option<String>,
    thread_id: Option<String>,
    title: String,
    summary: String,
    rationale: String,
    state: String,
    source: String,
    confidence: f64,
    evidence_summary: String,
    policy_summary: String,
    linked_memory_item_ids: Vec<String>,
    linked_event_ids: Vec<String>,
    linked_action_item_ids: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ApiActionItem {
    kind: &'static str,
    id: String,
    created_at: String,
    updated_at: String,
    project_id: String,
    session_id: Option<String>,
    thread_id: Option<String>,
    title: String,
    summary: Option<String>,
    state: String,
    risk_level: String,
    risk_summary: String,
    risk_factors: Vec<String>,
    expected_outcome: Option<String>,
    actual_outcome: Option<String>,
    owner: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiProjectCounts {
    sessions: usize,
    threads: usize,
    tasks: usize,
    events: usize,
    file_changes: usize,
    memory: usize,
    guidance: usize,
    actions: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiProjectSummary {
    kind: &'static str,
    project: ApiProject,
    counts: ApiProjectCounts,
    last_activity_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ApiProjectExport {
    kind: &'static str,
    api_version: &'static str,
    generated_at: String,
    access: Value,
    project: ApiProject,
    counts: ApiProjectCounts,
    sessions: Vec<ApiSession>,
    threads: Vec<ApiThread>,
    tasks: Vec<ApiTask>,
    events: Vec<ApiEvent>,
    file_changes: Vec<ApiFileChange>,
    memory: Vec<ApiMemoryItem>,
    guidance: Vec<ApiGuidanceItem>,
    actions: Vec<ApiActionItem>,
}

#[derive(Debug, Default)]
struct ApiSnapshot {
    projects: Vec<ApiProject>,
    sessions: Vec<ApiSession>,
    threads: Vec<ApiThread>,
    tasks: Vec<ApiTask>,
    events: Vec<ApiEvent>,
    file_changes: Vec<ApiFileChange>,
    memory: Vec<ApiMemoryItem>,
    guidance: Vec<ApiGuidanceItem>,
    actions: Vec<ApiActionItem>,
}

pub fn start_external_api_server(app: AppHandle) {
    let Some(config) = resolve_external_api_config(&app) else {
        return;
    };

    thread::spawn(move || {
        if let Err(error) = run_external_api_server(config) {
            eprintln!(
                "SubMind external API did not start: {}",
                redact_sensitive_text(&error)
            );
        }
    });
}

fn resolve_external_api_config(app: &AppHandle) -> Option<ExternalApiConfig> {
    let token = env::var("SUBMIND_API_TOKEN")
        .ok()
        .filter(|value| value.len() >= MIN_TOKEN_LENGTH)?;
    let port = env::var("SUBMIND_API_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(DEFAULT_API_PORT);
    let bind_addr = SocketAddr::from(([127, 0, 0, 1], port));
    let db_path = env::var("SUBMIND_DB_PATH")
        .ok()
        .map(PathBuf::from)
        .or_else(|| {
            app.path()
                .app_data_dir()
                .ok()
                .map(|path| path.join("submind.db"))
        })?;

    Some(ExternalApiConfig {
        bind_addr,
        token,
        db_path,
    })
}

fn run_external_api_server(config: ExternalApiConfig) -> Result<(), String> {
    let listener = TcpListener::bind(config.bind_addr)
        .map_err(|error| format!("failed to bind {}: {error}", config.bind_addr))?;

    for stream_result in listener.incoming() {
        let config = config.clone();

        match stream_result {
            Ok(stream) => {
                thread::spawn(move || {
                    let _ = handle_connection(stream, config);
                });
            }
            Err(error) => {
                eprintln!(
                    "SubMind external API connection failed: {}",
                    redact_sensitive_text(&error.to_string())
                );
            }
        }
    }

    Ok(())
}

fn handle_connection(mut stream: TcpStream, config: ExternalApiConfig) -> Result<(), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| format!("failed to set read timeout: {error}"))?;
    stream
        .set_write_timeout(Some(Duration::from_secs(2)))
        .map_err(|error| format!("failed to set write timeout: {error}"))?;

    let request = match read_http_request(&mut stream) {
        Ok(request) => request,
        Err(error) => {
            write_json_response(
                &mut stream,
                400,
                json!({
                  "error": "bad_request",
                  "message": error
                }),
                false,
            )?;
            return Ok(());
        }
    };

    let response = tauri::async_runtime::block_on(route_request(request, config));
    write_json_response(
        &mut stream,
        response.status,
        response.body,
        response.authenticate,
    )
}

fn read_http_request(stream: &mut TcpStream) -> Result<HttpRequest, String> {
    let mut buffer = [0u8; MAX_REQUEST_BYTES];
    let byte_count = stream
        .read(&mut buffer)
        .map_err(|error| format!("failed to read request: {error}"))?;

    if byte_count == 0 {
        return Err("empty request".to_string());
    }

    let raw = String::from_utf8_lossy(&buffer[..byte_count]);
    let Some(header_end) = raw.find("\r\n\r\n") else {
        return Err("request headers were incomplete".to_string());
    };
    let header_block = &raw[..header_end];
    let mut lines = header_block.lines();
    let request_line = lines
        .next()
        .ok_or_else(|| "missing request line".to_string())?;
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts
        .next()
        .ok_or_else(|| "missing method".to_string())?
        .to_string();
    let target = request_parts
        .next()
        .ok_or_else(|| "missing target".to_string())?
        .to_string();
    let version = request_parts
        .next()
        .ok_or_else(|| "missing HTTP version".to_string())?;

    if !version.starts_with("HTTP/") {
        return Err("invalid HTTP version".to_string());
    }

    let mut headers = Vec::new();

    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
            headers.push((name.trim().to_ascii_lowercase(), value.trim().to_string()));
        }
    }

    Ok(HttpRequest {
        method,
        target,
        headers,
    })
}

struct RouteResponse {
    status: u16,
    body: Value,
    authenticate: bool,
}

async fn route_request(request: HttpRequest, config: ExternalApiConfig) -> RouteResponse {
    if request.method != "GET" {
        return route_error(405, "method_not_allowed", "Only GET is supported.", false);
    }

    if !request_has_valid_token(&request, &config.token) {
        return route_error(
            401,
            "unauthorized",
            "A valid bearer token is required.",
            true,
        );
    }

    let (path, query) = split_target(&request.target);

    match path.as_str() {
        "/v1/health" => RouteResponse {
            status: 200,
            body: json!({
              "status": "ok",
              "apiVersion": "v1",
              "localOnly": true,
              "readOnly": true
            }),
            authenticate: false,
        },
        "/v1/projects" => match read_api_snapshot(&config.db_path).await {
            Ok(snapshot) => {
                let query_text = query_param(&query, "query").or_else(|| query_param(&query, "q"));
                let limit = query_param(&query, "limit")
                    .and_then(|value| value.parse::<usize>().ok())
                    .unwrap_or(25)
                    .min(MAX_PROJECT_LIST_LIMIT);
                let projects = search_project_summaries(&snapshot, query_text.as_deref(), limit);

                RouteResponse {
                    status: 200,
                    body: json!({
                      "kind": "ExternalProjectSummaryList",
                      "apiVersion": "v1",
                      "projects": projects
                    }),
                    authenticate: false,
                }
            }
            Err(error) => route_read_error(error),
        },
        "/v1/project-export" => match read_api_snapshot(&config.db_path).await {
            Ok(snapshot) => {
                let project_id = query_param(&query, "projectId");
                let query_text = query_param(&query, "query").or_else(|| query_param(&query, "q"));

                match resolve_project_export(
                    &snapshot,
                    project_id.as_deref(),
                    query_text.as_deref(),
                ) {
                    Some(project_export) => RouteResponse {
                        status: 200,
                        body: json!(project_export),
                        authenticate: false,
                    },
                    None => route_error(
                        404,
                        "project_not_found",
                        "No matching project was found.",
                        false,
                    ),
                }
            }
            Err(error) => route_read_error(error),
        },
        _ => {
            if let Some(project_id) = parse_project_export_path(&path) {
                match read_api_snapshot(&config.db_path).await {
                    Ok(snapshot) => match create_project_export(&snapshot, &project_id) {
                        Some(project_export) => RouteResponse {
                            status: 200,
                            body: json!(project_export),
                            authenticate: false,
                        },
                        None => route_error(
                            404,
                            "project_not_found",
                            "No matching project was found.",
                            false,
                        ),
                    },
                    Err(error) => route_read_error(error),
                }
            } else {
                route_error(404, "not_found", "Endpoint was not found.", false)
            }
        }
    }
}

fn route_error(status: u16, code: &str, message: &str, authenticate: bool) -> RouteResponse {
    RouteResponse {
        status,
        body: json!({
          "error": code,
          "message": message
        }),
        authenticate,
    }
}

fn route_read_error(error: String) -> RouteResponse {
    eprintln!(
        "SubMind external API read failed: {}",
        redact_sensitive_text(&error)
    );
    route_error(
        500,
        "read_failed",
        "SubMind could not read project data.",
        false,
    )
}

fn request_has_valid_token(request: &HttpRequest, expected: &str) -> bool {
    let Some(header_value) = request
        .headers
        .iter()
        .find_map(|(name, value)| (name == "authorization").then_some(value))
    else {
        return false;
    };
    let Some(token) = header_value.strip_prefix("Bearer ") else {
        return false;
    };

    constant_time_eq(token.as_bytes(), expected.as_bytes())
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    let max_len = left.len().max(right.len());
    let mut diff = left.len() ^ right.len();

    for index in 0..max_len {
        let left_byte = *left.get(index).unwrap_or(&0);
        let right_byte = *right.get(index).unwrap_or(&0);
        diff |= usize::from(left_byte ^ right_byte);
    }

    diff == 0
}

fn split_target(target: &str) -> (String, Vec<(String, String)>) {
    let (path, query_string) = target.split_once('?').unwrap_or((target, ""));
    let query = query_string
        .split('&')
        .filter(|part| !part.is_empty())
        .filter_map(|part| {
            let (key, value) = part.split_once('=').unwrap_or((part, ""));
            let key = percent_decode(key);

            (!key.is_empty()).then_some((key, percent_decode(value)))
        })
        .collect();

    (percent_decode(path), query)
}

fn query_param(query: &[(String, String)], key: &str) -> Option<String> {
    query
        .iter()
        .find_map(|(candidate, value)| (candidate == key).then_some(value.clone()))
}

fn parse_project_export_path(path: &str) -> Option<String> {
    let rest = path.strip_prefix("/v1/projects/")?;
    let project_id = rest.strip_suffix("/export")?;

    (!project_id.trim().is_empty()).then_some(project_id.to_string())
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0usize;

    while index < bytes.len() {
        if bytes[index] == b'+' {
            decoded.push(b' ');
            index += 1;
            continue;
        }

        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(upper), Some(lower)) =
                (from_hex(bytes[index + 1]), from_hex(bytes[index + 2]))
            {
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

struct SensitiveRegex {
    label: &'static str,
    pattern: Regex,
    value_group: Option<usize>,
}

struct SensitiveRange {
    start: usize,
    end: usize,
    label: &'static str,
    fingerprint: String,
}

fn sensitive_regexes() -> &'static Vec<SensitiveRegex> {
    static REGEXES: OnceLock<Vec<SensitiveRegex>> = OnceLock::new();

    REGEXES.get_or_init(|| {
    vec![
      SensitiveRegex {
        label: "private-key",
        pattern: Regex::new(
          r"(?s)-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----.*?-----END [A-Z0-9 ]*PRIVATE KEY-----",
        )
        .expect("private-key regex must compile"),
        value_group: None,
      },
      SensitiveRegex {
        label: "authorization",
        pattern: Regex::new(r"\b(Bearer\s+)([A-Za-z0-9._~+/=-]{16,})\b")
          .expect("authorization regex must compile"),
        value_group: Some(2),
      },
      SensitiveRegex {
        label: "submind-token",
        pattern: Regex::new(r"\bsm_[A-Za-z0-9_-]{32,}\b")
          .expect("submind-token regex must compile"),
        value_group: None,
      },
      SensitiveRegex {
        label: "openai-key",
        pattern: Regex::new(r"\bsk-[A-Za-z0-9_-]{20,}\b")
          .expect("openai-key regex must compile"),
        value_group: None,
      },
      SensitiveRegex {
        label: "github-token",
        pattern: Regex::new(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b")
          .expect("github-token regex must compile"),
        value_group: None,
      },
      SensitiveRegex {
        label: "github-pat",
        pattern: Regex::new(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b")
          .expect("github-pat regex must compile"),
        value_group: None,
      },
      SensitiveRegex {
        label: "slack-token",
        pattern: Regex::new(r"\bxox[aboprs]-[A-Za-z0-9-]{10,}\b")
          .expect("slack-token regex must compile"),
        value_group: None,
      },
      SensitiveRegex {
        label: "aws-access-key",
        pattern: Regex::new(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b")
          .expect("aws-access-key regex must compile"),
        value_group: None,
      },
      SensitiveRegex {
        label: "jwt",
        pattern: Regex::new(r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")
          .expect("jwt regex must compile"),
        value_group: None,
      },
      SensitiveRegex {
        label: "connection-credential",
        pattern: Regex::new(r"(?i)\b([a-z][a-z0-9+.-]*://[^:\s/@]+:)([^@\s/]+)(@)")
          .expect("connection credential regex must compile"),
        value_group: Some(2),
      },
      SensitiveRegex {
        label: "credential",
        pattern: Regex::new(
          r#"(?i)\b([A-Za-z0-9_.-]*(?:api[_-]?key|token|secret|password|passwd|pwd|client[_-]?secret|private[_-]?key|access[_-]?key|session|cookie|jwt|credential)[A-Za-z0-9_.-]*\s*[:=]\s*["']?)([^\s"',;}{)]+)(["']?)"#,
        )
        .expect("credential assignment regex must compile"),
        value_group: Some(2),
      },
      SensitiveRegex {
        label: "email",
        pattern: Regex::new(r"(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b")
          .expect("email regex must compile"),
        value_group: None,
      },
      SensitiveRegex {
        label: "local-user",
        pattern: Regex::new(r"\b([A-Z]:[\\/]+Users[\\/]+)([^\\/:\s]+)([\\/])")
          .expect("local user path regex must compile"),
        value_group: Some(2),
      },
    ]
  })
}

fn has_meaningful_secret_shape(value: &str) -> bool {
    if value.len() < 6 {
        return false;
    }

    !matches!(
        value.to_ascii_lowercase().as_str(),
        "true" | "false" | "null" | "none" | "undefined" | "redacted" | "example" | "placeholder"
    )
}

fn fingerprint_sensitive_value(value: &str) -> String {
    let mut hash: u32 = 0x811c9dc5;

    for byte in value.bytes() {
        hash ^= u32::from(byte);
        hash = hash.wrapping_mul(0x01000193);
    }

    format!("{hash:08x}")
}

fn detect_sensitive_ranges(value: &str) -> Vec<SensitiveRange> {
    let mut ranges = Vec::new();

    for sensitive_regex in sensitive_regexes() {
        for captures in sensitive_regex.pattern.captures_iter(value) {
            let Some(target_match) = sensitive_regex
                .value_group
                .and_then(|group| captures.get(group))
                .or_else(|| captures.get(0))
            else {
                continue;
            };
            let sensitive_value = target_match.as_str();

            if !has_meaningful_secret_shape(sensitive_value) {
                continue;
            }

            ranges.push(SensitiveRange {
                start: target_match.start(),
                end: target_match.end(),
                label: sensitive_regex.label,
                fingerprint: fingerprint_sensitive_value(sensitive_value),
            });
        }
    }

    ranges.sort_by(|left, right| {
        left.start
            .cmp(&right.start)
            .then_with(|| right.end.cmp(&left.end))
    });

    let mut merged: Vec<SensitiveRange> = Vec::new();

    for range in ranges {
        if let Some(previous) = merged.last_mut() {
            if range.start < previous.end {
                if range.end > previous.end {
                    previous.end = range.end;
                }

                continue;
            }
        }

        merged.push(range);
    }

    merged
}

fn redact_sensitive_text(value: &str) -> String {
    let ranges = detect_sensitive_ranges(value);

    if ranges.is_empty() {
        return value.to_string();
    }

    let mut redacted = String::with_capacity(value.len());
    let mut cursor = 0usize;

    for range in ranges {
        redacted.push_str(&value[cursor..range.start]);
        redacted.push_str(&format!("[redacted:{}:{}]", range.label, range.fingerprint));
        cursor = range.end;
    }

    redacted.push_str(&value[cursor..]);
    redacted
}

fn redact_sensitive_json(value: Value) -> Value {
    match value {
        Value::String(text) => Value::String(redact_sensitive_text(&text)),
        Value::Array(items) => Value::Array(items.into_iter().map(redact_sensitive_json).collect()),
        Value::Object(object) => Value::Object(
            object
                .into_iter()
                .map(|(key, item)| (key, redact_sensitive_json(item)))
                .collect::<Map<String, Value>>(),
        ),
        other => other,
    }
}

fn write_json_response(
    stream: &mut TcpStream,
    status: u16,
    body: Value,
    authenticate: bool,
) -> Result<(), String> {
    let body = serde_json::to_string(&redact_sensitive_json(body))
        .map_err(|error| format!("failed to serialize response: {error}"))?;
    let reason = status_reason(status);
    let authenticate_header = if authenticate {
        "WWW-Authenticate: Bearer realm=\"SubMind\"\r\n"
    } else {
        ""
    };
    let response = format!(
    "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n{}Connection: close\r\n\r\n{}",
    body.as_bytes().len(),
    authenticate_header,
    body
  );

    stream
        .write_all(response.as_bytes())
        .map_err(|error| format!("failed to write response: {error}"))
}

fn status_reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        404 => "Not Found",
        405 => "Method Not Allowed",
        500 => "Internal Server Error",
        _ => "Unknown",
    }
}

async fn read_api_snapshot(db_path: &Path) -> Result<ApiSnapshot, String> {
    if !db_path.exists() {
        return Ok(ApiSnapshot::default());
    }

    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(false)
        .read_only(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|error| format!("Failed to open SubMind database: {error}"))?;
    let snapshot = ApiSnapshot {
        projects: query_projects(&pool).await?,
        sessions: query_sessions(&pool).await?,
        threads: query_threads(&pool).await?,
        tasks: query_tasks(&pool).await?,
        events: query_events(&pool).await?,
        file_changes: query_file_changes(&pool).await?,
        memory: query_memory(&pool).await?,
        guidance: query_guidance(&pool).await?,
        actions: query_actions(&pool).await?,
    };

    pool.close().await;
    Ok(snapshot)
}

async fn query_projects(pool: &SqlitePool) -> Result<Vec<ApiProject>, String> {
    let rows = sqlx::query(
        r#"SELECT
       id, created_at, updated_at, profile_id, name, description, summary,
       workspace_path, repository_remote, descriptors_json
     FROM projects
     ORDER BY updated_at DESC, created_at DESC"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Failed to read projects: {error}"))?;

    rows.iter().map(map_project).collect()
}

async fn query_sessions(pool: &SqlitePool) -> Result<Vec<ApiSession>, String> {
    let rows = sqlx::query(
        r#"SELECT
       id, created_at, updated_at, profile_id, project_id, status, summary,
       started_at, completed_at
     FROM sessions
     ORDER BY updated_at DESC, started_at DESC"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Failed to read sessions: {error}"))?;

    rows.iter().map(map_session).collect()
}

async fn query_threads(pool: &SqlitePool) -> Result<Vec<ApiThread>, String> {
    let rows = sqlx::query(
        r#"SELECT id, created_at, updated_at, session_id, project_id, title, status, summary
     FROM threads
     ORDER BY updated_at DESC, created_at DESC"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Failed to read threads: {error}"))?;

    rows.iter().map(map_thread).collect()
}

async fn query_tasks(pool: &SqlitePool) -> Result<Vec<ApiTask>, String> {
    let rows = sqlx::query(
        r#"SELECT
       id, created_at, updated_at, session_id, thread_id, project_id, title,
       status, priority, summary
     FROM tasks
     ORDER BY updated_at DESC, created_at DESC"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Failed to read tasks: {error}"))?;

    rows.iter().map(map_task).collect()
}

async fn query_events(pool: &SqlitePool) -> Result<Vec<ApiEvent>, String> {
    let rows = sqlx::query(
        r#"SELECT
       id, created_at, updated_at, project_id, session_id, thread_id, task_id,
       file_change_id, guidance_item_id, action_item_id, memory_item_id,
       origin_type, event_type, category, node_category, timestamp, summary,
       metadata_json
     FROM events
     ORDER BY timestamp DESC, created_at DESC"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Failed to read events: {error}"))?;

    rows.iter().map(map_event).collect()
}

async fn query_file_changes(pool: &SqlitePool) -> Result<Vec<ApiFileChange>, String> {
    let rows = sqlx::query(
        r#"SELECT
       id, created_at, updated_at, event_id, project_id, session_id, thread_id,
       task_id, path, change_type, from_path, summary, diff_preview, language,
       file_type, git_ref
     FROM file_changes
     ORDER BY updated_at DESC, created_at DESC"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Failed to read file changes: {error}"))?;

    rows.iter().map(map_file_change).collect()
}

async fn query_memory(pool: &SqlitePool) -> Result<Vec<ApiMemoryItem>, String> {
    let rows = sqlx::query(
        r#"SELECT
       id, created_at, updated_at, project_id, session_id, thread_id, bucket,
       status, summary, content, confidence, freshness, curation_state,
       source_event_ids_json, source_file_change_ids_json,
       linked_action_item_ids_json, linked_guidance_item_ids_json,
       change_summary, is_pinned, is_edited
     FROM memory_items
     ORDER BY updated_at DESC, created_at DESC"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Failed to read memory: {error}"))?;

    rows.iter().map(map_memory_item).collect()
}

async fn query_guidance(pool: &SqlitePool) -> Result<Vec<ApiGuidanceItem>, String> {
    let rows = sqlx::query(
        r#"SELECT
       id, created_at, updated_at, project_id, session_id, thread_id, title,
       summary, rationale, state, source, confidence, evidence_summary,
       policy_summary, linked_memory_item_ids_json, linked_event_ids_json,
       linked_action_item_ids_json
     FROM guidance_items
     ORDER BY updated_at DESC, created_at DESC"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Failed to read guidance: {error}"))?;

    rows.iter().map(map_guidance_item).collect()
}

async fn query_actions(pool: &SqlitePool) -> Result<Vec<ApiActionItem>, String> {
    let rows = sqlx::query(
        r#"SELECT
       id, created_at, updated_at, project_id, session_id, thread_id, title,
       summary, state, risk_level, risk_summary, risk_factors_json,
       expected_outcome, actual_outcome, owner
     FROM action_items
     ORDER BY updated_at DESC, created_at DESC"#,
    )
    .fetch_all(pool)
    .await
    .map_err(|error| format!("Failed to read actions: {error}"))?;

    rows.iter().map(map_action_item).collect()
}

fn map_project(row: &SqliteRow) -> Result<ApiProject, String> {
    Ok(ApiProject {
        kind: "Project",
        id: required_string(row, "id")?,
        created_at: required_string(row, "created_at")?,
        updated_at: required_string(row, "updated_at")?,
        profile_id: required_string(row, "profile_id")?,
        name: required_string(row, "name")?,
        description: optional_string(row, "description")?,
        summary: optional_string(row, "summary")?,
        workspace_path: optional_string(row, "workspace_path")?,
        repository_remote: optional_string(row, "repository_remote")?,
        descriptors: parse_string_array(optional_string(row, "descriptors_json")?),
    })
}

fn map_session(row: &SqliteRow) -> Result<ApiSession, String> {
    Ok(ApiSession {
        kind: "Session",
        id: required_string(row, "id")?,
        created_at: required_string(row, "created_at")?,
        updated_at: required_string(row, "updated_at")?,
        profile_id: required_string(row, "profile_id")?,
        project_id: required_string(row, "project_id")?,
        status: required_string(row, "status")?,
        summary: optional_string(row, "summary")?,
        started_at: required_string(row, "started_at")?,
        completed_at: optional_string(row, "completed_at")?,
    })
}

fn map_thread(row: &SqliteRow) -> Result<ApiThread, String> {
    Ok(ApiThread {
        kind: "Thread",
        id: required_string(row, "id")?,
        created_at: required_string(row, "created_at")?,
        updated_at: required_string(row, "updated_at")?,
        session_id: required_string(row, "session_id")?,
        project_id: required_string(row, "project_id")?,
        title: required_string(row, "title")?,
        status: required_string(row, "status")?,
        summary: optional_string(row, "summary")?,
    })
}

fn map_task(row: &SqliteRow) -> Result<ApiTask, String> {
    Ok(ApiTask {
        kind: "Task",
        id: required_string(row, "id")?,
        created_at: required_string(row, "created_at")?,
        updated_at: required_string(row, "updated_at")?,
        session_id: required_string(row, "session_id")?,
        thread_id: required_string(row, "thread_id")?,
        project_id: required_string(row, "project_id")?,
        title: required_string(row, "title")?,
        status: required_string(row, "status")?,
        priority: required_string(row, "priority")?,
        summary: optional_string(row, "summary")?,
    })
}

fn map_event(row: &SqliteRow) -> Result<ApiEvent, String> {
    Ok(ApiEvent {
        kind: "Event",
        id: required_string(row, "id")?,
        created_at: required_string(row, "created_at")?,
        updated_at: required_string(row, "updated_at")?,
        project_id: required_string(row, "project_id")?,
        session_id: optional_string(row, "session_id")?,
        thread_id: optional_string(row, "thread_id")?,
        task_id: optional_string(row, "task_id")?,
        file_change_id: optional_string(row, "file_change_id")?,
        guidance_item_id: optional_string(row, "guidance_item_id")?,
        action_item_id: optional_string(row, "action_item_id")?,
        memory_item_id: optional_string(row, "memory_item_id")?,
        origin_type: required_string(row, "origin_type")?,
        event_type: required_string(row, "event_type")?,
        category: required_string(row, "category")?,
        node_category: required_string(row, "node_category")?,
        timestamp: required_string(row, "timestamp")?,
        summary: required_string(row, "summary")?,
        metadata: parse_value(optional_string(row, "metadata_json")?),
    })
}

fn map_file_change(row: &SqliteRow) -> Result<ApiFileChange, String> {
    Ok(ApiFileChange {
        kind: "FileChange",
        id: required_string(row, "id")?,
        created_at: required_string(row, "created_at")?,
        updated_at: required_string(row, "updated_at")?,
        event_id: required_string(row, "event_id")?,
        project_id: required_string(row, "project_id")?,
        session_id: optional_string(row, "session_id")?,
        thread_id: optional_string(row, "thread_id")?,
        task_id: optional_string(row, "task_id")?,
        path: required_string(row, "path")?,
        change_type: required_string(row, "change_type")?,
        from_path: optional_string(row, "from_path")?,
        summary: optional_string(row, "summary")?,
        diff_preview: optional_string(row, "diff_preview")?,
        language: optional_string(row, "language")?,
        file_type: required_string(row, "file_type")?,
        git_ref: optional_string(row, "git_ref")?,
    })
}

fn map_memory_item(row: &SqliteRow) -> Result<ApiMemoryItem, String> {
    Ok(ApiMemoryItem {
        kind: "MemoryItem",
        id: required_string(row, "id")?,
        created_at: required_string(row, "created_at")?,
        updated_at: required_string(row, "updated_at")?,
        project_id: optional_string(row, "project_id")?,
        session_id: optional_string(row, "session_id")?,
        thread_id: optional_string(row, "thread_id")?,
        bucket: required_string(row, "bucket")?,
        status: required_string(row, "status")?,
        summary: required_string(row, "summary")?,
        content: required_string(row, "content")?,
        confidence: numeric_value(row, "confidence")?,
        freshness: numeric_value(row, "freshness")?,
        curation_state: required_string(row, "curation_state")?,
        source_event_ids: parse_string_array(optional_string(row, "source_event_ids_json")?),
        source_file_change_ids: parse_string_array(optional_string(
            row,
            "source_file_change_ids_json",
        )?),
        linked_action_item_ids: parse_string_array(optional_string(
            row,
            "linked_action_item_ids_json",
        )?),
        linked_guidance_item_ids: parse_string_array(optional_string(
            row,
            "linked_guidance_item_ids_json",
        )?),
        change_summary: optional_string(row, "change_summary")?,
        is_pinned: boolean_value(row, "is_pinned")?,
        is_edited: boolean_value(row, "is_edited")?,
    })
}

fn map_guidance_item(row: &SqliteRow) -> Result<ApiGuidanceItem, String> {
    Ok(ApiGuidanceItem {
        kind: "GuidanceItem",
        id: required_string(row, "id")?,
        created_at: required_string(row, "created_at")?,
        updated_at: required_string(row, "updated_at")?,
        project_id: required_string(row, "project_id")?,
        session_id: optional_string(row, "session_id")?,
        thread_id: optional_string(row, "thread_id")?,
        title: required_string(row, "title")?,
        summary: required_string(row, "summary")?,
        rationale: required_string(row, "rationale")?,
        state: required_string(row, "state")?,
        source: required_string(row, "source")?,
        confidence: numeric_value(row, "confidence")?,
        evidence_summary: required_string(row, "evidence_summary")?,
        policy_summary: required_string(row, "policy_summary")?,
        linked_memory_item_ids: parse_string_array(optional_string(
            row,
            "linked_memory_item_ids_json",
        )?),
        linked_event_ids: parse_string_array(optional_string(row, "linked_event_ids_json")?),
        linked_action_item_ids: parse_string_array(optional_string(
            row,
            "linked_action_item_ids_json",
        )?),
    })
}

fn map_action_item(row: &SqliteRow) -> Result<ApiActionItem, String> {
    Ok(ApiActionItem {
        kind: "ActionItem",
        id: required_string(row, "id")?,
        created_at: required_string(row, "created_at")?,
        updated_at: required_string(row, "updated_at")?,
        project_id: required_string(row, "project_id")?,
        session_id: optional_string(row, "session_id")?,
        thread_id: optional_string(row, "thread_id")?,
        title: required_string(row, "title")?,
        summary: optional_string(row, "summary")?,
        state: required_string(row, "state")?,
        risk_level: required_string(row, "risk_level")?,
        risk_summary: required_string(row, "risk_summary")?,
        risk_factors: parse_string_array(optional_string(row, "risk_factors_json")?),
        expected_outcome: optional_string(row, "expected_outcome")?,
        actual_outcome: optional_string(row, "actual_outcome")?,
        owner: required_string(row, "owner")?,
    })
}

fn required_string(row: &SqliteRow, column: &str) -> Result<String, String> {
    row.try_get::<String, _>(column)
        .map_err(|error| format!("Failed to read {column}: {error}"))
}

fn optional_string(row: &SqliteRow, column: &str) -> Result<Option<String>, String> {
    row.try_get::<Option<String>, _>(column)
        .map_err(|error| format!("Failed to read {column}: {error}"))
}

fn numeric_value(row: &SqliteRow, column: &str) -> Result<f64, String> {
    if let Ok(value) = row.try_get::<f64, _>(column) {
        return Ok(value);
    }

    row.try_get::<String, _>(column)
        .map_err(|error| format!("Failed to read {column}: {error}"))
        .map(|value| value.parse::<f64>().unwrap_or(0.0))
}

fn boolean_value(row: &SqliteRow, column: &str) -> Result<bool, String> {
    let value = required_string(row, column)?;

    Ok(value == "1" || value.eq_ignore_ascii_case("true"))
}

fn parse_string_array(value: Option<String>) -> Vec<String> {
    value
        .and_then(|raw| serde_json::from_str::<Vec<String>>(&raw).ok())
        .unwrap_or_default()
}

fn parse_value(value: Option<String>) -> Value {
    value
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .unwrap_or_else(|| json!({}))
}

fn search_project_summaries(
    snapshot: &ApiSnapshot,
    query: Option<&str>,
    limit: usize,
) -> Vec<ApiProjectSummary> {
    snapshot
        .projects
        .iter()
        .filter(|project| project_matches_query(project, query))
        .take(limit)
        .map(|project| create_project_summary(snapshot, project))
        .collect()
}

fn resolve_project_export(
    snapshot: &ApiSnapshot,
    project_id: Option<&str>,
    query: Option<&str>,
) -> Option<ApiProjectExport> {
    if let Some(project_id) = project_id {
        return create_project_export(snapshot, project_id);
    }

    let query = query?.trim();

    if query.is_empty() {
        return None;
    }

    let normalized_query = normalize_search_value(query);
    let direct_project = snapshot.projects.iter().find(|project| {
        normalize_search_value(&project.id) == normalized_query
            || normalize_search_value(&project.name) == normalized_query
            || project
                .workspace_path
                .as_deref()
                .map(normalize_search_value)
                .as_deref()
                == Some(normalized_query.as_str())
    });
    let matched_project = direct_project.or_else(|| {
        snapshot
            .projects
            .iter()
            .find(|project| project_matches_query(project, Some(query)))
    })?;

    create_project_export(snapshot, &matched_project.id)
}

fn create_project_summary(snapshot: &ApiSnapshot, project: &ApiProject) -> ApiProjectSummary {
    ApiProjectSummary {
        kind: "ExternalProjectSummary",
        project: project.clone(),
        counts: create_project_counts(snapshot, &project.id),
        last_activity_at: project_last_activity_at(snapshot, project),
    }
}

fn create_project_export(snapshot: &ApiSnapshot, project_id: &str) -> Option<ApiProjectExport> {
    let project = snapshot
        .projects
        .iter()
        .find(|project| project.id == project_id)?;

    Some(ApiProjectExport {
        kind: "ExternalProjectExport",
        api_version: "v1",
        generated_at: chrono::Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true),
        access: json!({
          "mode": "read_only",
          "auth": "bearer_token",
          "localOnly": true
        }),
        project: project.clone(),
        counts: create_project_counts(snapshot, project_id),
        sessions: snapshot
            .sessions
            .iter()
            .filter(|item| item.project_id == project_id)
            .cloned()
            .collect(),
        threads: snapshot
            .threads
            .iter()
            .filter(|item| item.project_id == project_id)
            .cloned()
            .collect(),
        tasks: snapshot
            .tasks
            .iter()
            .filter(|item| item.project_id == project_id)
            .cloned()
            .collect(),
        events: snapshot
            .events
            .iter()
            .filter(|item| item.project_id == project_id)
            .cloned()
            .collect(),
        file_changes: snapshot
            .file_changes
            .iter()
            .filter(|item| item.project_id == project_id)
            .cloned()
            .collect(),
        memory: snapshot
            .memory
            .iter()
            .filter(|item| item.project_id.as_deref() == Some(project_id))
            .cloned()
            .collect(),
        guidance: snapshot
            .guidance
            .iter()
            .filter(|item| item.project_id == project_id)
            .cloned()
            .collect(),
        actions: snapshot
            .actions
            .iter()
            .filter(|item| item.project_id == project_id)
            .cloned()
            .collect(),
    })
}

fn create_project_counts(snapshot: &ApiSnapshot, project_id: &str) -> ApiProjectCounts {
    ApiProjectCounts {
        sessions: snapshot
            .sessions
            .iter()
            .filter(|item| item.project_id == project_id)
            .count(),
        threads: snapshot
            .threads
            .iter()
            .filter(|item| item.project_id == project_id)
            .count(),
        tasks: snapshot
            .tasks
            .iter()
            .filter(|item| item.project_id == project_id)
            .count(),
        events: snapshot
            .events
            .iter()
            .filter(|item| item.project_id == project_id)
            .count(),
        file_changes: snapshot
            .file_changes
            .iter()
            .filter(|item| item.project_id == project_id)
            .count(),
        memory: snapshot
            .memory
            .iter()
            .filter(|item| item.project_id.as_deref() == Some(project_id))
            .count(),
        guidance: snapshot
            .guidance
            .iter()
            .filter(|item| item.project_id == project_id)
            .count(),
        actions: snapshot
            .actions
            .iter()
            .filter(|item| item.project_id == project_id)
            .count(),
    }
}

fn project_last_activity_at(snapshot: &ApiSnapshot, project: &ApiProject) -> Option<String> {
    let project_id = project.id.as_str();
    let mut timestamps = vec![project.updated_at.clone()];

    timestamps.extend(
        snapshot
            .sessions
            .iter()
            .filter(|item| item.project_id == project_id)
            .map(|item| item.updated_at.clone()),
    );
    timestamps.extend(
        snapshot
            .threads
            .iter()
            .filter(|item| item.project_id == project_id)
            .map(|item| item.updated_at.clone()),
    );
    timestamps.extend(
        snapshot
            .tasks
            .iter()
            .filter(|item| item.project_id == project_id)
            .map(|item| item.updated_at.clone()),
    );
    timestamps.extend(
        snapshot
            .events
            .iter()
            .filter(|item| item.project_id == project_id)
            .map(|item| item.timestamp.clone()),
    );
    timestamps.sort_by(|left, right| right.cmp(left));
    timestamps.into_iter().next()
}

fn project_matches_query(project: &ApiProject, query: Option<&str>) -> bool {
    let tokens = tokenize_query(query);

    if tokens.is_empty() {
        return true;
    }

    let haystack = normalize_search_value(
        &[
            project.id.as_str(),
            project.name.as_str(),
            project.description.as_deref().unwrap_or_default(),
            project.summary.as_deref().unwrap_or_default(),
            project.workspace_path.as_deref().unwrap_or_default(),
            project.repository_remote.as_deref().unwrap_or_default(),
            &project.descriptors.join(" "),
        ]
        .join(" "),
    );

    tokens.iter().all(|token| haystack.contains(token))
}

fn tokenize_query(query: Option<&str>) -> Vec<String> {
    normalize_search_value(query.unwrap_or_default())
        .split_whitespace()
        .map(str::to_string)
        .collect()
}

fn normalize_search_value(value: &str) -> String {
    value.replace('\\', "/").to_lowercase()
}
