use anyhow::Result;
use rusqlite::{params, Connection};
use std::path::Path;

use crate::models::*;

pub fn initialize(path: &Path) -> Result<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS repos (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            github_id   INTEGER NOT NULL UNIQUE,
            name        TEXT NOT NULL,
            full_name   TEXT NOT NULL UNIQUE,
            private     INTEGER NOT NULL DEFAULT 0,
            description TEXT,
            html_url    TEXT NOT NULL DEFAULT '',
            tracking    INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS traffic_views (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id  INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
            date     TEXT NOT NULL,
            count    INTEGER NOT NULL DEFAULT 0,
            uniques  INTEGER NOT NULL DEFAULT 0,
            UNIQUE(repo_id, date)
        );

        CREATE TABLE IF NOT EXISTS traffic_clones (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id  INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
            date     TEXT NOT NULL,
            count    INTEGER NOT NULL DEFAULT 0,
            uniques  INTEGER NOT NULL DEFAULT 0,
            UNIQUE(repo_id, date)
        );

        CREATE TABLE IF NOT EXISTS referrers (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id    INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
            synced_at  TEXT NOT NULL DEFAULT (datetime('now')),
            referrer   TEXT NOT NULL,
            count      INTEGER NOT NULL DEFAULT 0,
            uniques    INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS paths (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id    INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
            synced_at  TEXT NOT NULL DEFAULT (datetime('now')),
            path       TEXT NOT NULL,
            title      TEXT NOT NULL DEFAULT '',
            count      INTEGER NOT NULL DEFAULT 0,
            uniques    INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS sync_log (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id    INTEGER REFERENCES repos(id) ON DELETE SET NULL,
            synced_at  TEXT NOT NULL DEFAULT (datetime('now')),
            status     TEXT NOT NULL DEFAULT 'success',
            error      TEXT
        );

        CREATE TABLE IF NOT EXISTS releases (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id          INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
            github_id        INTEGER NOT NULL,
            tag_name         TEXT NOT NULL,
            name             TEXT,
            published_at     TEXT NOT NULL,
            html_url         TEXT NOT NULL DEFAULT '',
            prerelease       INTEGER NOT NULL DEFAULT 0,
            total_downloads  INTEGER NOT NULL DEFAULT 0,
            UNIQUE(repo_id, github_id)
        );

        CREATE TABLE IF NOT EXISTS star_snapshots (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_id  INTEGER NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
            date     TEXT NOT NULL,
            count    INTEGER NOT NULL DEFAULT 0,
            UNIQUE(repo_id, date)
        );",
    )?;
    // Add stargazers_count column to existing repos tables (ignored if already exists)
    conn.execute_batch("ALTER TABLE repos ADD COLUMN stargazers_count INTEGER NOT NULL DEFAULT 0;")
        .ok();
    Ok(())
}

// ── Repos ──────────────────────────────────────────────────────────────────

pub fn upsert_repo(conn: &Connection, repo: &GitHubRepo) -> Result<i64> {
    conn.execute(
        "INSERT INTO repos (github_id, name, full_name, private, description, html_url)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(github_id) DO UPDATE SET
           name = excluded.name,
           full_name = excluded.full_name,
           private = excluded.private,
           description = excluded.description,
           html_url = excluded.html_url",
        params![
            repo.id as i64,
            repo.name,
            repo.full_name,
            repo.private as i64,
            repo.description,
            repo.html_url,
        ],
    )?;
    let id: i64 = conn.query_row(
        "SELECT id FROM repos WHERE github_id = ?1",
        params![repo.id as i64],
        |row| row.get(0),
    )?;
    Ok(id)
}

pub fn set_tracking(conn: &Connection, github_id: i64, tracking: bool) -> Result<()> {
    conn.execute(
        "UPDATE repos SET tracking = ?1 WHERE github_id = ?2",
        params![tracking as i64, github_id],
    )?;
    Ok(())
}

pub fn get_tracked_repos(conn: &Connection) -> Result<Vec<DbRepo>> {
    query_repos(conn, true)
}

pub fn get_all_repos(conn: &Connection) -> Result<Vec<DbRepo>> {
    query_repos(conn, false)
}

fn query_repos(conn: &Connection, tracked_only: bool) -> Result<Vec<DbRepo>> {
    let sql = if tracked_only {
        "SELECT id, github_id, name, full_name, private, description, html_url, tracking, created_at
         FROM repos WHERE tracking = 1 ORDER BY name"
    } else {
        "SELECT id, github_id, name, full_name, private, description, html_url, tracking, created_at
         FROM repos ORDER BY name"
    };
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(DbRepo {
                id: row.get(0)?,
                github_id: row.get(1)?,
                name: row.get(2)?,
                full_name: row.get(3)?,
                private: row.get::<_, i64>(4)? != 0,
                description: row.get(5)?,
                html_url: row.get(6)?,
                tracking: row.get::<_, i64>(7)? != 0,
                created_at: row.get(8)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_repo_by_full_name(conn: &Connection, full_name: &str) -> Result<Option<DbRepo>> {
    let mut stmt = conn.prepare(
        "SELECT id, github_id, name, full_name, private, description, html_url, tracking, created_at
         FROM repos WHERE full_name = ?1",
    )?;
    let mut rows = stmt.query_map(params![full_name], |row| {
        Ok(DbRepo {
            id: row.get(0)?,
            github_id: row.get(1)?,
            name: row.get(2)?,
            full_name: row.get(3)?,
            private: row.get::<_, i64>(4)? != 0,
            description: row.get(5)?,
            html_url: row.get(6)?,
            tracking: row.get::<_, i64>(7)? != 0,
            created_at: row.get(8)?,
        })
    })?;
    Ok(rows.next().transpose()?)
}

// ── Traffic ────────────────────────────────────────────────────────────────

pub fn upsert_views(conn: &Connection, repo_id: i64, days: &[TrafficDay]) -> Result<()> {
    for day in days {
        let date = &day.timestamp[..10.min(day.timestamp.len())];
        conn.execute(
            "INSERT INTO traffic_views (repo_id, date, count, uniques)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(repo_id, date) DO UPDATE SET
               count = excluded.count, uniques = excluded.uniques",
            params![repo_id, date, day.count, day.uniques],
        )?;
    }
    Ok(())
}

pub fn upsert_clones(conn: &Connection, repo_id: i64, days: &[TrafficDay]) -> Result<()> {
    for day in days {
        let date = &day.timestamp[..10.min(day.timestamp.len())];
        conn.execute(
            "INSERT INTO traffic_clones (repo_id, date, count, uniques)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(repo_id, date) DO UPDATE SET
               count = excluded.count, uniques = excluded.uniques",
            params![repo_id, date, day.count, day.uniques],
        )?;
    }
    Ok(())
}

pub fn insert_referrers(
    conn: &Connection,
    repo_id: i64,
    referrers: &[Referrer],
    synced_at: &str,
) -> Result<()> {
    for r in referrers {
        conn.execute(
            "INSERT INTO referrers (repo_id, synced_at, referrer, count, uniques)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![repo_id, synced_at, r.referrer, r.count, r.uniques],
        )?;
    }
    Ok(())
}

pub fn insert_paths(
    conn: &Connection,
    repo_id: i64,
    paths: &[PopularPath],
    synced_at: &str,
) -> Result<()> {
    for p in paths {
        conn.execute(
            "INSERT INTO paths (repo_id, synced_at, path, title, count, uniques)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![repo_id, synced_at, p.path, p.title, p.count, p.uniques],
        )?;
    }
    Ok(())
}

pub fn get_views(
    conn: &Connection,
    repo_id: i64,
    start: Option<&str>,
    end: Option<&str>,
) -> Result<Vec<TrafficDayRow>> {
    let mut stmt = conn.prepare(
        "SELECT date, count, uniques FROM traffic_views
         WHERE repo_id = ?1
           AND (?2 IS NULL OR date >= ?2)
           AND (?3 IS NULL OR date <= ?3)
         ORDER BY date",
    )?;
    let rows = stmt
        .query_map(params![repo_id, start, end], |row| {
            Ok(TrafficDayRow {
                date: row.get(0)?,
                count: row.get(1)?,
                uniques: row.get(2)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_clones(
    conn: &Connection,
    repo_id: i64,
    start: Option<&str>,
    end: Option<&str>,
) -> Result<Vec<TrafficDayRow>> {
    let mut stmt = conn.prepare(
        "SELECT date, count, uniques FROM traffic_clones
         WHERE repo_id = ?1
           AND (?2 IS NULL OR date >= ?2)
           AND (?3 IS NULL OR date <= ?3)
         ORDER BY date",
    )?;
    let rows = stmt
        .query_map(params![repo_id, start, end], |row| {
            Ok(TrafficDayRow {
                date: row.get(0)?,
                count: row.get(1)?,
                uniques: row.get(2)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_referrers_latest(conn: &Connection, repo_id: i64) -> Result<Vec<ReferrerRow>> {
    let latest: Option<String> = conn
        .query_row(
            "SELECT MAX(synced_at) FROM referrers WHERE repo_id = ?1",
            params![repo_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    let Some(sync_time) = latest else {
        return Ok(vec![]);
    };

    let mut stmt = conn.prepare(
        "SELECT referrer, count, uniques, synced_at FROM referrers
         WHERE repo_id = ?1 AND synced_at = ?2 ORDER BY count DESC",
    )?;
    let rows = stmt
        .query_map(params![repo_id, sync_time], |row| {
            Ok(ReferrerRow {
                referrer: row.get(0)?,
                count: row.get(1)?,
                uniques: row.get(2)?,
                synced_at: row.get(3)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_paths_latest(conn: &Connection, repo_id: i64) -> Result<Vec<PathRow>> {
    let latest: Option<String> = conn
        .query_row(
            "SELECT MAX(synced_at) FROM paths WHERE repo_id = ?1",
            params![repo_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    let Some(sync_time) = latest else {
        return Ok(vec![]);
    };

    let mut stmt = conn.prepare(
        "SELECT path, title, count, uniques, synced_at FROM paths
         WHERE repo_id = ?1 AND synced_at = ?2 ORDER BY count DESC",
    )?;
    let rows = stmt
        .query_map(params![repo_id, sync_time], |row| {
            Ok(PathRow {
                path: row.get(0)?,
                title: row.get(1)?,
                count: row.get(2)?,
                uniques: row.get(3)?,
                synced_at: row.get(4)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

// ── Releases ───────────────────────────────────────────────────────────────

pub fn upsert_release(conn: &Connection, repo_id: i64, release: &GitHubRelease) -> Result<()> {
    let total_downloads: i64 = release.assets.iter().map(|a| a.download_count).sum();
    conn.execute(
        "INSERT INTO releases
             (repo_id, github_id, tag_name, name, published_at, html_url, prerelease, total_downloads)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(repo_id, github_id) DO UPDATE SET
           tag_name        = excluded.tag_name,
           name            = excluded.name,
           published_at    = excluded.published_at,
           html_url        = excluded.html_url,
           prerelease      = excluded.prerelease,
           total_downloads = excluded.total_downloads",
        params![
            repo_id,
            release.id,
            release.tag_name,
            release.name,
            release.published_at,
            release.html_url,
            release.prerelease as i64,
            total_downloads,
        ],
    )?;
    Ok(())
}

pub fn get_releases(conn: &Connection, repo_id: i64) -> Result<Vec<DbRelease>> {
    let mut stmt = conn.prepare(
        "SELECT id, repo_id, github_id, tag_name, name, published_at, html_url, prerelease, total_downloads
         FROM releases WHERE repo_id = ?1 ORDER BY published_at DESC",
    )?;
    let rows = stmt
        .query_map(params![repo_id], |row| {
            Ok(DbRelease {
                id: row.get(0)?,
                repo_id: row.get(1)?,
                github_id: row.get(2)?,
                tag_name: row.get(3)?,
                name: row.get(4)?,
                published_at: row.get(5)?,
                html_url: row.get(6)?,
                prerelease: row.get::<_, i64>(7)? != 0,
                total_downloads: row.get(8)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

// ── Star snapshots ─────────────────────────────────────────────────────────

pub fn upsert_star_snapshot(conn: &Connection, repo_id: i64, date: &str, count: i64) -> Result<()> {
    conn.execute(
        "INSERT INTO star_snapshots (repo_id, date, count)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(repo_id, date) DO UPDATE SET count = excluded.count",
        params![repo_id, date, count],
    )?;
    Ok(())
}

pub fn get_star_snapshots(conn: &Connection, repo_id: i64) -> Result<Vec<StarSnapshot>> {
    let mut stmt = conn.prepare(
        "SELECT id, repo_id, date, count FROM star_snapshots
         WHERE repo_id = ?1 ORDER BY date",
    )?;
    let rows = stmt
        .query_map(params![repo_id], |row| {
            Ok(StarSnapshot {
                id: row.get(0)?,
                repo_id: row.get(1)?,
                date: row.get(2)?,
                count: row.get(3)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_last_sync_time(conn: &Connection) -> Result<Option<String>> {
    let result: Option<String> = conn
        .query_row(
            "SELECT MAX(synced_at) FROM sync_log WHERE status = 'success'",
            [],
            |row| row.get(0),
        )
        .ok()
        .flatten();
    Ok(result)
}

// ── Sync log ───────────────────────────────────────────────────────────────

pub fn log_sync(conn: &Connection, repo_id: i64, status: &str, error: Option<&str>) -> Result<()> {
    conn.execute(
        "INSERT INTO sync_log (repo_id, status, error) VALUES (?1, ?2, ?3)",
        params![repo_id, status, error],
    )?;
    Ok(())
}

pub fn get_sync_log(conn: &Connection, limit: i64) -> Result<Vec<SyncLogRow>> {
    let mut stmt = conn.prepare(
        "SELECT sl.id, sl.repo_id, r.full_name, sl.synced_at, sl.status, sl.error
         FROM sync_log sl
         LEFT JOIN repos r ON r.id = sl.repo_id
         ORDER BY sl.synced_at DESC
         LIMIT ?1",
    )?;
    let rows = stmt
        .query_map(params![limit], |row| {
            Ok(SyncLogRow {
                id: row.get(0)?,
                repo_id: row.get(1)?,
                repo_full_name: row.get(2)?,
                synced_at: row.get(3)?,
                status: row.get(4)?,
                error: row.get(5)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

// ── Export / Import ────────────────────────────────────────────────────────

pub fn export_all(conn: &Connection) -> Result<serde_json::Value> {
    let repos = get_all_repos(conn)?;

    let mut all_views: Vec<serde_json::Value> = vec![];
    let mut all_clones: Vec<serde_json::Value> = vec![];

    for repo in &repos {
        for v in get_views(conn, repo.id, None, None)? {
            all_views.push(serde_json::json!({
                "repo_full_name": repo.full_name,
                "date": v.date,
                "count": v.count,
                "uniques": v.uniques,
            }));
        }
        for c in get_clones(conn, repo.id, None, None)? {
            all_clones.push(serde_json::json!({
                "repo_full_name": repo.full_name,
                "date": c.date,
                "count": c.count,
                "uniques": c.uniques,
            }));
        }
    }

    Ok(serde_json::json!({
        "version": "1",
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "repos": repos,
        "views": all_views,
        "clones": all_clones,
    }))
}

pub fn import_backup(conn: &mut Connection, data: &serde_json::Value) -> Result<()> {
    let tx = conn.transaction()?;

    if let Some(repos) = data["repos"].as_array() {
        for r in repos {
            if let (Some(gid), Some(name), Some(full_name)) = (
                r["github_id"].as_i64(),
                r["name"].as_str(),
                r["full_name"].as_str(),
            ) {
                tx.execute(
                    "INSERT OR IGNORE INTO repos
                     (github_id, name, full_name, private, description, html_url, tracking)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![
                        gid,
                        name,
                        full_name,
                        r["private"].as_bool().unwrap_or(false) as i64,
                        r["description"].as_str(),
                        r["html_url"].as_str().unwrap_or(""),
                        r["tracking"].as_bool().unwrap_or(false) as i64,
                    ],
                )?;
            }
        }
    }

    for (table, array_key) in [("traffic_views", "views"), ("traffic_clones", "clones")] {
        if let Some(rows) = data[array_key].as_array() {
            for row in rows {
                if let (Some(full_name), Some(date), Some(count), Some(uniques)) = (
                    row["repo_full_name"].as_str(),
                    row["date"].as_str(),
                    row["count"].as_i64(),
                    row["uniques"].as_i64(),
                ) {
                    let repo_id: Option<i64> = tx
                        .query_row(
                            "SELECT id FROM repos WHERE full_name = ?1",
                            params![full_name],
                            |r| r.get(0),
                        )
                        .ok();
                    if let Some(rid) = repo_id {
                        tx.execute(
                            &format!(
                                "INSERT OR IGNORE INTO {table}
                                 (repo_id, date, count, uniques) VALUES (?1, ?2, ?3, ?4)"
                            ),
                            params![rid, date, count, uniques],
                        )?;
                    }
                }
            }
        }
    }

    tx.commit()?;
    Ok(())
}

pub fn export_repo_csv(conn: &Connection, repo_id: i64) -> Result<String> {
    let mut out = String::from("date,views,unique_views,clones,unique_cloners\n");

    let views = get_views(conn, repo_id, None, None)?;
    let clones = get_clones(conn, repo_id, None, None)?;

    // Merge by date
    use std::collections::BTreeMap;
    let mut rows: BTreeMap<String, (i64, i64, i64, i64)> = BTreeMap::new();
    for v in &views {
        let e = rows.entry(v.date.clone()).or_default();
        e.0 = v.count;
        e.1 = v.uniques;
    }
    for c in &clones {
        let e = rows.entry(c.date.clone()).or_default();
        e.2 = c.count;
        e.3 = c.uniques;
    }

    for (date, (vc, vu, cc, cu)) in &rows {
        out.push_str(&format!("{date},{vc},{vu},{cc},{cu}\n"));
    }

    Ok(out)
}
