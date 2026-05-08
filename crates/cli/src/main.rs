use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use repopulse_core::{db, github::GitHubClient, sync, token};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

#[derive(Parser)]
#[command(
    name = "repopulse",
    about = "GitHub traffic tracker — CLI mode",
    version
)]
struct Cli {
    /// SQLite database path. Defaults to the normal RepoPulse app data location.
    #[arg(long, global = true)]
    db: Option<PathBuf>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Sync traffic for all tracked repositories
    Sync,
    /// Run forever and sync tracked repositories on an interval
    Daemon {
        /// Minutes between syncs
        #[arg(long, default_value_t = 240)]
        interval_minutes: u64,
    },
    /// Track a repository by full name, e.g. owner/repo
    Track {
        /// Repository full name, e.g. owner/repo
        repo: String,
    },
    /// Stop tracking a repository by full name, e.g. owner/repo
    Untrack {
        /// Repository full name, e.g. owner/repo
        repo: String,
    },
    /// List tracked repositories
    ListRepos,
    /// Show collector status
    Status,
    /// Export data to JSON or CSV
    Export {
        /// Output format: json (default) or csv
        #[arg(long, default_value = "json")]
        format: String,
        /// Repo full name for CSV export (e.g. owner/repo). Required for --format csv
        #[arg(long)]
        repo: Option<String>,
        /// Output file path (default: repopulse-export.{json|csv})
        #[arg(short, long)]
        output: Option<PathBuf>,
    },
}

fn db_path() -> PathBuf {
    dirs::data_dir()
        .expect("Cannot determine data directory")
        .join("com.repopulse.app")
        .join("repopulse.db")
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    let db_path = cli.db.unwrap_or_else(db_path);
    let conn = db::initialize(&db_path)
        .with_context(|| format!("Failed to open database at {}", db_path.display()))?;
    let db = Arc::new(Mutex::new(conn));

    match cli.command {
        Commands::Sync => cmd_sync(&db).await,
        Commands::Daemon { interval_minutes } => cmd_daemon(&db, interval_minutes).await,
        Commands::Track { repo } => cmd_track(&db, &repo).await,
        Commands::Untrack { repo } => cmd_untrack(&db, &repo),
        Commands::ListRepos => cmd_list_repos(&db),
        Commands::Status => cmd_status(&db),
        Commands::Export {
            format,
            repo,
            output,
        } => cmd_export(&db, &format, repo.as_deref(), output.as_deref()).await,
    }
}

async fn cmd_sync(db: &Arc<Mutex<rusqlite::Connection>>) -> Result<()> {
    let tok = token::load().context(
        "No GitHub token configured. Set REPOPULSE_GITHUB_TOKEN/GITHUB_TOKEN or run the desktop app once.",
    )?;

    let tracked = {
        let conn = db.lock().unwrap();
        db::get_tracked_repos(&conn)?
    };

    if tracked.is_empty() {
        eprintln!("No repos are being tracked. Use the desktop app to add repos first.");
        return Ok(());
    }

    println!("Syncing {} repo(s)...", tracked.len());
    let results = sync::sync_all(db, &tok).await;

    for r in &results {
        match r.status.as_str() {
            "success" => println!("  ✓ {}", r.repo_full_name),
            _ => eprintln!(
                "  ✗ {} — {}",
                r.repo_full_name,
                r.error.as_deref().unwrap_or("unknown error")
            ),
        }
    }

    let ok = results.iter().filter(|r| r.status == "success").count();
    println!("Done: {ok}/{} succeeded.", results.len());
    Ok(())
}

async fn cmd_daemon(db: &Arc<Mutex<rusqlite::Connection>>, interval_minutes: u64) -> Result<()> {
    let interval_minutes = interval_minutes.max(5);
    println!("RepoPulse collector running. Sync interval: {interval_minutes} minute(s).");

    loop {
        let started = chrono::Utc::now().to_rfc3339();
        println!("[{started}] Starting scheduled sync...");
        if let Err(e) = cmd_sync(db).await {
            eprintln!("[{started}] Sync failed: {e:#}");
        }
        println!("Sleeping for {interval_minutes} minute(s)...");
        tokio::time::sleep(Duration::from_secs(interval_minutes * 60)).await;
    }
}

async fn cmd_track(db: &Arc<Mutex<rusqlite::Connection>>, full_name: &str) -> Result<()> {
    let tok = token::load()
        .context("No GitHub token configured. Set REPOPULSE_GITHUB_TOKEN or GITHUB_TOKEN first.")?;
    let client = GitHubClient::new(tok);
    let repo = client
        .get_repo(full_name)
        .await
        .with_context(|| format!("Failed to fetch repo '{full_name}' from GitHub"))?;

    let conn = db.lock().unwrap();
    db::upsert_repo(&conn, &repo)?;
    db::set_tracking(&conn, repo.id as i64, true)?;
    println!("Tracking {}", repo.full_name);
    Ok(())
}

fn cmd_untrack(db: &Arc<Mutex<rusqlite::Connection>>, full_name: &str) -> Result<()> {
    let conn = db.lock().unwrap();
    let repo = db::get_repo_by_full_name(&conn, full_name)?
        .with_context(|| format!("Repo '{full_name}' not found in local database"))?;
    db::set_tracking(&conn, repo.github_id, false)?;
    println!("Stopped tracking {}", repo.full_name);
    Ok(())
}

fn cmd_list_repos(db: &Arc<Mutex<rusqlite::Connection>>) -> Result<()> {
    let conn = db.lock().unwrap();
    let repos = db::get_tracked_repos(&conn)?;

    if repos.is_empty() {
        println!("No repos tracked yet. Use the desktop app to add repos.");
        return Ok(());
    }

    println!("{:<40} {:>8}  {}", "Repository", "Private", "URL");
    println!("{}", "─".repeat(70));
    for r in &repos {
        println!(
            "{:<40} {:>8}  {}",
            r.full_name,
            if r.private { "private" } else { "public" },
            r.html_url
        );
    }
    Ok(())
}

fn cmd_status(db: &Arc<Mutex<rusqlite::Connection>>) -> Result<()> {
    let conn = db.lock().unwrap();
    let repos = db::get_tracked_repos(&conn)?;
    let last_sync = db::get_last_sync_time(&conn)?;

    println!("Tracked repos: {}", repos.len());
    match last_sync {
        Some(ts) => println!("Last sync: {ts}"),
        None => println!("Last sync: never"),
    }

    let recent = db::get_sync_log(&conn, 10)?;
    if !recent.is_empty() {
        println!();
        println!("Recent syncs:");
        for row in recent {
            println!(
                "  {}  {:<7} {}{}",
                row.synced_at,
                row.status,
                row.repo_full_name
                    .unwrap_or_else(|| "(unknown repo)".to_string()),
                row.error
                    .map(|error| format!(" - {error}"))
                    .unwrap_or_default()
            );
        }
    }

    Ok(())
}

async fn cmd_export(
    db: &Arc<Mutex<rusqlite::Connection>>,
    format: &str,
    repo: Option<&str>,
    output: Option<&std::path::Path>,
) -> Result<()> {
    match format {
        "csv" => {
            let full_name = repo.context("--repo <owner/repo> is required for CSV export")?;
            let out_path = {
                let conn = db.lock().unwrap();
                let r = db::get_repo_by_full_name(&conn, full_name)?
                    .with_context(|| format!("Repo '{full_name}' not found in local database"))?;
                let csv = db::export_repo_csv(&conn, r.id)?;
                let path = output.map(|p| p.to_path_buf()).unwrap_or_else(|| {
                    PathBuf::from(format!("{}.csv", full_name.replace('/', "_")))
                });
                std::fs::write(&path, csv)?;
                path
            };
            println!("CSV exported to {}", out_path.display());
        }
        "json" => {
            let json_val = {
                let conn = db.lock().unwrap();
                db::export_all(&conn)?
            };
            let json_str = serde_json::to_string_pretty(&json_val)?;
            let path = output
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| PathBuf::from("repopulse-export.json"));
            std::fs::write(&path, &json_str)?;
            println!("JSON exported to {}", path.display());
        }
        other => anyhow::bail!("Unknown format '{other}'. Use 'json' or 'csv'."),
    }
    Ok(())
}
