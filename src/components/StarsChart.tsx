import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { StarSnapshot } from "../types";

interface Props {
  snapshots: StarSnapshot[];
}

export default function StarsChart({ snapshots }: Props) {
  if (snapshots.length < 2) return null;

  return (
    <div className="chart-card">
      <h3 className="chart-title">Stars Over Time</h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={snapshots} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickFormatter={(v) => v.slice(5)}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            allowDecimals={false}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              fontSize: "12px",
            }}
            formatter={(v: number) => [v.toLocaleString(), "Stars"]}
          />
          <Line
            type="monotone"
            dataKey="count"
            name="Stars"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
