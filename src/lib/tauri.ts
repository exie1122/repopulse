import { invoke } from "@tauri-apps/api/core";
import { demoApi } from "./demoApi";
import type {
  AccessTokenResponse,
  DeviceCodeResponse,
  GitHubUser,
  Insight,
  PathRow,
  Release,
  Repo,
  ReferrerRow,
  StarSnapshot,
  SyncLogRow,
  SyncResult,
  TrafficDay,
} from "../types";

const tauriApi = {
  saveToken: (tok: string) => invoke<void>("save_token", { tok }),
  loadToken: () => invoke<string | null>("load_token"),
  deleteToken: () => invoke<void>("delete_token"),
  verifyToken: () => invoke<GitHubUser>("verify_token"),

  listGithubRepos: () => invoke<Repo[]>("list_github_repos"),
  getTrackedRepos: () => invoke<Repo[]>("get_tracked_repos"),
  setTracking: (githubId: number, tracking: boolean) =>
    invoke<void>("set_tracking", { githubId, tracking }),

  syncRepo: (repoFullName: string) =>
    invoke<SyncResult>("sync_repo", { repoFullName }),
  syncAll: () => invoke<SyncResult[]>("sync_all"),

  getViews: (repoId: number, startDate?: string, endDate?: string) =>
    invoke<TrafficDay[]>("get_views", { repoId, startDate, endDate }),
  getClones: (repoId: number, startDate?: string, endDate?: string) =>
    invoke<TrafficDay[]>("get_clones", { repoId, startDate, endDate }),
  getReferrers: (repoId: number) =>
    invoke<ReferrerRow[]>("get_referrers", { repoId }),
  getPaths: (repoId: number) => invoke<PathRow[]>("get_paths", { repoId }),
  getSyncLog: (limit?: number) =>
    invoke<SyncLogRow[]>("get_sync_log", { limit }),

  exportJson: () => invoke<string>("export_json"),
  exportCsv: (repoId: number) => invoke<string>("export_csv", { repoId }),
  importBackup: (json: string) => invoke<void>("import_backup", { json }),

  getReleases: (repoId: number) => invoke<Release[]>("get_releases", { repoId }),
  getInsights: (repoId: number) => invoke<Insight[]>("get_insights", { repoId }),

  getStarSnapshots: (repoId: number) =>
    invoke<StarSnapshot[]>("get_star_snapshots", { repoId }),
  getLastSyncTime: () => invoke<string | null>("get_last_sync_time"),

  openUrl: (url: string) => invoke<void>("open_url", { url }),

  isDeviceFlowConfigured: () => invoke<boolean>("is_device_flow_configured"),
  startDeviceFlow: () => invoke<DeviceCodeResponse>("start_device_flow"),
  pollDeviceFlow: (deviceCode: string) =>
    invoke<AccessTokenResponse>("poll_device_flow", { deviceCode }),
};

const demoMode = ((import.meta as unknown as { env?: Record<string, string> }).env ?? {})
  .VITE_REPOPULSE_DEMO === "1";

export const api: typeof tauriApi = demoMode ? demoApi : tauriApi;
