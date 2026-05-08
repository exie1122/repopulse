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

const today = new Date("2026-05-08T12:00:00Z");

const demoUser: GitHubUser = {
  login: "repopulse-demo",
  id: 11842026,
  name: "RepoPulse Demo",
  avatar_url: "https://avatars.githubusercontent.com/u/583231?v=4",
};

let demoRepos: Repo[] = [
  {
    id: 1,
    github_id: 901001,
    name: "launchpad",
    full_name: "acme-labs/launchpad",
    private: false,
    description: "A tiny starter kit that keeps finding its way into new projects.",
    html_url: "https://github.com/acme-labs/launchpad",
    tracking: true,
    created_at: "2025-09-14T10:30:00Z",
  },
  {
    id: 2,
    github_id: 901002,
    name: "glyphkit",
    full_name: "acme-labs/glyphkit",
    private: false,
    description: "Icon tooling and design tokens for small product teams.",
    html_url: "https://github.com/acme-labs/glyphkit",
    tracking: true,
    created_at: "2025-11-21T08:10:00Z",
  },
  {
    id: 3,
    github_id: 901003,
    name: "signalbench",
    full_name: "acme-labs/signalbench",
    private: false,
    description: "Simple benchmarks for tracking API latency over time.",
    html_url: "https://github.com/acme-labs/signalbench",
    tracking: true,
    created_at: "2026-01-07T15:45:00Z",
  },
  {
    id: 4,
    github_id: 901004,
    name: "private-notes",
    full_name: "acme-labs/private-notes",
    private: true,
    description: "A private research notebook with a surprisingly loyal clone graph.",
    html_url: "https://github.com/acme-labs/private-notes",
    tracking: true,
    created_at: "2026-02-02T18:20:00Z",
  },
  {
    id: 5,
    github_id: 901005,
    name: "old-experiment",
    full_name: "acme-labs/old-experiment",
    private: false,
    description: "An archived prototype kept around for traffic comparisons.",
    html_url: "https://github.com/acme-labs/old-experiment",
    tracking: false,
    created_at: "2024-08-18T09:00:00Z",
  },
];

function isoDate(daysAgo: number): string {
  const date = new Date(today);
  date.setUTCDate(today.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function series(seed: number, base: number, slope: number, amplitude: number): TrafficDay[] {
  return Array.from({ length: 30 }, (_, index) => {
    const daysAgo = 29 - index;
    const wave = Math.sin((index + seed) / 2.2) * amplitude;
    const weekend = index % 7 === 5 || index % 7 === 6 ? -amplitude * 0.35 : 0;
    const launchBump = index > 22 ? (index - 22) * amplitude * 0.38 : 0;
    const count = Math.max(0, Math.round(base + slope * index + wave + weekend + launchBump));

    return {
      date: isoDate(daysAgo),
      count,
      uniques: Math.max(0, Math.round(count * (0.52 + ((seed + index) % 5) * 0.035))),
    };
  });
}

function stars(repoId: number, start: number, growth: number): StarSnapshot[] {
  return Array.from({ length: 30 }, (_, index) => ({
    id: repoId * 100 + index,
    repo_id: repoId,
    date: isoDate(29 - index),
    count: start + Math.floor(index * growth) + Math.floor(Math.max(0, index - 20) * growth * 0.7),
  }));
}

const viewsByRepo: Record<number, TrafficDay[]> = {
  1: series(1, 68, 4.2, 19),
  2: series(5, 38, 2.6, 13),
  3: series(9, 22, 1.8, 10),
  4: series(13, 14, 1.1, 6),
  5: series(17, 9, -0.05, 3),
};

const clonesByRepo: Record<number, TrafficDay[]> = {
  1: series(2, 18, 1.4, 6),
  2: series(6, 12, 0.9, 4),
  3: series(10, 8, 0.7, 3),
  4: series(14, 6, 0.4, 2),
  5: series(18, 2, 0.04, 1),
};

const starsByRepo: Record<number, StarSnapshot[]> = {
  1: stars(1, 412, 3.5),
  2: stars(2, 198, 2.1),
  3: stars(3, 76, 1.4),
  4: stars(4, 34, 0.5),
  5: stars(5, 21, 0.05),
};

const referrersByRepo: Record<number, ReferrerRow[]> = {
  1: [
    { referrer: "github.com", count: 932, uniques: 411, synced_at: isoDate(0) },
    { referrer: "news.ycombinator.com", count: 448, uniques: 276, synced_at: isoDate(0) },
    { referrer: "reddit.com", count: 301, uniques: 188, synced_at: isoDate(0) },
    { referrer: "google.com", count: 266, uniques: 172, synced_at: isoDate(0) },
  ],
  2: [
    { referrer: "github.com", count: 512, uniques: 233, synced_at: isoDate(0) },
    { referrer: "linear.app", count: 147, uniques: 91, synced_at: isoDate(0) },
    { referrer: "google.com", count: 122, uniques: 77, synced_at: isoDate(0) },
  ],
  3: [
    { referrer: "github.com", count: 266, uniques: 130, synced_at: isoDate(0) },
    { referrer: "docs.rs", count: 84, uniques: 46, synced_at: isoDate(0) },
  ],
  4: [
    { referrer: "github.com", count: 98, uniques: 44, synced_at: isoDate(0) },
    { referrer: "(direct)", count: 52, uniques: 31, synced_at: isoDate(0) },
  ],
  5: [{ referrer: "github.com", count: 24, uniques: 11, synced_at: isoDate(0) }],
};

const pathsByRepo: Record<number, PathRow[]> = {
  1: [
    { path: "/acme-labs/launchpad", title: "Repository", count: 760, uniques: 342, synced_at: isoDate(0) },
    { path: "/acme-labs/launchpad/blob/main/examples", title: "Examples", count: 281, uniques: 137, synced_at: isoDate(0) },
    { path: "/acme-labs/launchpad/releases", title: "Releases", count: 174, uniques: 82, synced_at: isoDate(0) },
  ],
  2: [
    { path: "/acme-labs/glyphkit", title: "Repository", count: 386, uniques: 202, synced_at: isoDate(0) },
    { path: "/acme-labs/glyphkit/tree/main/packages", title: "Packages", count: 142, uniques: 71, synced_at: isoDate(0) },
  ],
  3: [
    { path: "/acme-labs/signalbench", title: "Repository", count: 214, uniques: 116, synced_at: isoDate(0) },
    { path: "/acme-labs/signalbench/actions", title: "Actions", count: 73, uniques: 38, synced_at: isoDate(0) },
  ],
  4: [{ path: "/acme-labs/private-notes", title: "Repository", count: 88, uniques: 41, synced_at: isoDate(0) }],
  5: [{ path: "/acme-labs/old-experiment", title: "Repository", count: 21, uniques: 10, synced_at: isoDate(0) }],
};

const releasesByRepo: Record<number, Release[]> = {
  1: [
    {
      id: 1,
      repo_id: 1,
      github_id: 7001,
      tag_name: "v1.4.0",
      name: "Starter Kit Refresh",
      published_at: `${isoDate(6)}T14:20:00Z`,
      html_url: "https://github.com/acme-labs/launchpad/releases/tag/v1.4.0",
      prerelease: false,
      total_downloads: 1842,
    },
    {
      id: 2,
      repo_id: 1,
      github_id: 7002,
      tag_name: "v1.3.0",
      name: "Templates and Examples",
      published_at: `${isoDate(21)}T16:10:00Z`,
      html_url: "https://github.com/acme-labs/launchpad/releases/tag/v1.3.0",
      prerelease: false,
      total_downloads: 1194,
    },
  ],
  2: [
    {
      id: 3,
      repo_id: 2,
      github_id: 7101,
      tag_name: "v0.9.0",
      name: "Token Export",
      published_at: `${isoDate(11)}T11:00:00Z`,
      html_url: "https://github.com/acme-labs/glyphkit/releases/tag/v0.9.0",
      prerelease: false,
      total_downloads: 612,
    },
  ],
  3: [],
  4: [],
  5: [],
};

const insightsByRepo: Record<number, Insight[]> = {
  1: [
    {
      kind: "traffic_spike",
      title: "Traffic spike after release",
      body: "Views jumped 64% in the week after v1.4.0 shipped.",
      severity: "positive",
    },
    {
      kind: "high_clone_ratio",
      title: "Strong clone intent",
      body: "Launchpad is converting views into clones better than your portfolio average.",
      severity: "positive",
    },
  ],
  2: [
    {
      kind: "views_up",
      title: "Views trending up",
      body: "Glyphkit has gained steady attention for two weeks in a row.",
      severity: "positive",
    },
  ],
  3: [
    {
      kind: "release_gap",
      title: "Quiet but steady",
      body: "Traffic is stable. A small release or README refresh could make this easier to rediscover.",
      severity: "info",
    },
  ],
  4: [
    {
      kind: "private_activity",
      title: "Private repo activity",
      body: "The repo has low public visibility but regular clone activity.",
      severity: "info",
    },
  ],
  5: [
    {
      kind: "no_recent_traffic",
      title: "Traffic is fading",
      body: "This project has not had meaningful traffic in the last week.",
      severity: "warning",
    },
  ],
};

function trackedRepos(): Repo[] {
  return demoRepos.filter((repo) => repo.tracking);
}

function filterByDate<T extends TrafficDay>(rows: T[], startDate?: string, endDate?: string): T[] {
  return rows.filter((row) => {
    if (startDate && row.date < startDate) return false;
    if (endDate && row.date > endDate) return false;
    return true;
  });
}

function toCsv(repoId: number): string {
  const views = viewsByRepo[repoId] ?? [];
  const clones = clonesByRepo[repoId] ?? [];
  const rows = views.map((view, index) => {
    const clone = clones[index] ?? { count: 0, uniques: 0 };
    return [view.date, view.count, view.uniques, clone.count, clone.uniques].join(",");
  });

  return ["date,views,unique_views,clones,unique_clones", ...rows].join("\n");
}

export const demoApi = {
  saveToken: async (_tok: string): Promise<void> => {},
  loadToken: async (): Promise<string | null> => "demo-token",
  deleteToken: async (): Promise<void> => {},
  verifyToken: async (): Promise<GitHubUser> => demoUser,

  listGithubRepos: async (): Promise<Repo[]> => demoRepos,
  getTrackedRepos: async (): Promise<Repo[]> => trackedRepos(),
  setTracking: async (githubId: number, tracking: boolean): Promise<void> => {
    demoRepos = demoRepos.map((repo) =>
      repo.github_id === githubId ? { ...repo, tracking } : repo
    );
  },

  syncRepo: async (repoFullName: string): Promise<SyncResult> => ({
    repo_full_name: repoFullName,
    status: "success",
  }),
  syncAll: async (): Promise<SyncResult[]> =>
    trackedRepos().map((repo) => ({
      repo_full_name: repo.full_name,
      status: "success",
    })),

  getViews: async (repoId: number, startDate?: string, endDate?: string): Promise<TrafficDay[]> =>
    filterByDate(viewsByRepo[repoId] ?? [], startDate, endDate),
  getClones: async (repoId: number, startDate?: string, endDate?: string): Promise<TrafficDay[]> =>
    filterByDate(clonesByRepo[repoId] ?? [], startDate, endDate),
  getReferrers: async (repoId: number): Promise<ReferrerRow[]> => referrersByRepo[repoId] ?? [],
  getPaths: async (repoId: number): Promise<PathRow[]> => pathsByRepo[repoId] ?? [],
  getSyncLog: async (limit = 50): Promise<SyncLogRow[]> =>
    trackedRepos()
      .slice(0, limit)
      .map((repo, index) => ({
        id: index + 1,
        repo_id: repo.id,
        repo_full_name: repo.full_name,
        synced_at: `${isoDate(0)}T12:00:00Z`,
        status: "success",
      })),

  exportJson: async (): Promise<string> =>
    JSON.stringify(
      {
        repos: trackedRepos(),
        views: viewsByRepo,
        clones: clonesByRepo,
        releases: releasesByRepo,
      },
      null,
      2
    ),
  exportCsv: async (repoId: number): Promise<string> => toCsv(repoId),
  importBackup: async (_json: string): Promise<void> => {},

  getReleases: async (repoId: number): Promise<Release[]> => releasesByRepo[repoId] ?? [],
  getInsights: async (repoId: number): Promise<Insight[]> => insightsByRepo[repoId] ?? [],

  getStarSnapshots: async (repoId: number): Promise<StarSnapshot[]> => starsByRepo[repoId] ?? [],
  getLastSyncTime: async (): Promise<string | null> => `${isoDate(0)}T12:00:00Z`,

  openUrl: async (url: string): Promise<void> => {
    window.open(url, "_blank", "noopener,noreferrer");
  },

  isDeviceFlowConfigured: async (): Promise<boolean> => true,
  startDeviceFlow: async (): Promise<DeviceCodeResponse> => ({
    device_code: "demo-device-code",
    user_code: "RPLS-DEMO",
    verification_uri: "https://github.com/login/device",
    expires_in: 900,
    interval: 5,
  }),
  pollDeviceFlow: async (_deviceCode: string): Promise<AccessTokenResponse> => ({
    access_token: "demo-token",
  }),
};
