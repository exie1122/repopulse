import { useEffect, useMemo, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { api } from "../lib/tauri";
import type { PathRow, ReferrerRow, Release, Repo, StarSnapshot, TrafficDay } from "../types";
import EmptyState from "./EmptyState";
import TrafficCharts from "./TrafficCharts";
import StarsChart from "./StarsChart";

interface Props {
  trackedRepos: Repo[];
}

type OverviewMetric = "views" | "clones" | "stars";
type RankMetric = "pulse" | "views" | "clones" | "stars";
type VisibilityFilter = "all" | "public" | "private";
type OverviewTab = "projects" | "ranking";
type DashboardSection = "stats" | "traffic" | "stars" | "sources" | "note";

interface RepoOverviewSummary {
  views: TrafficDay[];
  clones: TrafficDay[];
  stars: StarSnapshot[];
}

interface RankedRepo {
  repo: Repo;
  summary?: RepoOverviewSummary;
  viewsWeek: number;
  clonesWeek: number;
  stars: number;
  pulse: number;
}

const PREFS_KEY = "repopulse.dashboard.prefs";

const DEFAULT_VISIBLE_SECTIONS: Record<DashboardSection, boolean> = {
  stats: true,
  traffic: true,
  stars: true,
  sources: true,
  note: true,
};

const SECTION_OPTIONS: { id: DashboardSection; label: string; icon: string }[] = [
  { id: "stats", label: "Stat cards", icon: "123" },
  { id: "traffic", label: "Traffic charts", icon: "/" },
  { id: "stars", label: "Stars chart", icon: "*" },
  { id: "sources", label: "Referrers and paths", icon: "->" },
  { id: "note", label: "Data note", icon: "i" },
];

const OVERVIEW_METRICS: { id: OverviewMetric; label: string }[] = [
  { id: "views", label: "Views" },
  { id: "clones", label: "Clones" },
  { id: "stars", label: "Stars" },
];

const RANK_METRICS: { id: RankMetric; label: string }[] = [
  { id: "pulse", label: "Pulse" },
  { id: "views", label: "Views" },
  { id: "clones", label: "Clones" },
  { id: "stars", label: "Stars" },
];

function trendPct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

function sumCount(days: TrafficDay[]): number {
  return days.reduce((sum, day) => sum + day.count, 0);
}

function loadPrefs(): {
  overviewMetric: OverviewMetric;
  rankMetric: RankMetric;
  visibilityFilter: VisibilityFilter;
  overviewTab: OverviewTab;
  visibleSections: Record<DashboardSection, boolean>;
} {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) {
      return {
        overviewMetric: "views",
        rankMetric: "pulse",
        visibilityFilter: "all",
        overviewTab: "projects",
        visibleSections: DEFAULT_VISIBLE_SECTIONS,
      };
    }

    const parsed = JSON.parse(raw) as {
      overviewMetric?: OverviewMetric;
      rankMetric?: RankMetric;
      visibilityFilter?: VisibilityFilter;
      overviewTab?: OverviewTab;
      visibleSections?: Partial<Record<DashboardSection, boolean>>;
    };

    return {
      overviewMetric:
        parsed.overviewMetric === "clones" || parsed.overviewMetric === "stars"
          ? parsed.overviewMetric
          : "views",
      rankMetric:
        parsed.rankMetric === "views" ||
        parsed.rankMetric === "clones" ||
        parsed.rankMetric === "stars"
          ? parsed.rankMetric
          : "pulse",
      visibilityFilter:
        parsed.visibilityFilter === "public" || parsed.visibilityFilter === "private"
          ? parsed.visibilityFilter
          : "all",
      overviewTab: parsed.overviewTab === "ranking" ? "ranking" : "projects",
      visibleSections: {
        ...DEFAULT_VISIBLE_SECTIONS,
        ...parsed.visibleSections,
      },
    };
  } catch {
    return {
      overviewMetric: "views",
      rankMetric: "pulse",
      visibilityFilter: "all",
      overviewTab: "projects",
      visibleSections: DEFAULT_VISIBLE_SECTIONS,
    };
  }
}

export default function Dashboard({ trackedRepos }: Props) {
  const prefs = useMemo(loadPrefs, []);
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [views, setViews] = useState<TrafficDay[]>([]);
  const [clones, setClones] = useState<TrafficDay[]>([]);
  const [referrers, setReferrers] = useState<ReferrerRow[]>([]);
  const [paths, setPaths] = useState<PathRow[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [starSnapshots, setStarSnapshots] = useState<StarSnapshot[]>([]);
  const [repoSummaries, setRepoSummaries] = useState<Record<number, RepoOverviewSummary>>({});
  const [loading, setLoading] = useState(false);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [overviewMetric, setOverviewMetric] = useState<OverviewMetric>(prefs.overviewMetric);
  const [rankMetric, setRankMetric] = useState<RankMetric>(prefs.rankMetric);
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>(
    prefs.visibilityFilter
  );
  const [overviewTab, setOverviewTab] = useState<OverviewTab>(prefs.overviewTab);
  const [repoSearch, setRepoSearch] = useState("");
  const [visibleSections, setVisibleSections] = useState<Record<DashboardSection, boolean>>(
    prefs.visibleSections
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    if (trackedRepos.length === 0) {
      setSelectedRepoId(null);
      return;
    }

    if (
      selectedRepoId !== null &&
      !trackedRepos.some((repo) => repo.id === selectedRepoId)
    ) {
      setSelectedRepoId(null);
    }
  }, [trackedRepos, selectedRepoId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        PREFS_KEY,
        JSON.stringify({
          overviewMetric,
          rankMetric,
          visibilityFilter,
          overviewTab,
          visibleSections,
        })
      );
    } catch {
    }
  }, [overviewMetric, rankMetric, visibilityFilter, overviewTab, visibleSections]);

  useEffect(() => {
    if (trackedRepos.length === 0) {
      setRepoSummaries({});
      return;
    }

    let cancelled = false;
    (async () => {
      setOverviewLoading(true);
      try {
        const summaries = await Promise.all(
          trackedRepos.map(async (repo) => {
            const [repoViews, repoClones, repoStars] = await Promise.all([
              api.getViews(repo.id),
              api.getClones(repo.id),
              api.getStarSnapshots(repo.id),
            ]);

            return [repo.id, { views: repoViews, clones: repoClones, stars: repoStars }] as const;
          })
        );

        if (!cancelled) {
          setRepoSummaries(Object.fromEntries(summaries));
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setOverviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [trackedRepos]);

  useEffect(() => {
    if (selectedRepoId === null) {
      setViews([]);
      setClones([]);
      setReferrers([]);
      setPaths([]);
      setReleases([]);
      setStarSnapshots([]);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [v, c, r, p, rel, stars] = await Promise.all([
          api.getViews(selectedRepoId, startDate || undefined, endDate || undefined),
          api.getClones(selectedRepoId, startDate || undefined, endDate || undefined),
          api.getReferrers(selectedRepoId),
          api.getPaths(selectedRepoId),
          api.getReleases(selectedRepoId),
          api.getStarSnapshots(selectedRepoId),
        ]);
        if (!cancelled) {
          setViews(v);
          setClones(c);
          setReferrers(r);
          setPaths(p);
          setReleases(rel);
          setStarSnapshots(stars);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedRepoId, startDate, endDate]);

  const selectedRepo = trackedRepos.find((repo) => repo.id === selectedRepoId);
  const visibleCount = Object.values(visibleSections).filter(Boolean).length;
  const rankedRepos = useMemo(
    () => buildRankedRepos(trackedRepos, repoSummaries),
    [trackedRepos, repoSummaries]
  );
  const filteredRankedRepos = useMemo(
    () =>
      rankedRepos.filter(({ repo }) => {
        const matchesVisibility =
          visibilityFilter === "all" ||
          (visibilityFilter === "private" ? repo.private : !repo.private);
        const needle = repoSearch.trim().toLowerCase();
        const matchesSearch =
          !needle ||
          repo.full_name.toLowerCase().includes(needle) ||
          (repo.description ?? "").toLowerCase().includes(needle);

        return matchesVisibility && matchesSearch;
      }),
    [rankedRepos, repoSearch, visibilityFilter]
  );
  const sortedRankedRepos = useMemo(
    () => sortRankedRepos(filteredRankedRepos, rankMetric),
    [filteredRankedRepos, rankMetric]
  );

  const toggleSection = (section: DashboardSection) => {
    setVisibleSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  if (trackedRepos.length === 0) {
    return (
      <div className="page">
        <h2 className="page-title">Dashboard</h2>
        <EmptyState
          title="No repos tracked yet"
          body="Go to Repositories to select repos to track. RepoPulse will then collect traffic data each time you sync."
        />
      </div>
    );
  }

  const totalViews = views.reduce((s, v) => s + v.count, 0);
  const totalUniqViews = views.reduce((s, v) => s + v.uniques, 0);
  const totalClones = clones.reduce((s, c) => s + c.count, 0);
  const totalUniqClones = clones.reduce((s, c) => s + c.uniques, 0);

  let viewsDelta: number | null = null;
  let clonesDelta: number | null = null;
  let starsDelta: number | null = null;
  if (!startDate && !endDate && views.length >= 7) {
    const last7v = views.slice(-7).reduce((s, d) => s + d.count, 0);
    const prev7v = views.slice(-14, -7).reduce((s, d) => s + d.count, 0);
    viewsDelta = trendPct(last7v, prev7v);
  }
  if (!startDate && !endDate && clones.length >= 7) {
    const last7c = clones.slice(-7).reduce((s, d) => s + d.count, 0);
    const prev7c = clones.slice(-14, -7).reduce((s, d) => s + d.count, 0);
    clonesDelta = trendPct(last7c, prev7c);
  }

  const currentStars =
    starSnapshots.length > 0 ? starSnapshots[starSnapshots.length - 1].count : 0;
  if (starSnapshots.length >= 7) {
    const newest = starSnapshots[starSnapshots.length - 1].count;
    const weekAgo = starSnapshots[starSnapshots.length - 7].count;
    starsDelta = trendPct(newest, weekAgo);
  }

  return (
    <div className="page dashboard-page">
      <div className="page-header dashboard-page-header">
        <div className="dashboard-title-block">
          <h2 className="page-title">Dashboard</h2>
          <p className="page-subtitle">
            {selectedRepo
              ? "Inspecting one tracked project."
              : "Choose a tracked project to open its traffic dashboard."}
          </p>
        </div>

        <div className="dashboard-actions">
          {!selectedRepo && (
            <div className="header-segment-group">
              <span>Preview</span>
              <div className="segmented-control segmented-control-compact">
                {OVERVIEW_METRICS.map((metric) => (
                  <button
                    key={metric.id}
                    className={`segment ${overviewMetric === metric.id ? "active" : ""}`}
                    onClick={() => setOverviewMetric(metric.id)}
                  >
                    {metric.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedRepo && (
            <select
              className="select dashboard-select"
              value={selectedRepoId ?? ""}
              onChange={(e) => setSelectedRepoId(Number(e.target.value))}
              title="Current project"
            >
              {trackedRepos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </select>
          )}
          <button
            className={`btn btn-secondary layout-toggle ${customizeOpen ? "active" : ""}`}
            onClick={() => setCustomizeOpen((open) => !open)}
          >
            <span className="layout-icon" aria-hidden="true" />
            Layout
          </button>

          {customizeOpen && (
            <CustomizePanel
              visibleSections={visibleSections}
              onToggleSection={toggleSection}
            />
          )}
        </div>
      </div>

      {!selectedRepo ? (
        <ProjectOverview
          repos={sortedRankedRepos}
          totalRepos={trackedRepos.length}
          allRankedRepos={rankedRepos}
          loading={overviewLoading}
          overviewMetric={overviewMetric}
          rankMetric={rankMetric}
          visibilityFilter={visibilityFilter}
          overviewTab={overviewTab}
          repoSearch={repoSearch}
          onRankMetricChange={setRankMetric}
          onVisibilityFilterChange={setVisibilityFilter}
          onOverviewTabChange={setOverviewTab}
          onRepoSearchChange={setRepoSearch}
          onOpenRepo={setSelectedRepoId}
        />
      ) : (
        <>
          <CurrentRepoHeader
            repo={selectedRepo}
            onBack={() => {
              setSelectedRepoId(null);
              setStartDate("");
              setEndDate("");
            }}
          />

          <div className="detail-toolbar">
            <input
              type="date"
              className="date-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              title="Start date"
            />
            <span className="date-sep">-</span>
            <input
              type="date"
              className="date-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              title="End date"
            />
            {(startDate || endDate) && (
              <button
                className="btn-ghost"
                onClick={() => {
                  setStartDate("");
                  setEndDate("");
                }}
              >
                Clear
              </button>
            )}
          </div>

          {loading ? (
            <div className="loading-row">
              <div className="spinner" /> Loading traffic data...
            </div>
          ) : (
            <>
              {views.length === 0 && clones.length === 0 ? (
                <EmptyState
                  title="No data yet"
                  body={`No traffic data stored for ${selectedRepo.full_name}. Click "Sync Now" in the sidebar to fetch the latest 14 days from GitHub.`}
                />
              ) : visibleCount === 0 ? (
                <EmptyState
                  title="Everything is hidden"
                  body="Open Customize and choose at least one dashboard section to show."
                />
              ) : (
                <>
                  {visibleSections.stats && (
                    <div className="stat-cards">
                      <StatCard label="Total Views" value={totalViews} delta={viewsDelta} />
                      <StatCard label="Unique Visitors" value={totalUniqViews} />
                      <StatCard label="Total Clones" value={totalClones} delta={clonesDelta} />
                      <StatCard label="Unique Cloners" value={totalUniqClones} />
                      {currentStars > 0 && (
                        <StatCard label="Stars" value={currentStars} delta={starsDelta} />
                      )}
                    </div>
                  )}

                  {visibleSections.traffic && (
                    <TrafficCharts views={views} clones={clones} releases={releases} />
                  )}

                  {visibleSections.stars && starSnapshots.length > 1 && (
                    <StarsChart snapshots={starSnapshots} />
                  )}

                  {visibleSections.sources && (
                    <div className="tables-row">
                      {referrers.length > 0 && <ReferrerTable rows={referrers} />}
                      {paths.length > 0 && <PathTable rows={paths} />}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {visibleSections.note && (
            <div className="data-note">
              GitHub traffic data covers the last 14 days. RepoPulse accumulates daily
              snapshots so your history grows over time, but data before installation
              cannot be recovered.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CustomizePanel({
  visibleSections,
  onToggleSection,
}: {
  visibleSections: Record<DashboardSection, boolean>;
  onToggleSection: (section: DashboardSection) => void;
}) {
  return (
    <section className="customize-panel" aria-label="Dashboard layout">
      <div className="customize-group">
        <span className="customize-label">Detail sections</span>
        <div className="section-toggle-list">
          {SECTION_OPTIONS.map((section) => (
            <label key={section.id} className="section-toggle">
              <input
                type="checkbox"
                checked={visibleSections[section.id]}
                onChange={() => onToggleSection(section.id)}
              />
              <span className="section-toggle-icon">{section.icon}</span>
              <span>{section.label}</span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProjectOverview({
  repos,
  totalRepos,
  allRankedRepos,
  loading,
  overviewMetric,
  rankMetric,
  visibilityFilter,
  overviewTab,
  repoSearch,
  onRankMetricChange,
  onVisibilityFilterChange,
  onOverviewTabChange,
  onRepoSearchChange,
  onOpenRepo,
}: {
  repos: RankedRepo[];
  totalRepos: number;
  allRankedRepos: RankedRepo[];
  loading: boolean;
  overviewMetric: OverviewMetric;
  rankMetric: RankMetric;
  visibilityFilter: VisibilityFilter;
  overviewTab: OverviewTab;
  repoSearch: string;
  onRankMetricChange: (metric: RankMetric) => void;
  onVisibilityFilterChange: (filter: VisibilityFilter) => void;
  onOverviewTabChange: (tab: OverviewTab) => void;
  onRepoSearchChange: (search: string) => void;
  onOpenRepo: (repoId: number) => void;
}) {
  return (
    <>
      <PortfolioSummary repos={allRankedRepos} />

      <OverviewControls
        repoSearch={repoSearch}
        visibilityFilter={visibilityFilter}
        rankMetric={rankMetric}
        overviewTab={overviewTab}
        onRepoSearchChange={onRepoSearchChange}
        onVisibilityFilterChange={onVisibilityFilterChange}
        onRankMetricChange={onRankMetricChange}
        onOverviewTabChange={onOverviewTabChange}
      />

      {overviewTab === "ranking" ? (
        <PopularityRanking
          repos={repos}
          rankMetric={rankMetric}
          onOpenRepo={onOpenRepo}
        />
      ) : (
        <>
          <div className="overview-heading">
            <h3>Tracked projects</h3>
            <span>
              {loading
                ? "Refreshing previews..."
                : `${repos.length} of ${totalRepos} project${totalRepos === 1 ? "" : "s"}`}
            </span>
          </div>
          <div className="project-grid">
            {repos.map((ranked, index) => (
              <ProjectCard
                key={ranked.repo.id}
                repo={ranked.repo}
                summary={ranked.summary}
                overviewMetric={overviewMetric}
                rank={index + 1}
                onOpen={() => onOpenRepo(ranked.repo.id)}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}

function PortfolioSummary({ repos }: { repos: RankedRepo[] }) {
  const totalViewsWeek = repos.reduce((sum, repo) => sum + repo.viewsWeek, 0);
  const totalClonesWeek = repos.reduce((sum, repo) => sum + repo.clonesWeek, 0);
  const totalStars = repos.reduce((sum, repo) => sum + repo.stars, 0);
  const topRepo = sortRankedRepos(repos, "pulse")[0];

  return (
    <section className="portfolio-summary">
      <PortfolioStat label="Tracked" value={repos.length} />
      <PortfolioStat label="Views this week" value={totalViewsWeek} />
      <PortfolioStat label="Clones this week" value={totalClonesWeek} />
      <PortfolioStat label="Current stars" value={totalStars} />
      <div className="portfolio-leader">
        <span className="portfolio-label">Most active</span>
        <strong>{topRepo?.repo.full_name ?? "No data yet"}</strong>
      </div>
    </section>
  );
}

function PortfolioStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="portfolio-stat">
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
    </div>
  );
}

function OverviewControls({
  repoSearch,
  visibilityFilter,
  rankMetric,
  overviewTab,
  onRepoSearchChange,
  onVisibilityFilterChange,
  onRankMetricChange,
  onOverviewTabChange,
}: {
  repoSearch: string;
  visibilityFilter: VisibilityFilter;
  rankMetric: RankMetric;
  overviewTab: OverviewTab;
  onRepoSearchChange: (search: string) => void;
  onVisibilityFilterChange: (filter: VisibilityFilter) => void;
  onRankMetricChange: (metric: RankMetric) => void;
  onOverviewTabChange: (tab: OverviewTab) => void;
}) {
  return (
    <section className="overview-controls">
      <input
        className="search-input overview-search"
        placeholder="Filter projects..."
        value={repoSearch}
        onChange={(event) => onRepoSearchChange(event.target.value)}
      />

      <select
        className="select overview-select"
        value={visibilityFilter}
        onChange={(event) => onVisibilityFilterChange(event.target.value as VisibilityFilter)}
      >
        <option value="all">All visibility</option>
        <option value="public">Public only</option>
        <option value="private">Private only</option>
      </select>

      <div className="header-segment-group view-control">
        <span>View</span>
        <div className="segmented-control segmented-control-compact">
          <button
            className={`segment ${overviewTab === "projects" ? "active" : ""}`}
            onClick={() => onOverviewTabChange("projects")}
          >
            Projects
          </button>
          <button
            className={`segment ${overviewTab === "ranking" ? "active" : ""}`}
            onClick={() => onOverviewTabChange("ranking")}
          >
            Ranking
          </button>
        </div>
      </div>

      {overviewTab === "ranking" && (
        <div className="header-segment-group rank-control">
          <span>Rank by</span>
          <div className="segmented-control segmented-control-compact">
            {RANK_METRICS.map((metric) => (
              <button
                key={metric.id}
                className={`segment ${rankMetric === metric.id ? "active" : ""}`}
                onClick={() => onRankMetricChange(metric.id)}
              >
                {metric.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function PopularityRanking({
  repos,
  rankMetric,
  onOpenRepo,
}: {
  repos: RankedRepo[];
  rankMetric: RankMetric;
  onOpenRepo: (repoId: number) => void;
}) {
  const topRepos = repos.slice(0, 5);

  if (topRepos.length === 0) {
    return (
      <section className="rank-panel">
        <div className="rank-panel-header">
          <h3>Popularity ranking</h3>
          <span>No matching projects</span>
        </div>
      </section>
    );
  }

  return (
    <section className="rank-panel">
      <div className="rank-panel-header">
        <h3>Popularity ranking</h3>
        <span>{getRankLabel(rankMetric)}</span>
      </div>
      <div className="rank-list">
        {topRepos.map((ranked, index) => (
          <button
            key={ranked.repo.id}
            className="rank-row"
            onClick={() => onOpenRepo(ranked.repo.id)}
          >
            <span className="rank-number">#{index + 1}</span>
            <span className="rank-name">{ranked.repo.full_name}</span>
            <span className="rank-metrics">
              {ranked.viewsWeek.toLocaleString()} views
              <span>{ranked.clonesWeek.toLocaleString()} clones</span>
              <span>{ranked.stars.toLocaleString()} stars</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ProjectCard({
  repo,
  summary,
  overviewMetric,
  rank,
  onOpen,
}: {
  repo: Repo;
  summary?: RepoOverviewSummary;
  overviewMetric: OverviewMetric;
  rank: number;
  onOpen: () => void;
}) {
  const metric = getOverviewMetric(summary, overviewMetric);
  const chartData = getPreviewData(summary, overviewMetric);

  return (
    <button className="project-card" onClick={onOpen}>
      <div className="project-card-top">
        <div className="project-card-name">
          <span>{repo.full_name}</span>
          {repo.private && <span className="badge">private</span>}
        </div>
        <span className="open-hint">#{rank}</span>
      </div>

      {repo.description && <p className="project-card-desc">{repo.description}</p>}

      <div className="project-card-metric">
        <span className="project-metric-value">{metric.value.toLocaleString()}</span>
        <span className="project-metric-label">{metric.label}</span>
        {metric.delta != null && (
          <span className={`trend-badge ${metric.delta >= 0 ? "up" : "down"}`}>
            {metric.delta >= 0 ? "Up" : "Down"} {Math.abs(metric.delta)}%
          </span>
        )}
      </div>

      <div className="project-card-chart">
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={62}>
            <LineChart data={chartData} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
              <Tooltip
                contentStyle={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
                labelFormatter={(label) => String(label)}
                formatter={(value: number) => [value.toLocaleString(), metric.tooltipLabel]}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke={metric.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="project-card-empty">No preview data yet</div>
        )}
      </div>
    </button>
  );
}

function buildRankedRepos(
  repos: Repo[],
  summaries: Record<number, RepoOverviewSummary>
): RankedRepo[] {
  return repos.map((repo) => {
    const summary = summaries[repo.id];
    const viewsWeek = summary ? sumCount(summary.views.slice(-7)) : 0;
    const clonesWeek = summary ? sumCount(summary.clones.slice(-7)) : 0;
    const stars =
      summary && summary.stars.length > 0
        ? summary.stars[summary.stars.length - 1].count
        : 0;

    return {
      repo,
      summary,
      viewsWeek,
      clonesWeek,
      stars,
      pulse: viewsWeek + clonesWeek * 4 + stars * 2,
    };
  });
}

function sortRankedRepos(repos: RankedRepo[], metric: RankMetric): RankedRepo[] {
  return [...repos].sort((a, b) => {
    const left = getRankValue(a, metric);
    const right = getRankValue(b, metric);

    if (right !== left) return right - left;
    return a.repo.full_name.localeCompare(b.repo.full_name);
  });
}

function getRankValue(repo: RankedRepo, metric: RankMetric): number {
  if (metric === "views") return repo.viewsWeek;
  if (metric === "clones") return repo.clonesWeek;
  if (metric === "stars") return repo.stars;
  return repo.pulse;
}

function getRankLabel(metric: RankMetric): string {
  if (metric === "views") return "Views this week";
  if (metric === "clones") return "Clones this week";
  if (metric === "stars") return "Current stars";
  return "Weighted attention";
}

function getOverviewMetric(
  summary: RepoOverviewSummary | undefined,
  metric: OverviewMetric
): {
  label: string;
  tooltipLabel: string;
  value: number;
  delta: number | null;
  color: string;
} {
  if (!summary) {
    return {
      label: metric === "stars" ? "current stars" : `${metric} this week`,
      tooltipLabel: metric,
      value: 0,
      delta: null,
      color: metric === "clones" ? "var(--green)" : metric === "stars" ? "var(--amber)" : "var(--accent)",
    };
  }

  if (metric === "stars") {
    const newest =
      summary.stars.length > 0 ? summary.stars[summary.stars.length - 1].count : 0;
    const weekAgo =
      summary.stars.length >= 7 ? summary.stars[summary.stars.length - 7].count : 0;
    return {
      label: "current stars",
      tooltipLabel: "Stars",
      value: newest,
      delta: summary.stars.length >= 7 ? trendPct(newest, weekAgo) : null,
      color: "var(--amber)",
    };
  }

  const days = metric === "views" ? summary.views : summary.clones;
  const last7 = sumCount(days.slice(-7));
  const prev7 = sumCount(days.slice(-14, -7));

  return {
    label: metric === "views" ? "views this week" : "clones this week",
    tooltipLabel: metric === "views" ? "Views" : "Clones",
    value: last7,
    delta: days.length >= 14 ? trendPct(last7, prev7) : null,
    color: metric === "views" ? "var(--accent)" : "var(--green)",
  };
}

function getPreviewData(
  summary: RepoOverviewSummary | undefined,
  metric: OverviewMetric
): { date: string; count: number }[] {
  if (!summary) return [];

  if (metric === "stars") {
    return summary.stars.map((snapshot) => ({
      date: snapshot.date,
      count: snapshot.count,
    }));
  }

  const days = metric === "views" ? summary.views : summary.clones;
  return days.map((day) => ({
    date: day.date,
    count: day.count,
  }));
}

function CurrentRepoHeader({ repo, onBack }: { repo: Repo; onBack: () => void }) {
  return (
    <section className="current-repo-hero">
      <button className="btn btn-secondary btn-sm" onClick={onBack}>
        All projects
      </button>

      <div className="current-repo-copy">
        <span className="eyebrow">Currently viewing</span>
        <h3>{repo.full_name}</h3>
        <p>{repo.description || "No repository description available."}</p>
      </div>

      <div className="current-repo-meta">
        <span className="badge">{repo.private ? "private" : "public"}</span>
        <span>Created {repo.created_at.slice(0, 10)}</span>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: number;
  delta?: number | null;
}) {
  return (
    <div className="stat-card">
      <div className="stat-value-row">
        <span className="stat-value">{value.toLocaleString()}</span>
        {delta != null && (
          <span className={`trend-badge ${delta >= 0 ? "up" : "down"}`}>
            {delta >= 0 ? "Up" : "Down"} {Math.abs(delta)}%
          </span>
        )}
      </div>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function ReferrerTable({ rows }: { rows: ReferrerRow[] }) {
  return (
    <div className="table-section">
      <h3 className="table-title">Top Referrers</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Source</th>
            <th className="num">Views</th>
            <th className="num">Unique</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.referrer}>
              <td>{r.referrer || "(direct)"}</td>
              <td className="num">{r.count.toLocaleString()}</td>
              <td className="num">{r.uniques.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PathTable({ rows }: { rows: PathRow[] }) {
  return (
    <div className="table-section">
      <h3 className="table-title">Top Paths</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>Path</th>
            <th className="num">Views</th>
            <th className="num">Unique</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.path}>
              <td title={r.title}>{r.path}</td>
              <td className="num">{r.count.toLocaleString()}</td>
              <td className="num">{r.uniques.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
