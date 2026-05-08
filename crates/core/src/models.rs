use serde::{Deserialize, Serialize};

// ── GitHub API response types ──────────────────────────────────────────────

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct GitHubUser {
    pub login: String,
    pub id: u64,
    pub name: Option<String>,
    pub avatar_url: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct GitHubRepo {
    pub id: u64,
    pub name: String,
    pub full_name: String,
    pub private: bool,
    pub description: Option<String>,
    pub html_url: String,
    pub pushed_at: Option<String>,
    #[serde(default)]
    pub stargazers_count: u64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TrafficViews {
    pub count: i64,
    pub uniques: i64,
    pub views: Vec<TrafficDay>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TrafficClones {
    pub count: i64,
    pub uniques: i64,
    pub clones: Vec<TrafficDay>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct TrafficDay {
    pub timestamp: String,
    pub count: i64,
    pub uniques: i64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Referrer {
    pub referrer: String,
    pub count: i64,
    pub uniques: i64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct PopularPath {
    pub path: String,
    pub title: String,
    pub count: i64,
    pub uniques: i64,
}

// ── GitHub Releases API ────────────────────────────────────────────────────

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct GitHubAsset {
    pub id: i64,
    pub name: String,
    pub download_count: i64,
    pub size: i64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct GitHubRelease {
    pub id: i64,
    pub tag_name: String,
    pub name: Option<String>,
    pub published_at: String,
    pub html_url: String,
    pub prerelease: bool,
    pub draft: bool,
    pub assets: Vec<GitHubAsset>,
}

// ── DB row types (returned from queries, serialized over Tauri IPC) ────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StarSnapshot {
    pub id: i64,
    pub repo_id: i64,
    pub date: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DeviceCodeResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AccessTokenResponse {
    pub access_token: Option<String>,
    pub error: Option<String>,
    pub error_description: Option<String>,
    pub interval: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbRelease {
    pub id: i64,
    pub repo_id: i64,
    pub github_id: i64,
    pub tag_name: String,
    pub name: Option<String>,
    pub published_at: String,
    pub html_url: String,
    pub prerelease: bool,
    pub total_downloads: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Insight {
    pub kind: String,
    pub title: String,
    pub body: String,
    pub severity: String,
}

// ── DB row types (returned from queries, serialized over Tauri IPC) ────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DbRepo {
    pub id: i64,
    pub github_id: i64,
    pub name: String,
    pub full_name: String,
    pub private: bool,
    pub description: Option<String>,
    pub html_url: String,
    pub tracking: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TrafficDayRow {
    pub date: String,
    pub count: i64,
    pub uniques: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReferrerRow {
    pub referrer: String,
    pub count: i64,
    pub uniques: i64,
    pub synced_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PathRow {
    pub path: String,
    pub title: String,
    pub count: i64,
    pub uniques: i64,
    pub synced_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncLogRow {
    pub id: i64,
    pub repo_id: Option<i64>,
    pub repo_full_name: Option<String>,
    pub synced_at: String,
    pub status: String,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncResult {
    pub repo_full_name: String,
    pub status: String,
    pub error: Option<String>,
}
