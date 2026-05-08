import { useEffect, useRef, useState } from "react";
import { api } from "./lib/tauri";
import type { GitHubUser, Page, Repo, SyncResult } from "./types";
import Dashboard from "./components/Dashboard";
import ExportPanel from "./components/ExportPanel";
import InsightsPanel from "./components/InsightsPanel";
import Layout from "./components/Layout";
import RepoManager from "./components/RepoManager";
import Setup from "./components/Setup";

const AUTO_SYNC_STALE_MS = 4 * 60 * 60 * 1000; // 4 hours
const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000;   // check every 30 min

export default function App() {
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState<Page>("dashboard");
  const [trackedRepos, setTrackedRepos] = useState<Repo[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncResult[] | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const syncingRef = useRef(false);

  const runSync = async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const results = await api.syncAll();
      setLastSync(results);
      const [repos, syncTime] = await Promise.all([
        api.getTrackedRepos(),
        api.getLastSyncTime(),
      ]);
      setTrackedRepos(repos);
      setLastSyncTime(syncTime);
    } finally {
      setSyncing(false);
      syncingRef.current = false;
    }
  };

  // Check for a stored token on mount
  useEffect(() => {
    (async () => {
      try {
        const tok = await api.loadToken();
        if (tok) {
          const u = await api.verifyToken();
          setUser(u);
          const [repos, syncTime] = await Promise.all([
            api.getTrackedRepos(),
            api.getLastSyncTime(),
          ]);
          setTrackedRepos(repos);
          setLastSyncTime(syncTime);

          // Auto-sync if stale
          const isStale =
            !syncTime ||
            Date.now() - new Date(syncTime).getTime() > AUTO_SYNC_STALE_MS;
          if (isStale && repos.length > 0) {
            runSync();
          }
        }
      } catch {
        // token invalid or missing — show setup
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  // Periodic auto-sync every 30 minutes while app is open
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      runSync();
    }, AUTO_SYNC_INTERVAL_MS);
    return () => clearInterval(id);
  }, [user]);

  const handleSetupDone = async (u: GitHubUser) => {
    setUser(u);
    const repos = await api.getTrackedRepos();
    setTrackedRepos(repos);
  };

  const handleSyncAll = () => runSync();

  const handleTrackingChanged = async () => {
    const repos = await api.getTrackedRepos();
    setTrackedRepos(repos);
  };

  const handleSignOut = async () => {
    await api.deleteToken();
    setUser(null);
    setTrackedRepos([]);
    setLastSync(null);
    setLastSyncTime(null);
  };

  if (checking) {
    return (
      <div className="splash">
        <div className="spinner" />
      </div>
    );
  }

  if (!user) {
    return <Setup onDone={handleSetupDone} />;
  }

  return (
    <Layout
      page={page}
      user={user}
      syncing={syncing}
      lastSync={lastSync}
      lastSyncTime={lastSyncTime}
      onNavigate={setPage}
      onSyncAll={handleSyncAll}
      onSignOut={handleSignOut}
    >
      {page === "dashboard" && (
        <Dashboard trackedRepos={trackedRepos} />
      )}
      {page === "insights" && (
        <InsightsPanel trackedRepos={trackedRepos} />
      )}
      {page === "repos" && (
        <RepoManager onTrackingChanged={handleTrackingChanged} />
      )}
      {page === "export" && (
        <ExportPanel trackedRepos={trackedRepos} />
      )}
    </Layout>
  );
}
