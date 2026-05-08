import type { ReactNode } from "react";
import type { GitHubUser, Page, SyncResult } from "../types";

interface Props {
  page: Page;
  user: GitHubUser;
  syncing: boolean;
  lastSync: SyncResult[] | null;
  lastSyncTime: string | null;
  onNavigate: (p: Page) => void;
  onSyncAll: () => void;
  onSignOut: () => void;
  children: ReactNode;
}

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "◈" },
  { id: "insights", label: "Insights", icon: "✦" },
  { id: "repos", label: "Repositories", icon: "⊟" },
  { id: "export", label: "Export", icon: "↓" },
];

function formatSyncAge(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Layout({
  page,
  user,
  syncing,
  lastSync,
  lastSyncTime,
  onNavigate,
  onSyncAll,
  onSignOut,
  children,
}: Props) {
  const errors = lastSync?.filter((r) => r.status === "error") ?? [];
  const syncAge = lastSyncTime ? formatSyncAge(lastSyncTime) : null;
  const isStale = lastSyncTime
    ? Date.now() - new Date(lastSyncTime).getTime() > 24 * 60 * 60 * 1000
    : false;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="logo-icon">&#9679;</span>
          <span className="logo-text">RepoPulse</span>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${page === n.id ? "active" : ""}`}
              onClick={() => onNavigate(n.id)}
            >
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            className="btn btn-sync"
            onClick={onSyncAll}
            disabled={syncing}
          >
            {syncing ? "Syncing…" : "Sync Now"}
          </button>

          {syncAge && (
            <p className={`sync-status ${isStale ? "stale" : "ok"}`}>
              {isStale ? "⚠ " : ""}Last synced {syncAge}
            </p>
          )}

          {lastSync && errors.length > 0 && (
            <p className="sync-status error">
              {errors.length} error(s) on last sync
            </p>
          )}

          <div className="user-row">
            <img
              src={user.avatar_url}
              alt={user.login}
              className="avatar"
            />
            <span className="username">{user.login}</span>
            <button className="btn-ghost" onClick={onSignOut} title="Sign out">
              ×
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  );
}
