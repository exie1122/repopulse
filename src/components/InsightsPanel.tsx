import { useEffect, useState } from "react";
import { api } from "../lib/tauri";
import type { Insight, Release, Repo } from "../types";
import EmptyState from "./EmptyState";

interface Props {
  trackedRepos: Repo[];
}

export default function InsightsPanel({ trackedRepos }: Props) {
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (trackedRepos.length > 0 && selectedRepoId === null) {
      setSelectedRepoId(trackedRepos[0].id);
    }
    if (trackedRepos.length === 0) setSelectedRepoId(null);
  }, [trackedRepos, selectedRepoId]);

  useEffect(() => {
    if (selectedRepoId === null) {
      setInsights([]);
      setReleases([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [ins, rel] = await Promise.all([
          api.getInsights(selectedRepoId),
          api.getReleases(selectedRepoId),
        ]);
        if (!cancelled) {
          setInsights(ins);
          setReleases(rel);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedRepoId]);

  if (trackedRepos.length === 0) {
    return (
      <div className="page">
        <h2 className="page-title">Insights</h2>
        <EmptyState
          title="No repos tracked yet"
          body="Track some repos and sync traffic data to generate insights."
        />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Insights</h2>
        <select
          className="select"
          value={selectedRepoId ?? ""}
          onChange={(e) => setSelectedRepoId(Number(e.target.value))}
        >
          {trackedRepos.map((r) => (
            <option key={r.id} value={r.id}>
              {r.full_name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="loading-row">
          <div className="spinner" /> Generating insights…
        </div>
      ) : (
        <>
          {insights.length === 0 ? (
            <EmptyState
              title="No insights yet"
              body="Sync traffic data for at least 14 days to start generating insights."
            />
          ) : (
            <div className="insights-list">
              {insights.map((ins, i) => (
                <InsightCard key={i} insight={ins} />
              ))}
            </div>
          )}

          {releases.length > 0 && (
            <>
              <h3 className="section-title" style={{ marginTop: 32 }}>
                Release Timeline
              </h3>
              <div className="release-timeline">
                {releases.slice(0, 20).map((r) => (
                  <ReleaseRow key={r.github_id} release={r} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function InsightCard({ insight }: { insight: Insight }) {
  const icon =
    insight.severity === "positive"
      ? "↑"
      : insight.severity === "warning"
      ? "⚠"
      : "ℹ";

  return (
    <div className={`insight-card severity-${insight.severity}`}>
      <div className="insight-icon">{icon}</div>
      <div className="insight-body">
        <div className="insight-title">{insight.title}</div>
        <div className="insight-text">{insight.body}</div>
      </div>
    </div>
  );
}

function ReleaseRow({ release }: { release: Release }) {
  const date = release.published_at.slice(0, 10);
  const label = release.name ?? release.tag_name;

  return (
    <div className="release-row">
      <div className="release-dot" />
      <div className="release-info">
        <div className="release-tag">
          <a href={release.html_url} target="_blank" rel="noreferrer" className="release-link">
            {label}
          </a>
          {release.prerelease && (
            <span className="badge" style={{ marginLeft: 6 }}>pre</span>
          )}
        </div>
        <div className="release-meta">
          {date}
          {release.total_downloads > 0 && (
            <span className="release-downloads">
              · {release.total_downloads.toLocaleString()} downloads
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
