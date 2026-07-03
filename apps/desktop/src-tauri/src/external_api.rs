use chrono::SecondsFormat;
use regex::Regex;
use serde::{Deserialize, Serialize};
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
const MAX_REQUEST_BYTES: usize = 64 * 1024;
const MAX_PROJECT_LIST_LIMIT: usize = 100;
const MIN_TOKEN_LENGTH: usize = 32;
const DEFAULT_CONTEXT_MAX_ITEMS: usize = 8;
const MAX_CONTEXT_ITEMS: usize = 20;
const DEFAULT_CONTEXT_MAX_TOKENS: usize = 1_200;
const MAX_CONTEXT_TOKENS: usize = 4_000;
const MAX_CONTEXT_CANDIDATES: usize = 40;

#[derive(Clone)]
struct ContextModelConfig {
    endpoint: String,
    model: String,
    token: Option<String>,
}

#[derive(Clone)]
struct ExternalApiConfig {
    bind_addr: SocketAddr,
    token: String,
    db_path: PathBuf,
    context_model: Option<ContextModelConfig>,
}

#[derive(Debug)]
struct HttpRequest {
    method: String,
    target: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContextRequest {
    project_id: Option<String>,
    project_query: Option<String>,
    thread_id: Option<String>,
    prompt: String,
    max_items: Option<usize>,
    max_tokens: Option<usize>,
    kinds: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ContextSourceReference {
    entity_type: String,
    entity_id: String,
    label: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ContextDatum {
    id: String,
    kind: String,
    project_id: String,
    thread_id: Option<String>,
    title: String,
    content: String,
    confidence: f64,
    freshness: f64,
    sensitivity: String,
    deterministic_score: f64,
    relevance_score: f64,
    relevance_rationale: String,
    estimated_tokens: usize,
    sources: Vec<ContextSourceReference>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ContextPromptSummary {
    fingerprint: String,
    summary: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ContextLimits {
    max_items: usize,
    max_tokens: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ContextBundle {
    kind: &'static str,
    api_version: &'static str,
    bundle_id: String,
    generated_at: String,
    project: ApiProject,
    thread_id: Option<String>,
    prompt: ContextPromptSummary,
    limits: ContextLimits,
    ranking: Value,
    items: Vec<ContextDatum>,
    composed_context: String,
    estimated_tokens: usize,
    omitted_count: usize,
    audit_event_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelContextSelection {
    datum_id: String,
    relevance_score: f64,
    rationale: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelContextResult {
    selections: Vec<ModelContextSelection>,
    composed_context: String,
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
    let context_model = match resolve_context_model_config() {
        Ok(config) => config,
        Err(error) => {
            eprintln!(
                "SubMind context model is disabled: {}",
                redact_sensitive_text(&error)
            );
            None
        }
    };

    Some(ExternalApiConfig {
        bind_addr,
        token,
        db_path,
        context_model,
    })
}

fn resolve_context_model_config() -> Result<Option<ContextModelConfig>, String> {
    let endpoint = match env::var("SUBMIND_CONTEXT_MODEL_URL") {
        Ok(value) if !value.trim().is_empty() => value,
        _ => return Ok(None),
    };
    let model = env::var("SUBMIND_CONTEXT_MODEL")
        .map_err(|_| "SUBMIND_CONTEXT_MODEL is required when a model URL is set".to_string())?;
    let parsed = reqwest::Url::parse(&endpoint)
        .map_err(|_| "SUBMIND_CONTEXT_MODEL_URL is not a valid URL".to_string())?;

    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("SUBMIND_CONTEXT_MODEL_URL must use HTTP or HTTPS".to_string());
    }

    let is_loopback = parsed
        .host_str()
        .and_then(|host| host.parse::<std::net::IpAddr>().ok())
        .map(|address| address.is_loopback())
        .unwrap_or_else(|| parsed.host_str() == Some("localhost"));
    let allow_remote = env::var("SUBMIND_CONTEXT_MODEL_ALLOW_REMOTE")
        .map(|value| value.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    if !is_loopback && !allow_remote {
        return Err(
            "remote context models require SUBMIND_CONTEXT_MODEL_ALLOW_REMOTE=true".to_string(),
        );
    }

    Ok(Some(ContextModelConfig {
        endpoint,
        model,
        token: env::var("SUBMIND_CONTEXT_MODEL_TOKEN").ok(),
    }))
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
    let mut received = Vec::new();
    let header_end = loop {
        let mut chunk = [0u8; 4 * 1024];
        let byte_count = stream
            .read(&mut chunk)
            .map_err(|error| format!("failed to read request: {error}"))?;

        if byte_count == 0 {
            return Err("empty or incomplete request".to_string());
        }

        received.extend_from_slice(&chunk[..byte_count]);

        if received.len() > MAX_REQUEST_BYTES {
            return Err("request exceeded the maximum size".to_string());
        }

        if let Some(index) = received.windows(4).position(|window| window == b"\r\n\r\n") {
            break index;
        }
    };
    let header_block = std::str::from_utf8(&received[..header_end])
        .map_err(|_| "request headers were not valid UTF-8".to_string())?;
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

    if headers.iter().any(|(name, _)| name == "transfer-encoding") {
        return Err("transfer-encoded requests are not supported".to_string());
    }

    let content_length = headers
        .iter()
        .find_map(|(name, value)| (name == "content-length").then_some(value))
        .map(|value| {
            value
                .parse::<usize>()
                .map_err(|_| "invalid Content-Length header".to_string())
        })
        .transpose()?
        .unwrap_or(0);
    let body_start = header_end + 4;
    let total_length = body_start
        .checked_add(content_length)
        .ok_or_else(|| "request size overflowed".to_string())?;

    if total_length > MAX_REQUEST_BYTES {
        return Err("request exceeded the maximum size".to_string());
    }

    while received.len() < total_length {
        let remaining = total_length - received.len();
        let mut chunk = vec![0u8; remaining.min(4 * 1024)];
        let byte_count = stream
            .read(&mut chunk)
            .map_err(|error| format!("failed to read request body: {error}"))?;

        if byte_count == 0 {
            return Err("request body was incomplete".to_string());
        }

        received.extend_from_slice(&chunk[..byte_count]);
    }

    Ok(HttpRequest {
        method,
        target,
        headers,
        body: received[body_start..total_length].to_vec(),
    })
}

struct RouteResponse {
    status: u16,
    body: Value,
    authenticate: bool,
}

async fn route_request(request: HttpRequest, config: ExternalApiConfig) -> RouteResponse {
    if !request_has_valid_token(&request, &config.token) {
        return route_error(
            401,
            "unauthorized",
            "A valid bearer token is required.",
            true,
        );
    }

    let (path, query) = split_target(&request.target);

    if request.method == "POST" && path == "/v1/context-bundle" {
        return route_context_bundle_request(&request, &config).await;
    }

    if request.method != "GET" {
        return route_error(
            405,
            "method_not_allowed",
            "This endpoint does not support that method.",
            false,
        );
    }

    match path.as_str() {
        "/v1/health" => RouteResponse {
            status: 200,
            body: json!({
              "status": "ok",
              "apiVersion": "v1",
              "localOnly": true,
              "projectDataReadOnly": true,
              "auditWrites": true
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

fn request_has_json_content_type(request: &HttpRequest) -> bool {
    request.headers.iter().any(|(name, value)| {
        name == "content-type"
            && value.split(';').next().is_some_and(|media_type| {
                media_type.trim().eq_ignore_ascii_case("application/json")
            })
    })
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

#[derive(Debug)]
struct NormalizedContextRequest {
    project_id: Option<String>,
    project_query: Option<String>,
    thread_id: Option<String>,
    prompt: String,
    max_items: usize,
    max_tokens: usize,
    kinds: Vec<String>,
}

#[derive(Debug)]
struct ContextDatumDraft {
    id: String,
    kind: String,
    project_id: String,
    thread_id: Option<String>,
    title: String,
    content: String,
    confidence: f64,
    freshness: f64,
    base_score: f64,
    sources: Vec<ContextSourceReference>,
}

async fn route_context_bundle_request(
    request: &HttpRequest,
    config: &ExternalApiConfig,
) -> RouteResponse {
    if !request_has_json_content_type(request) {
        return route_error(
            400,
            "invalid_content_type",
            "Content-Type must be application/json.",
            false,
        );
    }

    let parsed = match serde_json::from_slice::<ContextRequest>(&request.body) {
        Ok(value) => value,
        Err(_) => {
            return route_error(
                400,
                "invalid_request",
                "The context request is not valid JSON.",
                false,
            )
        }
    };
    let normalized = match normalize_context_request(parsed) {
        Ok(value) => value,
        Err(message) => return route_error(400, "invalid_request", &message, false),
    };
    let snapshot = match read_api_snapshot(&config.db_path).await {
        Ok(value) => value,
        Err(error) => return route_read_error(error),
    };
    let project = match resolve_context_project(&snapshot, &normalized) {
        Some(value) => value,
        None => {
            return route_error(
                404,
                "project_not_found",
                "No matching project was found.",
                false,
            )
        }
    };

    if normalized.thread_id.as_deref().is_some_and(|thread_id| {
        !snapshot
            .threads
            .iter()
            .any(|thread| thread.id == thread_id && thread.project_id == project.id)
    }) {
        return route_error(
            400,
            "invalid_thread_scope",
            "The requested thread does not belong to the project.",
            false,
        );
    }

    let bundle = create_context_bundle(
        &snapshot,
        project,
        &normalized,
        config.context_model.as_ref(),
    )
    .await;

    if let Err(error) = write_context_audit_event(&config.db_path, &snapshot, &bundle).await {
        eprintln!(
            "SubMind context audit write failed: {}",
            redact_sensitive_text(&error)
        );
        return route_error(
            500,
            "audit_write_failed",
            "SubMind could not record the context supply audit event.",
            false,
        );
    }

    RouteResponse {
        status: 200,
        body: json!(bundle),
        authenticate: false,
    }
}

fn normalize_context_request(request: ContextRequest) -> Result<NormalizedContextRequest, String> {
    let prompt = request.prompt.trim().to_string();

    if prompt.is_empty() {
        return Err("prompt is required".to_string());
    }

    if prompt.chars().count() > 8_000 {
        return Err("prompt must be 8,000 characters or fewer".to_string());
    }

    let project_id = request.project_id.filter(|value| !value.trim().is_empty());
    let project_query = request
        .project_query
        .filter(|value| !value.trim().is_empty());

    if project_id.is_none() && project_query.is_none() {
        return Err("projectId or projectQuery is required".to_string());
    }

    let supported = [
        "project_context",
        "memory",
        "guidance",
        "recent_change",
        "pending_action",
    ];
    let mut kinds = request
        .kinds
        .unwrap_or_else(|| supported.iter().map(|value| value.to_string()).collect());
    kinds.sort();
    kinds.dedup();

    if kinds.is_empty() || kinds.iter().any(|kind| !supported.contains(&kind.as_str())) {
        return Err("kinds contains an unsupported context datum kind".to_string());
    }

    Ok(NormalizedContextRequest {
        project_id,
        project_query,
        thread_id: request.thread_id.filter(|value| !value.trim().is_empty()),
        prompt,
        max_items: request
            .max_items
            .unwrap_or(DEFAULT_CONTEXT_MAX_ITEMS)
            .clamp(1, MAX_CONTEXT_ITEMS),
        max_tokens: request
            .max_tokens
            .unwrap_or(DEFAULT_CONTEXT_MAX_TOKENS)
            .clamp(100, MAX_CONTEXT_TOKENS),
        kinds,
    })
}

fn resolve_context_project<'a>(
    snapshot: &'a ApiSnapshot,
    request: &NormalizedContextRequest,
) -> Option<&'a ApiProject> {
    if let Some(project_id) = request.project_id.as_deref() {
        return snapshot
            .projects
            .iter()
            .find(|project| project.id == project_id);
    }

    let query = request.project_query.as_deref()?;
    let normalized = normalize_search_value(query);

    snapshot
        .projects
        .iter()
        .find(|project| {
            normalize_search_value(&project.id) == normalized
                || normalize_search_value(&project.name) == normalized
                || project
                    .workspace_path
                    .as_deref()
                    .map(normalize_search_value)
                    .as_deref()
                    == Some(normalized.as_str())
        })
        .or_else(|| {
            snapshot
                .projects
                .iter()
                .find(|project| project_matches_query(project, Some(query)))
        })
}

fn context_kind_enabled(request: &NormalizedContextRequest, kind: &str) -> bool {
    request.kinds.iter().any(|candidate| candidate == kind)
}

fn context_tokens(value: &str) -> Vec<String> {
    value
        .split(|character: char| !character.is_ascii_alphanumeric())
        .map(str::to_ascii_lowercase)
        .filter(|token| token.len() > 2)
        .collect()
}

fn context_keyword_score(prompt_tokens: &[String], title: &str, content: &str) -> f64 {
    if prompt_tokens.is_empty() {
        return 0.0;
    }

    let haystack = context_tokens(&format!("{title} {content}"));
    let matches = prompt_tokens
        .iter()
        .filter(|token| haystack.iter().any(|candidate| candidate == *token))
        .count();

    (matches as f64 / prompt_tokens.len() as f64).min(1.0)
}

fn context_freshness(timestamp: &str, now: chrono::DateTime<chrono::Utc>) -> f64 {
    let Ok(parsed) = chrono::DateTime::parse_from_rfc3339(timestamp) else {
        return 0.5;
    };
    let age_days = now
        .signed_duration_since(parsed.with_timezone(&chrono::Utc))
        .num_hours()
        .max(0) as f64
        / 24.0;

    (1.0 - age_days / 90.0).clamp(0.05, 1.0)
}

fn estimate_context_tokens(value: &str) -> usize {
    ((value.chars().count() + 3) / 4).max(1)
}

fn create_context_datum(
    draft: ContextDatumDraft,
    prompt_tokens: &[String],
    requested_thread_id: Option<&str>,
) -> ContextDatum {
    let redacted_title = redact_sensitive_text(&draft.title);
    let redacted_content = redact_sensitive_text(&draft.content);
    let was_redacted = redacted_title != draft.title || redacted_content != draft.content;
    let keyword_score = context_keyword_score(prompt_tokens, &redacted_title, &redacted_content);
    let thread_boost = requested_thread_id
        .zip(draft.thread_id.as_deref())
        .map(|(requested, candidate)| if requested == candidate { 0.18 } else { 0.0 })
        .unwrap_or(0.0);
    let score = (draft.base_score + keyword_score * 0.28 + thread_boost).clamp(0.0, 1.0);

    ContextDatum {
        id: draft.id,
        kind: draft.kind,
        project_id: draft.project_id,
        thread_id: draft.thread_id,
        title: redacted_title,
        content: redacted_content.clone(),
        confidence: draft.confidence.clamp(0.0, 1.0),
        freshness: draft.freshness.clamp(0.0, 1.0),
        sensitivity: if was_redacted {
            "protected_redacted".to_string()
        } else {
            "normal".to_string()
        },
        deterministic_score: score,
        relevance_score: score,
        relevance_rationale:
            "Selected by deterministic project, state, recency, and prompt relevance rules."
                .to_string(),
        estimated_tokens: estimate_context_tokens(&format!("{} {redacted_content}", draft.title)),
        sources: draft
            .sources
            .into_iter()
            .map(|source| ContextSourceReference {
                label: redact_sensitive_text(&source.label),
                ..source
            })
            .collect(),
    }
}

fn create_context_candidates(
    snapshot: &ApiSnapshot,
    project: &ApiProject,
    request: &NormalizedContextRequest,
    now: chrono::DateTime<chrono::Utc>,
) -> Vec<ContextDatum> {
    let prompt_tokens = context_tokens(&request.prompt);
    let mut candidates = Vec::new();

    if context_kind_enabled(request, "project_context") {
        let content = [
            project.description.as_deref().unwrap_or_default(),
            project.summary.as_deref().unwrap_or_default(),
            &project.descriptors.join(", "),
        ]
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
        candidates.push(create_context_datum(
            ContextDatumDraft {
                id: format!("context-project-{}", project.id),
                kind: "project_context".to_string(),
                project_id: project.id.clone(),
                thread_id: None,
                title: project.name.clone(),
                content,
                confidence: 1.0,
                freshness: context_freshness(&project.updated_at, now),
                base_score: 0.55,
                sources: vec![ContextSourceReference {
                    entity_type: "Project".to_string(),
                    entity_id: project.id.clone(),
                    label: project.name.clone(),
                }],
            },
            &prompt_tokens,
            request.thread_id.as_deref(),
        ));
    }

    if context_kind_enabled(request, "memory") {
        for item in snapshot.memory.iter().filter(|item| {
            (item.project_id.as_deref() == Some(project.id.as_str()) || item.project_id.is_none())
                && !matches!(
                    item.status.as_str(),
                    "archived" | "superseded" | "draft/speculative"
                )
        }) {
            let curation_boost = if matches!(item.curation_state.as_str(), "confirmed" | "edited") {
                0.08
            } else {
                0.0
            };
            let pinned_boost = if item.is_pinned { 0.08 } else { 0.0 };
            let mut sources = vec![ContextSourceReference {
                entity_type: "MemoryItem".to_string(),
                entity_id: item.id.clone(),
                label: item.summary.clone(),
            }];
            sources.extend(
                item.source_event_ids
                    .iter()
                    .map(|id| ContextSourceReference {
                        entity_type: "Event".to_string(),
                        entity_id: id.clone(),
                        label: "Memory evidence event".to_string(),
                    }),
            );
            sources.extend(
                item.source_file_change_ids
                    .iter()
                    .map(|id| ContextSourceReference {
                        entity_type: "FileChange".to_string(),
                        entity_id: id.clone(),
                        label: "Memory evidence file".to_string(),
                    }),
            );
            candidates.push(create_context_datum(
                ContextDatumDraft {
                    id: format!("context-memory-{}", item.id),
                    kind: "memory".to_string(),
                    project_id: project.id.clone(),
                    thread_id: item.thread_id.clone(),
                    title: item.summary.clone(),
                    content: item.content.clone(),
                    confidence: item.confidence,
                    freshness: item.freshness,
                    base_score: 0.28
                        + item.confidence * 0.14
                        + item.freshness * 0.12
                        + curation_boost
                        + pinned_boost,
                    sources,
                },
                &prompt_tokens,
                request.thread_id.as_deref(),
            ));
        }
    }

    if context_kind_enabled(request, "guidance") {
        for item in snapshot.guidance.iter().filter(|item| {
            item.project_id == project.id
                && !matches!(item.state.as_str(), "suppressed" | "resolved")
        }) {
            let mut sources = vec![ContextSourceReference {
                entity_type: "GuidanceItem".to_string(),
                entity_id: item.id.clone(),
                label: item.title.clone(),
            }];
            sources.extend(
                item.linked_event_ids
                    .iter()
                    .map(|id| ContextSourceReference {
                        entity_type: "Event".to_string(),
                        entity_id: id.clone(),
                        label: "Guidance evidence event".to_string(),
                    }),
            );
            candidates.push(create_context_datum(
                ContextDatumDraft {
                    id: format!("context-guidance-{}", item.id),
                    kind: "guidance".to_string(),
                    project_id: project.id.clone(),
                    thread_id: item.thread_id.clone(),
                    title: item.title.clone(),
                    content: format!("{} {}", item.summary, item.rationale),
                    confidence: item.confidence,
                    freshness: context_freshness(&item.updated_at, now),
                    base_score: 0.34
                        + item.confidence * 0.16
                        + if item.state == "injected" { 0.12 } else { 0.05 },
                    sources,
                },
                &prompt_tokens,
                request.thread_id.as_deref(),
            ));
        }
    }

    if context_kind_enabled(request, "pending_action") {
        for item in snapshot.actions.iter().filter(|item| {
            item.project_id == project.id
                && matches!(item.state.as_str(), "pending" | "in_progress" | "blocked")
        }) {
            let risk_boost = match item.risk_level.as_str() {
                "critical" => 0.16,
                "high" => 0.12,
                "medium" => 0.06,
                _ => 0.0,
            };
            let content = [
                item.summary.as_deref(),
                Some(item.risk_summary.as_str()),
                item.expected_outcome.as_deref(),
            ]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>()
            .join(" ");
            candidates.push(create_context_datum(
                ContextDatumDraft {
                    id: format!("context-action-{}", item.id),
                    kind: "pending_action".to_string(),
                    project_id: project.id.clone(),
                    thread_id: item.thread_id.clone(),
                    title: item.title.clone(),
                    content,
                    confidence: if item.owner == "operator" { 0.95 } else { 0.78 },
                    freshness: context_freshness(&item.updated_at, now),
                    base_score: 0.36 + risk_boost,
                    sources: vec![ContextSourceReference {
                        entity_type: "ActionItem".to_string(),
                        entity_id: item.id.clone(),
                        label: item.title.clone(),
                    }],
                },
                &prompt_tokens,
                request.thread_id.as_deref(),
            ));
        }
    }

    if context_kind_enabled(request, "recent_change") {
        for item in snapshot
            .file_changes
            .iter()
            .filter(|item| item.project_id == project.id)
            .take(12)
        {
            let freshness = context_freshness(&item.updated_at, now);
            candidates.push(create_context_datum(
                ContextDatumDraft {
                    id: format!("context-file-{}", item.id),
                    kind: "recent_change".to_string(),
                    project_id: project.id.clone(),
                    thread_id: item.thread_id.clone(),
                    title: item.path.clone(),
                    content: item
                        .summary
                        .clone()
                        .unwrap_or_else(|| format!("{} {}", item.change_type, item.path)),
                    confidence: 0.9,
                    freshness,
                    base_score: 0.3 + freshness * 0.16,
                    sources: vec![
                        ContextSourceReference {
                            entity_type: "FileChange".to_string(),
                            entity_id: item.id.clone(),
                            label: item.path.clone(),
                        },
                        ContextSourceReference {
                            entity_type: "Event".to_string(),
                            entity_id: item.event_id.clone(),
                            label: "File change event".to_string(),
                        },
                    ],
                },
                &prompt_tokens,
                request.thread_id.as_deref(),
            ));
        }

        for item in snapshot
            .events
            .iter()
            .filter(|item| item.project_id == project.id && item.category == "work_change")
            .take(8)
        {
            let freshness = context_freshness(&item.timestamp, now);
            candidates.push(create_context_datum(
                ContextDatumDraft {
                    id: format!("context-event-{}", item.id),
                    kind: "recent_change".to_string(),
                    project_id: project.id.clone(),
                    thread_id: item.thread_id.clone(),
                    title: item.event_type.clone(),
                    content: item.summary.clone(),
                    confidence: 0.82,
                    freshness,
                    base_score: 0.26 + freshness * 0.14,
                    sources: vec![ContextSourceReference {
                        entity_type: "Event".to_string(),
                        entity_id: item.id.clone(),
                        label: item.summary.clone(),
                    }],
                },
                &prompt_tokens,
                request.thread_id.as_deref(),
            ));
        }
    }

    candidates.sort_by(|left, right| {
        right
            .deterministic_score
            .partial_cmp(&left.deterministic_score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.id.cmp(&right.id))
    });
    candidates.truncate(MAX_CONTEXT_CANDIDATES);
    candidates
}

fn select_context_budget(
    candidates: Vec<ContextDatum>,
    max_items: usize,
    max_tokens: usize,
) -> Vec<ContextDatum> {
    let mut selected = Vec::new();
    let mut token_total = 0;

    for candidate in candidates {
        if selected.len() >= max_items {
            break;
        }
        if !selected.is_empty() && token_total + candidate.estimated_tokens > max_tokens {
            continue;
        }
        token_total += candidate.estimated_tokens;
        selected.push(candidate);
    }

    selected
}

fn compose_context(items: &[ContextDatum]) -> String {
    items
        .iter()
        .map(|item| {
            let sources = item
                .sources
                .iter()
                .map(|source| format!("{}:{}", source.entity_type, source.entity_id))
                .collect::<Vec<_>>()
                .join(", ");
            format!(
                "- [{}] {}: {} (sources: {})",
                item.kind, item.title, item.content, sources
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

async fn rank_context_with_model(
    config: &ContextModelConfig,
    prompt: &str,
    project: &ApiProject,
    request: &NormalizedContextRequest,
    candidates: &[ContextDatum],
) -> Result<ModelContextResult, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "failed to initialize context model client".to_string())?;
    let model_input = json!({
        "prompt": redact_sensitive_text(prompt),
        "project": {
            "id": project.id,
            "name": redact_sensitive_text(&project.name),
            "summary": project.summary.as_deref().map(redact_sensitive_text)
        },
        "threadId": request.thread_id,
        "maxItems": request.max_items,
        "maxTokens": request.max_tokens,
        "candidates": candidates
    });
    let body = json!({
        "model": config.model,
        "temperature": 0,
        "messages": [
            {
                "role": "system",
                "content": "Rank only the supplied candidate IDs for relevance. Return JSON with selections [{datumId,relevanceScore,rationale}] and composedContext. Never add facts absent from candidates. Keep source IDs in composedContext."
            },
            {
                "role": "user",
                "content": serde_json::to_string(&model_input).unwrap_or_default()
            }
        ]
    });
    let mut request_builder = client.post(&config.endpoint).json(&body);

    if let Some(token) = config.token.as_deref() {
        request_builder = request_builder.bearer_auth(token);
    }

    let response = request_builder
        .send()
        .await
        .map_err(|_| "context model request failed".to_string())?;

    if !response.status().is_success() {
        return Err("context model returned an unsuccessful status".to_string());
    }

    let response_json = response
        .json::<Value>()
        .await
        .map_err(|_| "context model response was not valid JSON".to_string())?;
    let content = response_json
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .ok_or_else(|| "context model response did not contain message content".to_string())?;
    let trimmed = content.trim();
    let unwrapped = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed)
        .strip_suffix("```")
        .unwrap_or(trimmed)
        .trim();

    serde_json::from_str(unwrapped)
        .map_err(|_| "context model message did not match the required schema".to_string())
}

fn apply_model_context_result(
    candidates: &[ContextDatum],
    result: &ModelContextResult,
) -> Vec<ContextDatum> {
    let mut selected = Vec::new();

    for selection in &result.selections {
        if selected
            .iter()
            .any(|item: &ContextDatum| item.id == selection.datum_id)
        {
            continue;
        }
        let Some(candidate) = candidates
            .iter()
            .find(|candidate| candidate.id == selection.datum_id)
        else {
            continue;
        };
        let mut candidate = candidate.clone();
        candidate.relevance_score = selection.relevance_score.clamp(0.0, 1.0);
        candidate.relevance_rationale = redact_sensitive_text(&selection.rationale);
        selected.push(candidate);
    }

    selected.sort_by(|left, right| {
        right
            .relevance_score
            .partial_cmp(&left.relevance_score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                right
                    .deterministic_score
                    .partial_cmp(&left.deterministic_score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
    });
    selected
}

fn redacted_project(project: &ApiProject) -> ApiProject {
    ApiProject {
        kind: "Project",
        id: project.id.clone(),
        created_at: project.created_at.clone(),
        updated_at: project.updated_at.clone(),
        profile_id: project.profile_id.clone(),
        name: redact_sensitive_text(&project.name),
        description: project.description.as_deref().map(redact_sensitive_text),
        summary: project.summary.as_deref().map(redact_sensitive_text),
        workspace_path: project.workspace_path.as_deref().map(redact_sensitive_text),
        repository_remote: project
            .repository_remote
            .as_deref()
            .map(redact_sensitive_text),
        descriptors: project
            .descriptors
            .iter()
            .map(|value| redact_sensitive_text(value))
            .collect(),
    }
}

async fn create_context_bundle(
    snapshot: &ApiSnapshot,
    project: &ApiProject,
    request: &NormalizedContextRequest,
    model_config: Option<&ContextModelConfig>,
) -> ContextBundle {
    let now = chrono::Utc::now();
    let generated_at = now.to_rfc3339_opts(SecondsFormat::Millis, true);
    let candidates = create_context_candidates(snapshot, project, request, now);
    let candidate_count = candidates.len();
    let mut ranked = candidates.clone();
    let mut ranking_mode = "deterministic_fallback";
    let mut ranking_reason = "No context model was configured.".to_string();
    let mut model_name = None;
    let mut model_composition = String::new();

    if let Some(config) = model_config {
        match rank_context_with_model(config, &request.prompt, project, request, &candidates).await
        {
            Ok(result) => {
                let model_ranked = apply_model_context_result(&candidates, &result);
                if model_ranked.is_empty() {
                    ranking_reason =
                        "The context model returned no valid candidate IDs.".to_string();
                } else {
                    ranked = model_ranked;
                    ranking_mode = "model";
                    ranking_reason =
                        "Ranked and composed by the configured context model.".to_string();
                    model_name = Some(config.model.clone());
                    model_composition = redact_sensitive_text(&result.composed_context);
                }
            }
            Err(error) => {
                eprintln!(
                    "SubMind context model fallback: {}",
                    redact_sensitive_text(&error)
                );
                ranking_reason =
                    "The context model failed; deterministic ranking was used.".to_string();
            }
        }
    }

    let items = select_context_budget(ranked, request.max_items, request.max_tokens);
    let deterministic_composition = compose_context(&items);
    let composed_context = if ranking_mode == "model" && !model_composition.trim().is_empty() {
        model_composition.trim().to_string()
    } else {
        deterministic_composition
    };
    let redacted_prompt = redact_sensitive_text(&request.prompt);
    let prompt_fingerprint = fingerprint_sensitive_value(&redacted_prompt);
    let bundle_fingerprint = fingerprint_sensitive_value(&format!(
        "{}:{}:{}:{}",
        project.id,
        request.thread_id.as_deref().unwrap_or("project"),
        prompt_fingerprint,
        generated_at
    ));
    let prompt_summary = format!(
        "Context request for {} ({} characters).",
        redact_sensitive_text(&project.name),
        redacted_prompt.chars().count()
    );

    ContextBundle {
        kind: "ContextBundle",
        api_version: "v1",
        bundle_id: format!("context-bundle-{bundle_fingerprint}"),
        generated_at,
        project: redacted_project(project),
        thread_id: request.thread_id.clone(),
        prompt: ContextPromptSummary {
            fingerprint: prompt_fingerprint,
            summary: prompt_summary,
        },
        limits: ContextLimits {
            max_items: request.max_items,
            max_tokens: request.max_tokens,
        },
        ranking: json!({
            "mode": ranking_mode,
            "model": model_name,
            "reason": ranking_reason
        }),
        estimated_tokens: estimate_context_tokens(&composed_context),
        omitted_count: candidate_count.saturating_sub(items.len()),
        audit_event_id: format!("event-context-supplied-{bundle_fingerprint}"),
        items,
        composed_context,
    }
}

async fn write_context_audit_event(
    db_path: &Path,
    snapshot: &ApiSnapshot,
    bundle: &ContextBundle,
) -> Result<(), String> {
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(false);
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .map_err(|error| format!("Failed to open SubMind database for audit: {error}"))?;
    let sources = bundle
        .items
        .iter()
        .flat_map(|item| item.sources.clone())
        .collect::<Vec<_>>();
    let source_id = |kind: &str| {
        sources
            .iter()
            .find(|source| source.entity_type == kind)
            .map(|source| source.entity_id.clone())
    };
    let session_id = bundle.thread_id.as_deref().and_then(|thread_id| {
        snapshot
            .threads
            .iter()
            .find(|thread| thread.id == thread_id)
            .map(|thread| thread.session_id.clone())
    });
    let metadata = json!({
        "bundleId": bundle.bundle_id,
        "promptFingerprint": bundle.prompt.fingerprint,
        "rankingMode": bundle.ranking.get("mode"),
        "model": bundle.ranking.get("model"),
        "contextDatumIds": bundle.items.iter().map(|item| item.id.clone()).collect::<Vec<_>>(),
        "sources": sources,
        "suppliedItems": bundle.items,
        "composedContext": bundle.composed_context,
        "estimatedTokens": bundle.estimated_tokens,
        "omittedCount": bundle.omitted_count
    });
    let summary = format!(
        "SubMind supplied {} context data points for {}.",
        bundle.items.len(),
        bundle.project.name
    );

    sqlx::query(
        r#"INSERT INTO events
       (id, created_at, updated_at, project_id, session_id, thread_id, task_id,
        file_change_id, guidance_item_id, action_item_id, memory_item_id,
        origin_type, event_type, category, node_category, timestamp, summary, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'submind',
        'context_bundle_supplied', 'guidance', 'cognitive', ?, ?, ?)
       ON CONFLICT(id) DO NOTHING"#,
    )
    .bind(&bundle.audit_event_id)
    .bind(&bundle.generated_at)
    .bind(&bundle.generated_at)
    .bind(&bundle.project.id)
    .bind(session_id)
    .bind(&bundle.thread_id)
    .bind(source_id("FileChange"))
    .bind(source_id("GuidanceItem"))
    .bind(source_id("ActionItem"))
    .bind(source_id("MemoryItem"))
    .bind(&bundle.generated_at)
    .bind(summary)
    .bind(serde_json::to_string(&metadata).map_err(|_| "Failed to serialize audit metadata")?)
    .execute(&pool)
    .await
    .map_err(|error| format!("Failed to write context audit event: {error}"))?;

    pool.close().await;
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;

    fn test_project() -> ApiProject {
        ApiProject {
            kind: "Project",
            id: "project-submind".to_string(),
            created_at: "2026-07-01T00:00:00.000Z".to_string(),
            updated_at: "2026-07-03T00:00:00.000Z".to_string(),
            profile_id: "profile-primary".to_string(),
            name: "SubMind".to_string(),
            description: Some("Operator control plane".to_string()),
            summary: Some("Project-aware retained context".to_string()),
            workspace_path: None,
            repository_remote: None,
            descriptors: vec!["tauri".to_string(), "typescript".to_string()],
        }
    }

    fn test_request() -> NormalizedContextRequest {
        NormalizedContextRequest {
            project_id: Some("project-submind".to_string()),
            project_query: None,
            thread_id: None,
            prompt: "What architecture context matters?".to_string(),
            max_items: 8,
            max_tokens: 1_200,
            kinds: vec![
                "project_context".to_string(),
                "memory".to_string(),
                "guidance".to_string(),
                "pending_action".to_string(),
            ],
        }
    }

    #[test]
    fn context_request_requires_scope_and_bounded_prompt() {
        let missing_scope = normalize_context_request(ContextRequest {
            project_id: None,
            project_query: None,
            thread_id: None,
            prompt: "context".to_string(),
            max_items: None,
            max_tokens: None,
            kinds: None,
        });
        let empty_prompt = normalize_context_request(ContextRequest {
            project_id: Some("project-submind".to_string()),
            project_query: None,
            thread_id: None,
            prompt: "  ".to_string(),
            max_items: None,
            max_tokens: None,
            kinds: None,
        });

        assert!(missing_scope.is_err());
        assert!(empty_prompt.is_err());
    }

    #[test]
    fn deterministic_candidates_filter_state_and_redact_before_ranking() {
        let project = test_project();
        let mut snapshot = ApiSnapshot::default();
        snapshot.projects.push(project.clone());
        snapshot.memory.extend([
            ApiMemoryItem {
                kind: "MemoryItem",
                id: "memory-active".to_string(),
                created_at: project.created_at.clone(),
                updated_at: project.updated_at.clone(),
                project_id: Some(project.id.clone()),
                session_id: None,
                thread_id: None,
                bucket: "Architecture Notes".to_string(),
                status: "active".to_string(),
                summary: "API token policy".to_string(),
                content: "token = sm_abcdefghijklmnopqrstuvwxyz1234567890".to_string(),
                confidence: 0.9,
                freshness: 0.9,
                curation_state: "confirmed".to_string(),
                source_event_ids: Vec::new(),
                source_file_change_ids: Vec::new(),
                linked_action_item_ids: Vec::new(),
                linked_guidance_item_ids: Vec::new(),
                change_summary: None,
                is_pinned: true,
                is_edited: false,
            },
            ApiMemoryItem {
                kind: "MemoryItem",
                id: "memory-archived".to_string(),
                created_at: project.created_at.clone(),
                updated_at: project.updated_at.clone(),
                project_id: Some(project.id.clone()),
                session_id: None,
                thread_id: None,
                bucket: "Architecture Notes".to_string(),
                status: "archived".to_string(),
                summary: "Old context".to_string(),
                content: "Do not supply".to_string(),
                confidence: 1.0,
                freshness: 1.0,
                curation_state: "confirmed".to_string(),
                source_event_ids: Vec::new(),
                source_file_change_ids: Vec::new(),
                linked_action_item_ids: Vec::new(),
                linked_guidance_item_ids: Vec::new(),
                change_summary: None,
                is_pinned: false,
                is_edited: false,
            },
        ]);

        let candidates =
            create_context_candidates(&snapshot, &project, &test_request(), chrono::Utc::now());
        let active = candidates
            .iter()
            .find(|candidate| candidate.id == "context-memory-memory-active")
            .expect("active memory should be a candidate");

        assert_eq!(active.sensitivity, "protected_redacted");
        assert!(!active.content.contains("sm_abcdefghijklmnopqrstuvwxyz"));
        assert!(!candidates
            .iter()
            .any(|candidate| candidate.id.contains("memory-archived")));
    }

    #[test]
    fn model_results_cannot_inject_unknown_candidates() {
        let candidate = create_context_datum(
            ContextDatumDraft {
                id: "context-known".to_string(),
                kind: "project_context".to_string(),
                project_id: "project-submind".to_string(),
                thread_id: None,
                title: "Known".to_string(),
                content: "Known content".to_string(),
                confidence: 1.0,
                freshness: 1.0,
                base_score: 0.5,
                sources: Vec::new(),
            },
            &[],
            None,
        );
        let result = ModelContextResult {
            selections: vec![ModelContextSelection {
                datum_id: "context-invented".to_string(),
                relevance_score: 1.0,
                rationale: "Invented".to_string(),
            }],
            composed_context: "Invented content".to_string(),
        };

        assert!(apply_model_context_result(&[candidate], &result).is_empty());
    }

    #[test]
    fn context_budget_never_exceeds_item_limit() {
        let candidates = (0..5)
            .map(|index| ContextDatum {
                id: format!("context-{index}"),
                kind: "memory".to_string(),
                project_id: "project-submind".to_string(),
                thread_id: None,
                title: "Context".to_string(),
                content: "Content".to_string(),
                confidence: 1.0,
                freshness: 1.0,
                sensitivity: "normal".to_string(),
                deterministic_score: 0.5,
                relevance_score: 0.5,
                relevance_rationale: "Deterministic".to_string(),
                estimated_tokens: 20,
                sources: Vec::new(),
            })
            .collect();

        assert_eq!(select_context_budget(candidates, 2, 1_000).len(), 2);
    }

    #[test]
    fn context_audit_persists_exact_bundle_without_raw_prompt() {
        let db_path = std::env::temp_dir().join(format!(
            "submind-context-audit-{}-{}.db",
            std::process::id(),
            chrono::Utc::now().timestamp_micros()
        ));

        tauri::async_runtime::block_on(async {
            let options = SqliteConnectOptions::new()
                .filename(&db_path)
                .create_if_missing(true);
            let setup_pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(options)
                .await
                .expect("test database should open");
            sqlx::query(
                r#"CREATE TABLE events (
                  id TEXT PRIMARY KEY NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  project_id TEXT NOT NULL,
                  session_id TEXT,
                  thread_id TEXT,
                  task_id TEXT,
                  file_change_id TEXT,
                  guidance_item_id TEXT,
                  action_item_id TEXT,
                  memory_item_id TEXT,
                  origin_type TEXT NOT NULL,
                  event_type TEXT NOT NULL,
                  category TEXT NOT NULL,
                  node_category TEXT NOT NULL,
                  timestamp TEXT NOT NULL,
                  summary TEXT NOT NULL,
                  metadata_json TEXT NOT NULL
                )"#,
            )
            .execute(&setup_pool)
            .await
            .expect("events table should be created");
            setup_pool.close().await;

            let project = test_project();
            let snapshot = ApiSnapshot {
                projects: vec![project.clone()],
                ..ApiSnapshot::default()
            };
            let mut request = test_request();
            request.prompt = "Private operator prompt that must not be retained".to_string();
            request.kinds = vec!["project_context".to_string()];
            let bundle = create_context_bundle(&snapshot, &project, &request, None).await;

            write_context_audit_event(&db_path, &snapshot, &bundle)
                .await
                .expect("context audit should persist");

            let options = SqliteConnectOptions::new()
                .filename(&db_path)
                .create_if_missing(false)
                .read_only(true);
            let read_pool = SqlitePoolOptions::new()
                .max_connections(1)
                .connect_with(options)
                .await
                .expect("test database should reopen");
            let row = sqlx::query(
                "SELECT event_type, project_id, metadata_json FROM events WHERE id = ?",
            )
            .bind(&bundle.audit_event_id)
            .fetch_one(&read_pool)
            .await
            .expect("audit event should exist");
            let metadata =
                required_string(&row, "metadata_json").expect("audit metadata should be readable");

            assert_eq!(
                required_string(&row, "event_type").expect("event type should exist"),
                "context_bundle_supplied"
            );
            assert_eq!(
                required_string(&row, "project_id").expect("project id should exist"),
                project.id
            );
            assert!(metadata.contains(&bundle.bundle_id));
            assert!(metadata.contains(&bundle.composed_context));
            assert!(!metadata.contains("Private operator prompt"));
            read_pool.close().await;
        });

        let _ = std::fs::remove_file(db_path);
    }
}
