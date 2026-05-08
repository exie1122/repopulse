use anyhow::Result;
use chrono::NaiveDate;
use rusqlite::Connection;

use crate::{db, models::Insight};

pub fn generate(conn: &Connection, repo_id: i64) -> Result<Vec<Insight>> {
    let mut insights = Vec::new();

    let views = db::get_views(conn, repo_id, None, None)?;
    let clones = db::get_clones(conn, repo_id, None, None)?;
    let releases = db::get_releases(conn, repo_id)?;

    let today = chrono::Utc::now().date_naive();

    // ── Build day-indexed maps ─────────────────────────────────────────────

    let views_by_date: std::collections::HashMap<String, i64> =
        views.iter().map(|v| (v.date.clone(), v.count)).collect();
    let clones_by_date: std::collections::HashMap<String, i64> =
        clones.iter().map(|c| (c.date.clone(), c.count)).collect();

    // ── Helpers ────────────────────────────────────────────────────────────

    let sum_range =
        |map: &std::collections::HashMap<String, i64>, from: NaiveDate, to: NaiveDate| -> i64 {
            let mut d = from;
            let mut total = 0i64;
            while d <= to {
                total += map.get(&d.to_string()).copied().unwrap_or(0);
                d = d.succ_opt().unwrap_or(d);
            }
            total
        };

    // ── 1. Traffic spike ──────────────────────────────────────────────────
    {
        let last3_start = today - chrono::Duration::days(2);
        let baseline_start = today - chrono::Duration::days(16);
        let baseline_end = today - chrono::Duration::days(3);

        let last3: i64 = sum_range(&views_by_date, last3_start, today);
        let baseline_days = 14i64;
        let baseline_total: i64 = sum_range(&views_by_date, baseline_start, baseline_end);
        let baseline_avg = baseline_total / baseline_days;

        if baseline_avg > 0 && last3 > baseline_avg * 3 * 2 {
            insights.push(Insight {
                kind: "traffic_spike".to_string(),
                title: "Traffic spike detected".to_string(),
                body: format!(
                    "Views over the last 3 days ({last3}) are more than 3× the 14-day daily average ({baseline_avg}/day)."
                ),
                severity: "positive".to_string(),
            });
        }
    }

    // ── 2. Views trend (week-over-week) ───────────────────────────────────
    {
        let this_week_start = today - chrono::Duration::days(6);
        let prev_week_start = today - chrono::Duration::days(13);
        let prev_week_end = today - chrono::Duration::days(7);

        let this_views = sum_range(&views_by_date, this_week_start, today);
        let prev_views = sum_range(&views_by_date, prev_week_start, prev_week_end);

        if prev_views > 0 {
            let pct = ((this_views - prev_views) * 100) / prev_views;
            if pct >= 20 {
                insights.push(Insight {
                    kind: "views_up".to_string(),
                    title: format!("Views up {pct}% this week"),
                    body: format!(
                        "This week: {this_views} views vs last week: {prev_views} views."
                    ),
                    severity: "positive".to_string(),
                });
            } else if pct <= -20 {
                insights.push(Insight {
                    kind: "views_down".to_string(),
                    title: format!("Views down {}% this week", pct.abs()),
                    body: format!(
                        "This week: {this_views} views vs last week: {prev_views} views."
                    ),
                    severity: "warning".to_string(),
                });
            }
        }
    }

    // ── 3. Clones trend (week-over-week) ──────────────────────────────────
    {
        let this_week_start = today - chrono::Duration::days(6);
        let prev_week_start = today - chrono::Duration::days(13);
        let prev_week_end = today - chrono::Duration::days(7);

        let this_clones = sum_range(&clones_by_date, this_week_start, today);
        let prev_clones = sum_range(&clones_by_date, prev_week_start, prev_week_end);

        if prev_clones > 0 {
            let pct = ((this_clones - prev_clones) * 100) / prev_clones;
            if pct >= 20 {
                insights.push(Insight {
                    kind: "clones_up".to_string(),
                    title: format!("Clones up {pct}% this week"),
                    body: format!(
                        "This week: {this_clones} clones vs last week: {prev_clones} clones."
                    ),
                    severity: "positive".to_string(),
                });
            } else if pct <= -20 {
                insights.push(Insight {
                    kind: "clones_down".to_string(),
                    title: format!("Clones down {}% this week", pct.abs()),
                    body: format!(
                        "This week: {this_clones} clones vs last week: {prev_clones} clones."
                    ),
                    severity: "warning".to_string(),
                });
            }
        }
    }

    // ── 4. High views, low clone ratio ────────────────────────────────────
    {
        let window_start = today - chrono::Duration::days(13);
        let total_views = sum_range(&views_by_date, window_start, today);
        let total_clones = sum_range(&clones_by_date, window_start, today);

        if total_views >= 50 && total_clones > 0 {
            let ratio = total_views / total_clones;
            if ratio >= 20 {
                insights.push(Insight {
                    kind: "high_views_low_clones".to_string(),
                    title: "High views, few clones".to_string(),
                    body: format!(
                        "{total_views} views but only {total_clones} clones in the last 14 days \
                         (ratio {ratio}:1). Visitors may be browsing without installing — consider \
                         improving your README or quick-start guide."
                    ),
                    severity: "info".to_string(),
                });
            }
        }
    }

    // ── 5. Release impact ─────────────────────────────────────────────────
    for release in &releases {
        if release.prerelease {
            continue;
        }
        let pub_date = match NaiveDate::parse_from_str(&release.published_at[..10], "%Y-%m-%d") {
            Ok(d) => d,
            Err(_) => continue,
        };

        let days_ago = (today - pub_date).num_days();
        if days_ago < 0 || days_ago > 14 {
            continue;
        }

        let pre_start = pub_date - chrono::Duration::days(7);
        let pre_end = pub_date - chrono::Duration::days(1);
        let pre_days = (pre_end - pre_start).num_days() + 1;
        if pre_days < 3 {
            continue;
        }

        let post_end = std::cmp::min(pub_date + chrono::Duration::days(6), today);
        let post_days = (post_end - pub_date).num_days() + 1;

        let pre_views = sum_range(&views_by_date, pre_start, pre_end);
        let post_views = sum_range(&views_by_date, pub_date, post_end);

        let pre_avg = pre_views / pre_days;
        let post_avg = if post_days > 0 {
            post_views / post_days
        } else {
            0
        };

        if pre_avg > 0 && post_avg > pre_avg * 2 {
            let tag = &release.tag_name;
            insights.push(Insight {
                kind: "release_impact".to_string(),
                title: format!("Release {tag} drove a traffic boost"),
                body: format!(
                    "Daily views rose from {pre_avg}/day (pre-release) to {post_avg}/day \
                     after {tag} was published on {}.",
                    &release.published_at[..10]
                ),
                severity: "positive".to_string(),
            });
        }
    }

    // ── 6. No recent traffic ──────────────────────────────────────────────
    {
        let window_start = today - chrono::Duration::days(6);
        let recent_views = sum_range(&views_by_date, window_start, today);
        let has_older_data = !views.is_empty();

        if has_older_data && recent_views == 0 {
            insights.push(Insight {
                kind: "no_recent_traffic".to_string(),
                title: "No views in the last 7 days".to_string(),
                body: "This repository had no recorded views in the past week. \
                       Consider sharing it or checking if syncs are up to date."
                    .to_string(),
                severity: "warning".to_string(),
            });
        }
    }

    Ok(insights)
}
