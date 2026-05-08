#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use std::sync::{Arc, Mutex};
use tauri::Manager;

pub struct AppState {
    pub db: Arc<Mutex<rusqlite::Connection>>,
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data directory");
            std::fs::create_dir_all(&data_dir).expect("Failed to create app data directory");

            let db_path = data_dir.join("repopulse.db");
            let conn = repopulse_core::db::initialize(&db_path)
                .expect("Failed to initialize SQLite database");

            app.manage(AppState {
                db: Arc::new(Mutex::new(conn)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::save_token,
            commands::load_token,
            commands::delete_token,
            commands::verify_token,
            commands::list_github_repos,
            commands::get_tracked_repos,
            commands::set_tracking,
            commands::sync_repo,
            commands::sync_all,
            commands::get_views,
            commands::get_clones,
            commands::get_referrers,
            commands::get_paths,
            commands::get_sync_log,
            commands::export_json,
            commands::export_csv,
            commands::import_backup,
            commands::get_releases,
            commands::get_insights,
            commands::get_star_snapshots,
            commands::get_last_sync_time,
            commands::open_url,
            commands::is_device_flow_configured,
            commands::start_device_flow,
            commands::poll_device_flow,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
