"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const REQUIRED_COLUMNS = "title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_lbs,reps,distance_miles,duration_seconds,rpe";

type ImportPreview = {
  columns?: string[];
  total_rows: number;
  valid_rows: number;
  invalid_row_count?: number;
  invalid_rows: { row_number: number; errors: string[]; raw: Record<string, string> }[];
  duplicate_row_count?: number;
  preview: Record<string, unknown>[];
  can_import: boolean;
};

type ImportResult = {
  imported_count: number;
  skipped_duplicate_count: number;
  failed_count: number;
  session_count: number;
  exercise_count: number;
};

type AnalyticsPayload = {
  exercise_analytics: Record<string, {
    total_volume: number;
    best_weight: number;
    best_reps: number;
    estimated_1rm_trend: number[];
    average_rpe: number | null;
    frequency_per_week: number;
    progression_rate: number;
  }>;
  session_analytics: Array<{
    session_id: number;
    title: string;
    date: string;
    total_volume: number;
    number_of_sets: number;
    number_of_exercises: number;
    duration: number | null;
    average_rpe: number | null;
  }>;
};

export default function TrackerSection() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exerciseFilter, setExerciseFilter] = useState("all");
  const [setTypeFilter, setSetTypeFilter] = useState("all");

  const sessionRows = analytics?.session_analytics ?? [];

  const exerciseOptions = useMemo(() => ["all", ...Object.keys(analytics?.exercise_analytics ?? {}).sort()], [analytics]);

  const filteredSessions = useMemo(() => {
    return sessionRows.filter((row) => {
      const date = new Date(row.date);
      if (dateFrom && date < new Date(dateFrom)) return false;
      if (dateTo && date > new Date(`${dateTo}T23:59:59`)) return false;
      return true;
    });
  }, [sessionRows, dateFrom, dateTo]);

  const statSummary = useMemo(() => {
    const totalWorkouts = filteredSessions.length;
    const totalSets = filteredSessions.reduce((acc, s) => acc + s.number_of_sets, 0);
    const totalVolume = filteredSessions.reduce((acc, s) => acc + s.total_volume, 0);
    const avgRpeValues = filteredSessions.map((s) => s.average_rpe).filter((v): v is number => typeof v === "number");
    const avgRpe = avgRpeValues.length ? avgRpeValues.reduce((a, b) => a + b, 0) / avgRpeValues.length : null;
    const totalReps = Object.entries(analytics?.exercise_analytics ?? {})
      .filter(([name]) => exerciseFilter === "all" || name === exerciseFilter)
      .reduce((acc, [, ex]) => acc + Math.max(0, Math.round(ex.total_volume / Math.max(ex.best_weight || 1, 1))), 0);
    return { totalWorkouts, totalSets, totalVolume, totalReps, avgRpe };
  }, [analytics, filteredSessions, exerciseFilter]);

  const topByVolume = useMemo(() => {
    return Object.entries(analytics?.exercise_analytics ?? {})
      .filter(([name]) => exerciseFilter === "all" || name === exerciseFilter)
      .sort((a, b) => b[1].total_volume - a[1].total_volume)
      .slice(0, 8);
  }, [analytics, exerciseFilter]);

  const weeklyTrend = useMemo(() => {
    const byWeek: Record<string, number> = {};
    for (const s of filteredSessions) {
      const d = new Date(s.date);
      const key = `${d.getUTCFullYear()}-W${String(getWeekNumber(d)).padStart(2, "0")}`;
      byWeek[key] = (byWeek[key] ?? 0) + s.total_volume;
    }
    return Object.entries(byWeek).sort((a, b) => a[0].localeCompare(b[0])).slice(-10);
  }, [filteredSessions]);

  const runPreview = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const resp = await fetch(`${API_URL}/api/workouts/import/preview`, { method: "POST", body: fd });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail?.message ?? data?.detail ?? "Failed to preview CSV");
      setPreview(data);
      setMessage(`Preview complete: ${data.valid_rows} valid, ${data.invalid_row_count ?? 0} invalid, ${data.duplicate_row_count ?? 0} duplicates.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to preview CSV");
    } finally {
      setLoading(false);
    }
  };

  const importCsv = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const resp = await fetch(`${API_URL}/api/workouts/import`, { method: "POST", body: fd });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail?.message ?? data?.detail ?? "Failed to import CSV");
      setImportResult(data);
      setMessage(`Import finished. Imported ${data.imported_count}, skipped duplicates ${data.skipped_duplicate_count}, failed ${data.failed_count}.`);
      await fetchAnalytics();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import CSV");
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const resp = await fetch(`${API_URL}/api/workouts/analytics`);
      if (!resp.ok) throw new Error(await resp.text());
      setAnalytics(await resp.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
    }
  };

  return (
    <section className="section" id="tracker" style={{ background: "linear-gradient(180deg, var(--navy), #152a5f)" }}>
      <div className="container" style={{ color: "#fff" }}>
        <h1 style={{ fontSize: 32 }}>Premium Workout Analytics</h1>
        <p style={{ color: "rgba(255,255,255,.7)", marginTop: 8 }}>Import workouts.csv, preview strict validation, then explore performance trends.</p>

        {error && <div style={{ ...notice, borderColor: "#b91c1c", color: "#fecaca" }}>⚠️ {error}</div>}
        {message && <div style={{ ...notice, borderColor: "#0f766e", color: "#bbf7d0" }}>{message}</div>}

        <div style={grid2}>
          <div style={panelStyle}>
            <h3>CSV Upload & Validation</h3>
            <p style={muted}>Required columns (exact): <code>{REQUIRED_COLUMNS}</code></p>
            <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button className="btn-ghost" onClick={runPreview} disabled={!file || loading} style={btnGhost}>Preview CSV</button>
              <button className="btn-primary" onClick={importCsv} disabled={!preview?.can_import || loading}>Import CSV</button>
              <button className="btn-ghost" onClick={fetchAnalytics} style={btnGhost}>Refresh</button>
            </div>
            {preview && (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                <div>Rows: {preview.total_rows} · Valid: {preview.valid_rows} · Invalid: {preview.invalid_row_count ?? 0} · Duplicate: {preview.duplicate_row_count ?? 0}</div>
                {(preview.invalid_rows ?? []).length > 0 && (
                  <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                    {preview.invalid_rows.slice(0, 5).map((r) => <li key={r.row_number}>Row {r.row_number}: {r.errors.join(", ")}</li>)}
                  </ul>
                )}
              </div>
            )}
            {importResult && <p style={{ ...muted, marginTop: 10 }}>Imported: {importResult.imported_count} · Skipped duplicates: {importResult.skipped_duplicate_count} · Failed: {importResult.failed_count}</p>}
          </div>

          <div style={panelStyle}>
            <h3>Filters</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div><label className="label">Date from</label><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div>
              <div><label className="label">Date to</label><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div>
              <div>
                <label className="label">Exercise</label>
                <select value={exerciseFilter} onChange={(e) => setExerciseFilter(e.target.value)}>
                  {exerciseOptions.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Set type</label>
                <select value={setTypeFilter} onChange={(e) => setSetTypeFilter(e.target.value)}>
                  <option value="all">all</option>
                  <option value="work">work</option>
                  <option value="warmup">warmup</option>
                </select>
              </div>
            </div>
            <p style={{ ...muted, marginTop: 10 }}>Set type filter is shown for upcoming set-level payload support.</p>
          </div>
        </div>

        <div style={{ ...grid4, marginTop: 14 }}>
          <StatCard title="Total workouts" value={statSummary.totalWorkouts} />
          <StatCard title="Total sets" value={statSummary.totalSets} />
          <StatCard title="Total reps" value={statSummary.totalReps} />
          <StatCard title="Total volume" value={Math.round(statSummary.totalVolume)} />
          <StatCard title="Average RPE" value={statSummary.avgRpe ? statSummary.avgRpe.toFixed(2) : "--"} />
        </div>

        <div style={{ ...grid2, marginTop: 14 }}>
          <div style={panelStyle}>
            <h3>Weekly Volume Trend</h3>
            <BarChart rows={weeklyTrend.map(([k, v]) => ({ label: k, value: v }))} />
          </div>
          <div style={panelStyle}>
            <h3>Top Exercises by Volume</h3>
            <BarChart rows={topByVolume.map(([k, v]) => ({ label: k, value: v.total_volume }))} compact />
          </div>
        </div>

        <div style={{ ...grid2, marginTop: 14 }}>
          <div style={panelStyle}>
            <h3>Estimated Strength Progression</h3>
            {(topByVolume.length === 0) ? <p style={muted}>Import data to see progression.</p> : (
              <table style={tableStyle}><thead><tr><th>Exercise</th><th>Best</th><th>1RM trend points</th><th>Progression</th></tr></thead><tbody>
                {topByVolume.slice(0, 8).map(([name, item]) => (
                  <tr key={name}><td>{name}</td><td>{item.best_weight}×{item.best_reps}</td><td>{item.estimated_1rm_trend.length}</td><td>{item.progression_rate}</td></tr>
                ))}
              </tbody></table>
            )}
          </div>
          <div style={panelStyle}>
            <h3>Recent Sessions</h3>
            <table style={tableStyle}><thead><tr><th>Date</th><th>Title</th><th>Sets</th><th>Volume</th><th>Duration</th></tr></thead><tbody>
              {filteredSessions.slice(0, 10).map((s) => (
                <tr key={s.session_id}>
                  <td>{new Date(s.date).toLocaleDateString()}</td><td>{s.title}</td><td>{s.number_of_sets}</td><td>{Math.round(s.total_volume)}</td><td>{s.duration ? `${s.duration}m` : "--"}</td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatCard({ title, value }: { title: string; value: string | number }) {
  return <div style={statCard}><div style={{ fontSize: 12, color: "rgba(255,255,255,.7)" }}>{title}</div><div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div></div>;
}

function BarChart({ rows, compact }: { rows: { label: string; value: number }[]; compact?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {rows.slice(0, compact ? 8 : 10).map((row) => (
        <div key={row.label}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}><span>{row.label}</span><span>{Math.round(row.value)}</span></div>
          <div style={{ height: 8, background: "rgba(255,255,255,.12)", borderRadius: 999 }}>
            <div style={{ width: `${(row.value / max) * 100}%`, height: "100%", background: "linear-gradient(90deg,#7b68ee,#22d3ee)", borderRadius: 999 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function getWeekNumber(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

const notice: CSSProperties = { marginTop: 12, border: "1px solid", borderRadius: 10, padding: "10px 12px" };
const panelStyle: CSSProperties = { background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 14, padding: 16 };
const btnGhost: CSSProperties = { color: "#fff", borderColor: "rgba(255,255,255,.3)" };
const muted: CSSProperties = { color: "rgba(255,255,255,.65)", fontSize: 13 };
const grid2: CSSProperties = { marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px,1fr))", gap: 14 };
const grid4: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 10 };
const statCard: CSSProperties = { background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.14)", borderRadius: 12, padding: 12 };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 12 };
