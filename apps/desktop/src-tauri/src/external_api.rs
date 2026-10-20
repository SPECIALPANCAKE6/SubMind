use tauri::{AppHandle, Manager};

pub fn start_external_api_server(app: AppHandle) {
    if let Ok(path) = app.path().app_data_dir() {
        submind_runtime::external_api::start_external_api_server(path.join("submind.db"));
    }
}

fn hermes_config_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "The app data directory is unavailable.".to_string())
}

#[tauri::command(rename_all = "camelCase")]
pub fn get_hermes_delivery_status(
    app: AppHandle,
) -> Result<submind_runtime::hermes_delivery::HermesDeliveryStatus, String> {
    Ok(submind_runtime::hermes_delivery::hermes_delivery_status(
        &hermes_config_dir(&app)?,
    ))
}

#[tauri::command(rename_all = "camelCase")]
pub fn save_hermes_delivery_settings(
    app: AppHandle,
    settings: submind_runtime::hermes_delivery::HermesSettingsInput,
) -> Result<submind_runtime::hermes_delivery::HermesDeliveryStatus, String> {
    submind_runtime::hermes_delivery::save_hermes_delivery_settings(
        &hermes_config_dir(&app)?,
        settings,
    )
}

#[tauri::command(rename_all = "camelCase")]
pub async fn deliver_hermes_session_message(
    app: AppHandle,
    hermes_session_id: String,
    message: String,
) -> Result<submind_runtime::hermes_delivery::HermesDeliveryResponse, String> {
    submind_runtime::hermes_delivery::deliver_hermes_session_message(
        hermes_config_dir(&app)?,
        hermes_session_id,
        message,
    )
    .await
}

#[tauri::command(rename_all = "camelCase")]
pub async fn execute_model_worker(
    checkpoint: String,
    worker: String,
    scope: submind_runtime::external_api::ModelWorkerJson,
    context: submind_runtime::external_api::ModelWorkerJson,
    prior_results: submind_runtime::external_api::ModelWorkerJson,
) -> Result<submind_runtime::external_api::ModelWorkerResponse, String> {
    submind_runtime::external_api::execute_model_worker(
        checkpoint,
        worker,
        scope,
        context,
        prior_results,
    )
    .await
}
