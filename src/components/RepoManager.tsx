import { useEffect, useState } from "react";
import { api } from "../lib/tauri";
import type { Repo, SyncResult } from "../types";
import EmptyState from "./EmptyState";

interface Props {
  onTrackingChanged: () => void;
}

export default function RepoManager({ onTrackingChanged }: Props) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<Record<string, SyncResult>>({});
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadRepos = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listGithubRepos();
      setRepos(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRepos();
  }, []);

  const toggleTracking = async (repo: Repo) => {
    await api.setTracking(repo.github_id, !repo.tracking);
    setRepos((prev) =>
      prev.map((r) =>
        r.github_id === repo.github_id ? { ...r, tracking: !r.tracking } : r
      )
    );
    onTrackingChanged();
  };

  const syncOne = async (repo: Repo) => {
    setSyncing(repo.full_name);
    try {
      const result = await api.syncRepo(repo.full_name);
      setSyncResults((prev) => ({ ...prev, [repo.full_name]: result }));
    } finally {
      setSyncing(null);
    }
  };

  const filtered = repos.filter(
    (r) =>
      !filter ||
      r.full_name.toLowerCase().includes(filter.toLowerCase())
  );

  const tracked = filtered.filter((r) => r.tracking);
  const untracked = filtered.filter((r) => !r.tracking);

  return (
    <div className="page">
      <div className="page-header">
        <h2 className="page-title">Repositories</h2>
        <input
          className="search-input"
          placeholder="Filter repos…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className="btn btn-secondary" onClick={loadRepos} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <p className="error-banner">{error}</p>}

      {!loading && repos.length === 0 && (
        <EmptyState
          title="No repositories found"
          body="No repositories were found for your GitHub account."
          action={{ label: "Retry", onClick: loadRepos }}
        />
      )}

      {tracked.length > 0 && (
        <section>
          <h3 className="section-title">Tracked ({tracked.length})</h3>
          <div className="repo-list">
            {tracked.map((repo) => (
              <RepoRow
                key={repo.github_id}
                repo={repo}
                syncResult={syncResults[repo.full_name]}
                syncing={syncing === repo.full_name}
                onToggle={() => toggleTracking(repo)}
                onSync={() => syncOne(repo)}
              />
            ))}
          </div>
        </section>
      )}

      {untracked.length > 0 && (
        <section>
          <h3 className="section-title">
            {tracked.length > 0 ? "Not tracking" : "All repositories"}{" "}
            ({untracked.length})
          </h3>
          <div className="repo-list">
            {untracked.map((repo) => (
              <RepoRow
                key={repo.github_id}
                repo={repo}
                syncResult={syncResults[repo.full_name]}
                syncing={syncing === repo.full_name}
                onToggle={() => toggleTracking(repo)}
                onSync={() => syncOne(repo)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

interface RowProps {
  repo: Repo;
  syncResult?: SyncResult;
  syncing: boolean;
  onToggle: () => void;
  onSync: () => void;
}

function RepoRow({ repo, syncResult, syncing, onToggle, onSync }: RowProps) {
  return (
    <div className={`repo-row ${repo.tracking ? "tracked" : ""}`}>
      <div className="repo-info">
        <div className="repo-name">
          {repo.full_name}
          {repo.private && <span className="badge">private</span>}
        </div>
        {repo.description && (
          <div className="repo-desc">{repo.description}</div>
        )}
        {syncResult && (
          <div className={`sync-badge ${syncResult.status}`}>
            {syncResult.status === "success"
              ? "Synced"
              : `Error: ${syncResult.error}`}
          </div>
        )}
      </div>
      <div className="repo-actions">
        {repo.tracking && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={onSync}
            disabled={syncing}
          >
            {syncing ? "Syncing…" : "Sync"}
          </button>
        )}
        <button
          className={`btn btn-sm ${repo.tracking ? "btn-danger" : "btn-primary"}`}
          onClick={onToggle}
        >
          {repo.tracking ? "Untrack" : "Track"}
        </button>
      </div>
    </div>
  );
}
