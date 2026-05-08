use std::sync::Arc;
use tauri::State;

use repopulse_core::{db, github::GitHubClient, insights, models::*, oauth, sync, token};

use crate::AppState;

// ── Token management ───────────────────────────────────────────────────────

#[tauri::command]
pub fn save_token(tok: String) -> Result<(), String> {
    token::save(&tok).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_token() -> Result<Option<String>, String> {
    match token::load() {
        Ok(t) => Ok(Some(t)),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub fn delete_token() -> Result<(), String> {
    token::delete().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn verify_token() -> Result<GitHubUser, String> {
    let tok = token::load().map_err(|e| e.to_string())?;
    let client = GitHubClient::new(tok);
    client.get_user().await.map_err(|e| e.to_string())
}

// ── Repository management ──────────────────────────────────────────────────

#[tauri::command]
pub async fn list_github_repos(state: State<'_, AppState>) -> Result<Vec<DbRepo>, String> {
    let tok = token::load().map_err(|e| e.to_string())?;
    let client = GitHubClient::new(tok);
    let gh_repos = client.list_repos().await.map_err(|e| e.to_string())?;

    // Upsert all returned repos so they exist in our DB
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || {
        let conn = db.lock().unwrap();
        for r in &gh_repos {
            db::upsert_repo(&conn, r).ok();
        }
        db::get_all_repos(&conn).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn get_tracked_repos(state: State<'_, AppState>) -> Result<Vec<DbRepo>, String> {
    let conn = state.db.lock().unwrap();
    db::get_tracked_repos(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_tracking(
    state: State<'_, AppState>,
    github_id: i64,
    tracking: bool,
) -> Result<(), String> {
    let conn = state.db.lock().unwrap();
    db::set_tracking(&conn, github_id, tracking).map_err(|e| e.to_string())
}

// ── Sync ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn sync_repo(
    state: State<'_, AppState>,
    repo_full_name: String,
) -> Result<SyncResult, String> {
    let tok = token::load().map_err(|e| e.to_string())?;
    let db = Arc::clone(&state.db);

    let repo = {
        let conn = db.lock().unwrap();
        db::get_repo_by_full_name(&conn, &repo_full_name)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("Repo '{repo_full_name}' not found in local database"))?
    };

    let client = GitHubClient::new(tok);
    match sync::sync_repo(&db, &client, &repo).await {
        Ok(()) => Ok(SyncResult {
            repo_full_name: repo.full_name,
            status: "success".to_string(),
            error: None,
        }),
        Err(e) => Ok(SyncResult {
            repo_full_name: repo.full_name,
            status: "error".to_string(),
            error: Some(e.to_string()),
        }),
    }
}

#[tauri::command]
pub async fn sync_all(state: State<'_, AppState>) -> Result<Vec<SyncResult>, String> {
    let tok = token::load().map_err(|e| e.to_string())?;
    let db = Arc::clone(&state.db);
    Ok(sync::sync_all(&db, &tok).await)
}

// ── Traffic queries ────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_views(
    state: State<'_, AppState>,
    repo_id: i64,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Vec<TrafficDayRow>, String> {
    let conn = state.db.lock().unwrap();
    db::get_views(&conn, repo_id, start_date.as_deref(), end_date.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_clones(
    state: State<'_, AppState>,
    repo_id: i64,
    start_date: Option<String>,
    end_date: Option<String>,
) -> Result<Vec<TrafficDayRow>, String> {
    let conn = state.db.lock().unwrap();
    db::get_clones(&conn, repo_id, start_date.as_deref(), end_date.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_referrers(state: State<'_, AppState>, repo_id: i64) -> Result<Vec<ReferrerRow>, String> {
    let conn = state.db.lock().unwrap();
    db::get_referrers_latest(&conn, repo_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_paths(state: State<'_, AppState>, repo_id: i64) -> Result<Vec<PathRow>, String> {
    let conn = state.db.lock().unwrap();
    db::get_paths_latest(&conn, repo_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_sync_log(
    state: State<'_, AppState>,
    limit: Option<i64>,
) -> Result<Vec<SyncLogRow>, String> {
    let conn = state.db.lock().unwrap();
    db::get_sync_log(&conn, limit.unwrap_or(50)).map_err(|e| e.to_string())
}

// ── Export / Import ────────────────────────────────────────────────────────

#[tauri::command]
pub fn export_json(state: State<'_, AppState>) -> Result<String, String> {
    let conn = state.db.lock().unwrap();
    let data = db::export_all(&conn).map_err(|e| e.to_string())?;
    serde_json::to_string_pretty(&data).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_csv(state: State<'_, AppState>, repo_id: i64) -> Result<String, String> {
    let conn = state.db.lock().unwrap();
    db::export_repo_csv(&conn, repo_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_backup(state: State<'_, AppState>, json: String) -> Result<(), String> {
    let data: serde_json::Value =
        serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {e}"))?;
    let mut conn = state.db.lock().unwrap();
    db::import_backup(&mut conn, &data).map_err(|e| e.to_string())
}

// ── Stars ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_star_snapshots(
    state: State<'_, AppState>,
    repo_id: i64,
) -> Result<Vec<StarSnapshot>, String> {
    let conn = state.db.lock().unwrap();
    db::get_star_snapshots(&conn, repo_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_last_sync_time(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let conn = state.db.lock().unwrap();
    db::get_last_sync_time(&conn).map_err(|e| e.to_string())
}

// ── Shell ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    open::that(url).map_err(|e| e.to_string())
}

// ── OAuth Device Flow ──────────────────────────────────────────────────────

#[tauri::command]
pub fn is_device_flow_configured() -> bool {
    oauth::is_configured()
}

#[tauri::command]
pub async fn start_device_flow() -> Result<DeviceCodeResponse, String> {
    oauth::start_device_flow().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn poll_device_flow(device_code: String) -> Result<AccessTokenResponse, String> {
    oauth::poll_device_flow(&device_code)
        .await
        .map_err(|e| e.to_string())
}

// ── Releases & Insights ────────────────────────────────────────────────────

#[tauri::command]
pub fn get_releases(state: State<'_, AppState>, repo_id: i64) -> Result<Vec<DbRelease>, String> {
    let conn = state.db.lock().unwrap();
    db::get_releases(&conn, repo_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_insights(state: State<'_, AppState>, repo_id: i64) -> Result<Vec<Insight>, String> {
    let conn = state.db.lock().unwrap();
    insights::generate(&conn, repo_id).map_err(|e| e.to_string())
}
