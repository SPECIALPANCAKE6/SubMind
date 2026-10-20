use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

const DEFAULT_HERMES_URL: &str = "http://127.0.0.1:8642";
const SETTINGS_FILE_NAME: &str = "hermes-delivery.json";
const MAX_API_KEY_LEN: usize = 512;
const HERMES_TIMEOUT_SECS: u64 = 120;
const MAX_HERMES_MESSAGE_BYTES: usize = 32 * 1024;
const MAX_HERMES_RESPONSE_BYTES: usize = 4 * 1024 * 1024;
const HERMES_CHAT_OBJECT: &str = "hermes.session.chat.completion";

/// Native-only settings file. The key is stored here, never in SQLite, and is
/// never serialized back to the webview.
#[derive(Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct HermesStoredSettings {
    pub base_url: Option<String>,
    pub allow_remote: bool,
    pub api_key: Option<String>,
}

impl fmt::Debug for HermesStoredSettings {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("HermesStoredSettings")
            .field("base_url", &self.base_url)
            .field("allow_remote", &self.allow_remote)
            .field("api_key", &self.api_key.as_ref().map(|_| "[redacted]"))
            .finish()
    }
}

#[derive(Clone, PartialEq, Eq)]
pub struct HermesDeliveryConfig {
    pub base_url: String,
    pub api_key: String,
}

impl fmt::Debug for HermesDeliveryConfig {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("HermesDeliveryConfig")
            .field("base_url", &self.base_url)
            .field("api_key", &"[redacted]")
            .finish()
    }
}

/// What the settings UI may see. It never contains the key.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HermesDeliveryStatus {
    pub configured: bool,
    pub base_url: String,
    pub allow_remote: bool,
    pub key_configured: bool,
    pub key_source: Option<String>,
    pub base_url_from_environment: bool,
    pub allow_remote_from_environment: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesSettingsInput {
    pub base_url: Option<String>,
    pub allow_remote: bool,
    /// Write-only. `None` or blank keeps the stored key.
    pub api_key: Option<String>,
    pub clear_api_key: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesDeliveryResponse {
    pub delivery_id: String,
}

fn nonblank(value: Option<String>) -> Option<String> {
    value.filter(|text| !text.trim().is_empty())
}

pub fn settings_path(config_dir: &Path) -> PathBuf {
    config_dir.join(SETTINGS_FILE_NAME)
}

pub fn load_stored_settings(config_dir: &Path) -> Result<HermesStoredSettings, String> {
    match fs::read_to_string(settings_path(config_dir)) {
        Ok(text) => serde_json::from_str(&text)
            .map_err(|_| "The saved Hermes settings file is unreadable.".to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(HermesStoredSettings::default())
        }
        Err(_) => Err("The saved Hermes settings file could not be read.".to_string()),
    }
}

fn write_stored_settings(
    config_dir: &Path,
    settings: &HermesStoredSettings,
) -> Result<(), String> {
    fs::create_dir_all(config_dir)
        .map_err(|_| "The Hermes settings directory could not be created.".to_string())?;
    let target = settings_path(config_dir);
    let staging = config_dir.join(format!("{SETTINGS_FILE_NAME}.tmp"));
    let body = serde_json::to_vec_pretty(settings)
        .map_err(|_| "Hermes settings could not be serialized.".to_string())?;
    fs::write(&staging, body)
        .map_err(|_| "Hermes settings could not be written.".to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&staging, fs::Permissions::from_mode(0o600));
    }
    fs::rename(&staging, &target)
        .map_err(|_| "Hermes settings could not be saved.".to_string())
}

fn is_loopback_host(host: Option<&str>) -> bool {
    host.map(|value| {
        let trimmed = value.trim_start_matches('[').trim_end_matches(']');
        trimmed
            .parse::<std::net::IpAddr>()
            .map(|address| address.is_loopback())
            .unwrap_or(trimmed == "localhost")
    })
    .unwrap_or(false)
}

/// Returns the normalized base URL, or why it is not acceptable.
pub fn validate_hermes_endpoint(base_url: &str, allow_remote: bool) -> Result<String, String> {
    let parsed = reqwest::Url::parse(base_url)
        .map_err(|_| "The Hermes URL is not a valid URL".to_string())?;

    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("The Hermes URL must use HTTP or HTTPS".to_string());
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("The Hermes URL must not embed credentials".to_string());
    }
    if !is_loopback_host(parsed.host_str()) {
        if !allow_remote {
            return Err("Remote Hermes servers require allowing remote servers".to_string());
        }
        if parsed.scheme() != "https" {
            return Err("Remote Hermes servers must use HTTPS".to_string());
        }
    }

    Ok(base_url.trim_end_matches('/').to_string())
}

fn validate_api_key(key: &str) -> Result<(), String> {
    if key.len() > MAX_API_KEY_LEN
        || key.chars().any(|character| character.is_whitespace() || character.is_control())
    {
        return Err("The Hermes API key must be a single token without whitespace".to_string());
    }
    Ok(())
}

struct EffectiveSettings {
    api_key: Option<String>,
    key_source: Option<&'static str>,
    base_url: String,
    base_url_from_environment: bool,
    allow_remote: bool,
    allow_remote_from_environment: bool,
}

// Environment variables override the saved settings so deployments can pin them.
fn effective_settings(
    get: &impl Fn(&str) -> Option<String>,
    stored: &HermesStoredSettings,
) -> EffectiveSettings {
    let env_key = nonblank(get("SUBMIND_HERMES_API_KEY"));
    let stored_key = nonblank(stored.api_key.clone());
    let (api_key, key_source) = match (env_key, stored_key) {
        (Some(key), _) => (Some(key), Some("environment")),
        (None, Some(key)) => (Some(key), Some("settings")),
        (None, None) => (None, None),
    };
    let env_url = nonblank(get("SUBMIND_HERMES_API_URL"));
    let base_url_from_environment = env_url.is_some();
    let base_url = env_url
        .or_else(|| nonblank(stored.base_url.clone()))
        .unwrap_or_else(|| DEFAULT_HERMES_URL.to_string());
    let env_allow = get("SUBMIND_HERMES_ALLOW_REMOTE");
    let allow_remote_from_environment = env_allow.is_some();
    let allow_remote = match env_allow {
        Some(value) => value.eq_ignore_ascii_case("true"),
        None => stored.allow_remote,
    };

    EffectiveSettings {
        api_key,
        key_source,
        base_url,
        base_url_from_environment,
        allow_remote,
        allow_remote_from_environment,
    }
}

pub fn resolve_hermes_config_from(
    get: impl Fn(&str) -> Option<String>,
    stored: &HermesStoredSettings,
) -> Result<Option<HermesDeliveryConfig>, String> {
    let effective = effective_settings(&get, stored);
    let Some(api_key) = effective.api_key else {
        return Ok(None);
    };
    let base_url = validate_hermes_endpoint(&effective.base_url, effective.allow_remote)?;

    Ok(Some(HermesDeliveryConfig { base_url, api_key }))
}

fn build_status(
    get: impl Fn(&str) -> Option<String>,
    stored: &HermesStoredSettings,
) -> HermesDeliveryStatus {
    let effective = effective_settings(&get, stored);
    let validation = validate_hermes_endpoint(&effective.base_url, effective.allow_remote);
    let reason = match (&effective.api_key, &validation) {
        (None, _) => Some(
            "Save a Hermes API key in Settings (or set SUBMIND_HERMES_API_KEY) to enable Hermes delivery."
                .to_string(),
        ),
        (Some(_), Err(error)) => Some(error.clone()),
        _ => None,
    };

    HermesDeliveryStatus {
        configured: effective.api_key.is_some() && validation.is_ok(),
        base_url: effective.base_url,
        allow_remote: effective.allow_remote,
        key_configured: effective.api_key.is_some(),
        key_source: effective.key_source.map(str::to_string),
        base_url_from_environment: effective.base_url_from_environment,
        allow_remote_from_environment: effective.allow_remote_from_environment,
        reason,
    }
}

pub fn hermes_delivery_status(config_dir: &Path) -> HermesDeliveryStatus {
    match load_stored_settings(config_dir) {
        Ok(stored) => build_status(|name| env::var(name).ok(), &stored),
        Err(error) => {
            let mut status = build_status(
                |name| env::var(name).ok(),
                &HermesStoredSettings::default(),
            );
            status.configured = false;
            status.reason = Some(error);
            status
        }
    }
}

pub fn save_hermes_delivery_settings(
    config_dir: &Path,
    input: HermesSettingsInput,
) -> Result<HermesDeliveryStatus, String> {
    // An unreadable file is replaced by the operator's new values.
    let mut stored = load_stored_settings(config_dir).unwrap_or_default();
    let base_url = nonblank(input.base_url.map(|value| value.trim().to_string()));

    if let Some(url) = &base_url {
        stored.base_url = Some(validate_hermes_endpoint(url, input.allow_remote)?);
    } else {
        stored.base_url = None;
    }
    stored.allow_remote = input.allow_remote;

    if input.clear_api_key {
        stored.api_key = None;
    }
    if let Some(key) = nonblank(input.api_key) {
        let key = key.trim().to_string();
        validate_api_key(&key)?;
        stored.api_key = Some(key);
    }

    write_stored_settings(config_dir, &stored)?;
    Ok(build_status(|name| env::var(name).ok(), &stored))
}

pub async fn deliver_hermes_session_message(
    config_dir: PathBuf,
    hermes_session_id: String,
    message: String,
) -> Result<HermesDeliveryResponse, String> {
    let stored = load_stored_settings(&config_dir)?;
    let config = resolve_hermes_config_from(|name| env::var(name).ok(), &stored)?
        .ok_or_else(|| "Hermes delivery is not configured".to_string())?;
    let session_id = hermes_session_id.trim();

    if session_id.is_empty()
        || session_id.len() > 200
        || !session_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-_.:".contains(character))
    {
        return Err("Hermes session id is not valid".to_string());
    }
    if message.trim().is_empty() {
        return Err("Hermes delivery message is empty".to_string());
    }
    if message.len() > MAX_HERMES_MESSAGE_BYTES {
        return Err("Hermes delivery message exceeds the size limit".to_string());
    }

    let url = format!("{}/api/sessions/{}/chat", config.base_url, session_id);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(HERMES_TIMEOUT_SECS))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| "failed to initialize Hermes client".to_string())?;
    let response = client
        .post(url)
        .bearer_auth(&config.api_key)
        .json(&json!({ "message": message }))
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "Hermes did not respond in time; delivery outcome is unknown".to_string()
            } else {
                "Hermes server could not be reached; nothing was delivered".to_string()
            }
        })?;
    let status = response.status();

    if status.as_u16() == 401 || status.as_u16() == 403 {
        return Err("Hermes rejected the API key; nothing was delivered".to_string());
    }
    if status.as_u16() == 404 {
        return Err("Hermes session was not found; nothing was delivered".to_string());
    }
    if !status.is_success() {
        return Err(format!(
            "Hermes returned status {}; delivery was not confirmed",
            status.as_u16()
        ));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_HERMES_RESPONSE_BYTES as u64)
    {
        return Err("Hermes response exceeds the size limit; delivery unconfirmed".to_string());
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|_| "Hermes response could not be read; delivery unconfirmed".to_string())?;
    let body: Value = serde_json::from_slice(&bytes)
        .map_err(|_| "Hermes response was not valid JSON; delivery unconfirmed".to_string())?;

    if body.get("object").and_then(Value::as_str) != Some(HERMES_CHAT_OBJECT) {
        return Err("Hermes response was not a session chat completion; delivery unconfirmed".to_string());
    }

    Ok(HermesDeliveryResponse {
        delivery_id: format!("hermes-session-chat-{}", uuid_like()),
    })
}

fn uuid_like() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or(0);
    format!("{nanos:x}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn config(entries: &[(&str, &str)]) -> Result<Option<HermesDeliveryConfig>, String> {
        config_with(entries, &HermesStoredSettings::default())
    }

    fn config_with(
        entries: &[(&str, &str)],
        stored: &HermesStoredSettings,
    ) -> Result<Option<HermesDeliveryConfig>, String> {
        let map: HashMap<String, String> = entries
            .iter()
            .map(|(key, value)| (key.to_string(), value.to_string()))
            .collect();
        resolve_hermes_config_from(|name| map.get(name).cloned(), stored)
    }

    fn temp_dir(name: &str) -> PathBuf {
        let dir = env::temp_dir().join(format!("submind-hermes-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir
    }

    fn input(url: Option<&str>, allow_remote: bool, key: Option<&str>) -> HermesSettingsInput {
        HermesSettingsInput {
            base_url: url.map(str::to_string),
            allow_remote,
            api_key: key.map(str::to_string),
            clear_api_key: false,
        }
    }

    #[test]
    fn saved_settings_apply_and_environment_overrides_them() {
        let stored = HermesStoredSettings {
            base_url: Some("https://hermes.example.com".to_string()),
            allow_remote: true,
            api_key: Some("saved".to_string()),
        };
        let resolved = config_with(&[], &stored).unwrap().unwrap();
        assert_eq!(resolved.base_url, "https://hermes.example.com");
        assert_eq!(resolved.api_key, "saved");

        let overridden = config_with(
            &[
                ("SUBMIND_HERMES_API_KEY", "env"),
                ("SUBMIND_HERMES_API_URL", "http://127.0.0.1:9000"),
            ],
            &stored,
        )
        .unwrap()
        .unwrap();
        assert_eq!(overridden.api_key, "env");
        assert_eq!(overridden.base_url, "http://127.0.0.1:9000");
    }

    #[test]
    fn save_round_trips_without_exposing_the_key() {
        let dir = temp_dir("roundtrip");
        let status = save_hermes_delivery_settings(
            &dir,
            input(Some("http://localhost:8642/"), false, Some("secret-token")),
        )
        .unwrap();
        assert!(status.key_configured);
        assert_eq!(status.base_url, "http://localhost:8642");
        assert!(!format!("{status:?}").contains("secret-token"));
        assert!(!serde_json::to_string(&status).unwrap().contains("secret-token"));

        // A later save without a key keeps the stored key.
        save_hermes_delivery_settings(&dir, input(None, false, None)).unwrap();
        let stored = load_stored_settings(&dir).unwrap();
        assert_eq!(stored.api_key.as_deref(), Some("secret-token"));
        assert!(!format!("{stored:?}").contains("secret-token"));

        let mut clear = input(None, false, None);
        clear.clear_api_key = true;
        save_hermes_delivery_settings(&dir, clear).unwrap();
        assert_eq!(load_stored_settings(&dir).unwrap().api_key, None);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_rejects_unsafe_values_and_keeps_previous_settings() {
        let dir = temp_dir("reject");
        save_hermes_delivery_settings(&dir, input(None, false, Some("keep-me"))).unwrap();
        assert!(save_hermes_delivery_settings(
            &dir,
            input(Some("http://example.com"), false, None)
        )
        .is_err());
        assert!(save_hermes_delivery_settings(&dir, input(None, false, Some("has space"))).is_err());
        assert_eq!(
            load_stored_settings(&dir).unwrap().api_key.as_deref(),
            Some("keep-me")
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn status_reports_unconfigured_without_a_key() {
        let status = build_status(|_| None, &HermesStoredSettings::default());
        assert!(!status.configured);
        assert!(status.reason.is_some());
        assert_eq!(status.base_url, DEFAULT_HERMES_URL);
    }

    #[test]
    fn unconfigured_without_key() {
        assert_eq!(config(&[]).unwrap(), None);
    }

    #[test]
    fn defaults_to_loopback_url() {
        let resolved = config(&[("SUBMIND_HERMES_API_KEY", "k")]).unwrap().unwrap();
        assert_eq!(resolved.base_url, "http://127.0.0.1:8642");
    }

    #[test]
    fn rejects_remote_without_opt_in_and_plain_http_remote() {
        let url = ("SUBMIND_HERMES_API_URL", "http://example.com");
        assert!(config(&[("SUBMIND_HERMES_API_KEY", "k"), url]).is_err());
        assert!(config(&[
            ("SUBMIND_HERMES_API_KEY", "k"),
            url,
            ("SUBMIND_HERMES_ALLOW_REMOTE", "true")
        ])
        .is_err());
        assert!(config(&[
            ("SUBMIND_HERMES_API_KEY", "k"),
            ("SUBMIND_HERMES_API_URL", "https://example.com/"),
            ("SUBMIND_HERMES_ALLOW_REMOTE", "true")
        ])
        .unwrap()
        .is_some());
    }

    #[test]
    fn rejects_embedded_credentials() {
        assert!(config(&[
            ("SUBMIND_HERMES_API_KEY", "k"),
            ("SUBMIND_HERMES_API_URL", "http://user:pw@127.0.0.1:8642")
        ])
        .is_err());
    }
}
