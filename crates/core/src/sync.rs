use anyhow::Result;
use std::sync::{Arc, Mutex};

use crate::{
    db,
    github::GitHubClient,
    models::{DbRepo, SyncResult},
};

pub async fn sync_repo(
    db: &Arc<Mutex<rusqlite::Connection>>,
    client: &GitHubClient,
    repo: &DbRepo,
) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();

    // Views
    match client.get_traffic_views(&repo.full_name).await {
        Ok(traffic) => {
            let conn = db.lock().unwrap();
            db::upsert_views(&conn, repo.id, &traffic.views)?;
        }
        Err(e) => {
            let conn = db.lock().unwrap();
            db::log_sync(&conn, repo.id, "error", Some(&e.to_string()))?;
            return Err(e);
        }
    }

    // Clones
    match client.get_traffic_clones(&repo.full_name).await {
        Ok(traffic) => {
            let conn = db.lock().unwrap();
            db::upsert_clones(&conn, repo.id, &traffic.clones)?;
        }
        Err(e) => {
            // Non-fatal; log and continue
            eprintln!("Clones fetch failed for {}: {e}", repo.full_name);
        }
    }

    // Referrers
    match client.get_referrers(&repo.full_name).await {
        Ok(referrers) => {
            let conn = db.lock().unwrap();
            db::insert_referrers(&conn, repo.id, &referrers, &now)?;
        }
        Err(e) => {
            eprintln!("Referrers fetch failed for {}: {e}", repo.full_name);
        }
    }

    // Popular paths
    match client.get_popular_paths(&repo.full_name).await {
        Ok(paths) => {
            let conn = db.lock().unwrap();
            db::insert_paths(&conn, repo.id, &paths, &now)?;
        }
        Err(e) => {
            eprintln!("Paths fetch failed for {}: {e}", repo.full_name);
        }
    }

    // Releases (non-fatal; drafts skipped)
    match client.get_releases(&repo.full_name).await {
        Ok(releases) => {
            let conn = db.lock().unwrap();
            for release in &releases {
                if release.draft {
                    continue;
                }
                if let Err(e) = db::upsert_release(&conn, repo.id, release) {
                    eprintln!(
                        "Failed to upsert release {} for {}: {e}",
                        release.tag_name, repo.full_name
                    );
                }
            }
        }
        Err(e) => {
            eprintln!("Releases fetch failed for {}: {e}", repo.full_name);
        }
    }

    // Stars snapshot (non-fatal)
    match client.get_repo(&repo.full_name).await {
        Ok(gh_repo) => {
            let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
            let conn = db.lock().unwrap();
            if let Err(e) =
                db::upsert_star_snapshot(&conn, repo.id, &today, gh_repo.stargazers_count as i64)
            {
                eprintln!("Failed to upsert star snapshot for {}: {e}", repo.full_name);
            }
        }
        Err(e) => {
            eprintln!("Star snapshot fetch failed for {}: {e}", repo.full_name);
        }
    }

    let conn = db.lock().unwrap();
    db::log_sync(&conn, repo.id, "success", None)?;
    Ok(())
}

pub async fn sync_all(db: &Arc<Mutex<rusqlite::Connection>>, token: &str) -> Vec<SyncResult> {
    let tracked = {
        let conn = db.lock().unwrap();
        match crate::db::get_tracked_repos(&conn) {
            Ok(repos) => repos,
            Err(e) => {
                eprintln!("Failed to load tracked repos: {e}");
                return vec![];
            }
        }
    };

    let client = GitHubClient::new(token.to_string());
    let mut results = vec![];

    for repo in &tracked {
        let result = match sync_repo(db, &client, repo).await {
            Ok(()) => SyncResult {
                repo_full_name: repo.full_name.clone(),
                status: "success".to_string(),
                error: None,
            },
            Err(e) => SyncResult {
                repo_full_name: repo.full_name.clone(),
                status: "error".to_string(),
                error: Some(e.to_string()),
            },
        };
        results.push(result);
    }

    results
}
