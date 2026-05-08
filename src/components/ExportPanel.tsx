import { useRef, useState } from "react";
import { api } from "../lib/tauri";
import type { Repo } from "../types";
import EmptyState from "./EmptyState";

async function buildMarkdown(repos: Repo[]): Promise<string> {
  const lines: string[] = [
    `# RepoPulse Summary`,
    ``,
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    ``,
  ];

  for (const repo of repos) {
    lines.push(`## ${repo.full_name}`, ``);

    try {
      const [views, clones, referrers, releases, insights] = await Promise.all([
        api.getViews(repo.id),
        api.getClones(repo.id),
        api.getReferrers(repo.id),
        api.getReleases(repo.id),
        api.getInsights(repo.id),
      ]);

      const totalViews = views.reduce((s, v) => s + v.count, 0);
      const totalClones = clones.reduce((s, c) => s + c.count, 0);

      lines.push(`**Views (all time):** ${totalViews.toLocaleString()}`);
      lines.push(`**Clones (all time):** ${totalClones.toLocaleString()}`);
      lines.push(``);

      if (releases.length > 0) {
        lines.push(`### Releases`);
        lines.push(``);
        lines.push(`| Tag | Published | Downloads |`);
        lines.push(`|-----|-----------|-----------|`);
        for (const r of releases.slice(0, 10)) {
          lines.push(`| ${r.tag_name} | ${r.published_at.slice(0, 10)} | ${r.total_downloads.toLocaleString()} |`);
        }
        lines.push(``);
      }

      if (referrers.length > 0) {
        lines.push(`### Top Referrers`);
        lines.push(``);
        lines.push(`| Source | Views |`);
        lines.push(`|--------|-------|`);
        for (const r of referrers.slice(0, 5)) {
          lines.push(`| ${r.referrer || "(direct)"} | ${r.count.toLocaleString()} |`);
        }
        lines.push(``);
      }

      if (insights.length > 0) {
        lines.push(`### Insights`);
        lines.push(``);
        for (const ins of insights) {
          const prefix = ins.severity === "positive" ? "✅" : ins.severity === "warning" ? "⚠️" : "ℹ️";
          lines.push(`- ${prefix} **${ins.title}** — ${ins.body}`);
        }
        lines.push(``);
      }
    } catch {
      lines.push(`_(No data available)_`, ``);
    }
  }

  return lines.join("\n");
}

interface Props {
  trackedRepos: Repo[];
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportPanel({ trackedRepos }: Props) {
  const [csvRepoId, setCsvRepoId] = useState<number>(trackedRepos[0]?.id ?? 0);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exportJson = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const json = await api.exportJson();
      downloadFile(json, "repopulse-backup.json", "application/json");
      setMessage({ type: "ok", text: "JSON backup downloaded." });
    } catch (e) {
      setMessage({ type: "err", text: String(e) });
    } finally {
      setExporting(false);
    }
  };

  const exportMarkdown = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const md = await buildMarkdown(trackedRepos);
      downloadFile(md, "repopulse-summary.md", "text/markdown");
      setMessage({ type: "ok", text: "Markdown summary downloaded." });
    } catch (e) {
      setMessage({ type: "err", text: String(e) });
    } finally {
      setExporting(false);
    }
  };

  const exportCsv = async () => {
    if (!csvRepoId) return;
    setExporting(true);
    setMessage(null);
    try {
      const csv = await api.exportCsv(csvRepoId);
      const repo = trackedRepos.find((r) => r.id === csvRepoId);
      const name = repo?.full_name.replace("/", "_") ?? "repo";
      downloadFile(csv, `${name}-traffic.csv`, "text/csv");
      setMessage({ type: "ok", text: "CSV downloaded." });
    } catch (e) {
      setMessage({ type: "err", text: String(e) });
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setMessage(null);
    try {
      const text = await file.text();
      await api.importBackup(text);
      setMessage({ type: "ok", text: "Backup imported successfully." });
    } catch (e) {
      setMessage({ type: "err", text: String(e) });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (trackedRepos.length === 0) {
    return (
      <div className="page">
        <h2 className="page-title">Export</h2>
        <EmptyState
          title="No repos tracked"
          body="Track some repos first, then come back here to export your data."
        />
      </div>
    );
  }

  return (
    <div className="page">
      <h2 className="page-title">Export &amp; Import</h2>

      {message && (
        <div className={`banner ${message.type}`}>{message.text}</div>
      )}

      <div className="export-sections">
        <section className="export-card">
          <h3>Full JSON Backup</h3>
          <p>
            Export all repos, views, and clones as a single JSON file. Use this
            to back up your data or migrate to a new machine.
          </p>
          <button
            className="btn btn-primary"
            onClick={exportJson}
            disabled={exporting}
          >
            {exporting ? "Exporting…" : "Download JSON"}
          </button>
        </section>

        <section className="export-card">
          <h3>Markdown Summary</h3>
          <p>
            Export a human-readable markdown report with traffic stats, releases,
            referrers, and rule-based insights for all tracked repos.
          </p>
          <button
            className="btn btn-primary"
            onClick={exportMarkdown}
            disabled={exporting}
          >
            {exporting ? "Exporting…" : "Download Markdown"}
          </button>
        </section>

        <section className="export-card">
          <h3>CSV Export</h3>
          <p>
            Export views and clones for one repo as a CSV file, ready for
            spreadsheets.
          </p>
          <div className="export-row">
            <select
              className="select"
              value={csvRepoId}
              onChange={(e) => setCsvRepoId(Number(e.target.value))}
            >
              {trackedRepos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              onClick={exportCsv}
              disabled={exporting || !csvRepoId}
            >
              {exporting ? "Exporting…" : "Download CSV"}
            </button>
          </div>
        </section>

        <section className="export-card">
          <h3>Import Backup</h3>
          <p>
            Restore from a previously exported JSON backup. Existing data is
            preserved — the import only adds missing rows.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="file-input"
            onChange={handleImport}
            disabled={importing}
          />
          {importing && <span className="inline-status">Importing…</span>}
        </section>
      </div>
    </div>
  );
}
