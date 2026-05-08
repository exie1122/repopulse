import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Release, TrafficDay } from "../types";

interface Props {
  views: TrafficDay[];
  clones: TrafficDay[];
  releases?: Release[];
}

const COLORS = {
  count: "#6366f1",
  uniques: "#a5b4fc",
  clones: "#10b981",
  uniqueCloners: "#6ee7b7",
  release: "#f59e0b",
};

export default function TrafficCharts({ views, clones, releases = [] }: Props) {
  return (
    <div className="charts-grid">
      <ChartCard
        title="Views Over Time"
        data={views}
        countLabel="Views"
        uniquesLabel="Unique Visitors"
        countColor={COLORS.count}
        uniquesColor={COLORS.uniques}
        releases={releases}
      />
      <ChartCard
        title="Clones Over Time"
        data={clones}
        countLabel="Clones"
        uniquesLabel="Unique Cloners"
        countColor={COLORS.clones}
        uniquesColor={COLORS.uniqueCloners}
        releases={releases}
      />
    </div>
  );
}

interface ChartCardProps {
  title: string;
  data: TrafficDay[];
  countLabel: string;
  uniquesLabel: string;
  countColor: string;
  uniquesColor: string;
  releases: Release[];
}

function ChartCard({
  title,
  data,
  countLabel,
  uniquesLabel,
  countColor,
  uniquesColor,
  releases,
}: ChartCardProps) {
  if (data.length === 0) {
    return (
      <div className="chart-card">
        <h3 className="chart-title">{title}</h3>
        <div className="chart-empty">No data in range</div>
      </div>
    );
  }

  const dates = new Set(data.map((d) => d.date));
  const releasesInRange = releases.filter(
    (r) => !r.prerelease && dates.has(r.published_at.slice(0, 10))
  );

  return (
    <div className="chart-card">
      <h3 className="chart-title">{title}</h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickFormatter={(v) => v.slice(5)}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              fontSize: "12px",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "12px" }} />
          {releasesInRange.map((r) => (
            <ReferenceLine
              key={r.github_id}
              x={r.published_at.slice(0, 10)}
              stroke={COLORS.release}
              strokeDasharray="4 3"
              label={{
                value: r.tag_name,
                position: "top",
                fontSize: 10,
                fill: COLORS.release,
              }}
            />
          ))}
          <Line
            type="monotone"
            dataKey="count"
            name={countLabel}
            stroke={countColor}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="uniques"
            name={uniquesLabel}
            stroke={uniquesColor}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
