"use client";

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { CSSProperties, DragEvent } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type XYPoint = { week?: string; value?: number };
type ExerciseVolume = { exercise?: string; volume_lbs?: number };
type ExerciseSets = { exercise?: string; sets?: number };
type E1rmPoint = { date?: string; e1rm?: number };
type MuscleTrendPoint = { week?: string; muscle?: string; sets?: number };

type WorkoutChartsPayload = {
  summary?: {
    rows?: number;
    sessions?: number;
    exercises?: number;
    total_sets?: number;
    total_reps?: number;
    total_volume_lbs?: number;
    total_duration_minutes?: number;
    average_rpe?: number | null;
  };
  analytics?: {
    strength_progression?: { pr_table?: Array<Record<string, string | number>> };
    hypertrophy_balance?: {
      sets_by_muscle?: Record<string, number>;
      ratios?: Record<string, number>;
      undertrained?: string[];
      overloaded?: string[];
    };
    recovery?: {
      fatigue_risk?: "low" | "moderate" | "high";
      deload_needed?: boolean;
      high_effort_frequency?: { count?: number; total_rpe_sets?: number; percent?: number };
      consecutive_training_days?: number;
      volume_spike_weeks?: string[];
      rpe_quality_score?: number;
    };
    coach_recommendations?: string[];
  };
  charts?: {
    weekly_volume?: XYPoint[];
    weekly_sets?: XYPoint[];
    weekly_reps?: XYPoint[];
    muscle_trend?: MuscleTrendPoint[];
    e1rm_trend?: Record<string, E1rmPoint[]>;
    rpe_dist?: Record<string, number>;
    top_exercises_by_volume?: ExerciseVolume[];
    top_exercises_by_sets?: ExerciseSets[];
  };
};

type Phase = "upload" | "loading" | "report";

const requiredColumns = ["title", "start_time", "exercise_title", "weight_lbs", "reps"];

export default function TrackerSection() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>("upload");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<WorkoutChartsPayload | null>(null);

  const summary = data?.summary;
  const recovery = data?.analytics?.recovery;
  const statCards = useMemo(
    () => [
      ["Total Volume", `${formatNum(summary?.total_volume_lbs)} lbs`],
      ["Sessions", formatNum(summary?.sessions)],
      ["Total Sets", formatNum(summary?.total_sets)],
      ["Total Reps", formatNum(summary?.total_reps)],
      ["Duration", `${formatNum(summary?.total_duration_minutes)} min`],
      ["Avg RPE", summary?.average_rpe == null ? "N/A" : Number(summary.average_rpe).toFixed(2)],
    ],
    [summary],
  );

  const onCsvUpload = async (file: File | null) => {
    if (!file) return setError("Please choose a CSV file.");
    if (!file.name.toLowerCase().endsWith(".csv")) return setError("Only CSV files are supported.");

    setFileName(file.name);
    setError(null);
    setPhase("loading");

    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch(`${API_URL}/api/workouts/charts`, { method: "POST", body: fd });
      const payload = (await resp.json().catch(() => null)) as WorkoutChartsPayload | { detail?: string } | null;
      if (!resp.ok) {
        throw new Error((payload as { detail?: string })?.detail || `Upload failed (${resp.status})`);
      }
      setData(payload as WorkoutChartsPayload);
      setPhase("report");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not analyze this CSV.");
      setPhase("upload");
      setData(null);
    }
  };

  const reset = () => {
    setData(null);
    setFileName("");
    setError(null);
    setPhase("upload");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <section className="section" id="tracker">
      <div className="container" style={{ display: "grid", gap: 20 }}>
        <div style={headerWrap}>
          <div>
            <span className="tag tag-lav">Training Intelligence Dashboard</span>
            <h1 style={{ fontSize: 34, marginTop: 10 }}>Strength Coach Analytics</h1>
            <p style={{ color: "var(--muted)", marginTop: 8 }}>
              Upload your workout history and get volume, recovery, strength, and balance insights.
            </p>
          </div>
          {phase === "report" && (
            <button className="btn-ghost" type="button" onClick={reset}>
              Upload new CSV
            </button>
          )}
        </div>

        {phase !== "report" && (
          <label style={dropZone} className="card" onDragOver={(e) => e.preventDefault()} onDrop={(e: DragEvent<HTMLLabelElement>) => {
            e.preventDefault();
            void onCsvUpload(e.dataTransfer.files?.[0] ?? null);
          }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: "none" }}
              onChange={(e) => void onCsvUpload(e.target.files?.[0] ?? null)}
            />
            <h2 style={{ margin: 0 }}>Drop your CSV here</h2>
            <p style={{ color: "var(--muted)", marginTop: 6 }}>Set-level workout data. One row = one set.</p>
            <div style={reqWrap}>
              <strong>Required columns:</strong>
              <code>{requiredColumns.join(", ")}</code>
            </div>
            <button type="button" className="btn-primary">Choose CSV</button>
            {fileName && <p style={{ margin: 0 }}>Selected file: <strong>{fileName}</strong></p>}
            {phase === "loading" && <p style={{ color: "var(--lav)", margin: 0 }}>Analyzing training history...</p>}
            {error && <p style={{ color: "var(--red)", margin: 0 }}>{error}</p>}
          </label>
        )}

        {phase === "report" && data && (
          <>
            <div className="card" style={heroCard}>
              <div>
                <h2 style={{ margin: 0 }}>Athlete Snapshot</h2>
                <p style={{ color: "var(--muted)", marginTop: 6 }}>Your latest workload and fatigue profile.</p>
              </div>
              <span style={riskBadge(recovery?.fatigue_risk)}>Fatigue risk: {recovery?.fatigue_risk ?? "unknown"}</span>
              <div style={statsGrid}>{statCards.map(([label, value]) => <Metric key={label} label={label} value={value} />)}</div>
            </div>

            <div style={twoCol}>
              <Card title="Weekly Volume Trend"><LineChart points={data.charts?.weekly_volume ?? []} label="Volume" /></Card>
              <Card title="Weekly Sets / Reps"><DualMiniChart sets={data.charts?.weekly_sets ?? []} reps={data.charts?.weekly_reps ?? []} /></Card>
            </div>

            <div style={threeCol}>
              <Card title="RPE Distribution"><DonutChart data={data.charts?.rpe_dist ?? {}} /></Card>
              <Card title="Top Exercises by Volume"><TopListVolume rows={data.charts?.top_exercises_by_volume ?? []} /></Card>
              <Card title="Top Exercises by Sets"><TopListSets rows={data.charts?.top_exercises_by_sets ?? []} /></Card>
            </div>

            <div style={twoCol}>
              <Card title="Muscle Group Heatmap"><MuscleHeatmap points={data.charts?.muscle_trend ?? []} /></Card>
              <Card title="Estimated 1RM Progression"><StrengthTable rows={data.analytics?.strength_progression?.pr_table ?? []} /></Card>
            </div>

            <div style={twoCol}>
              <Card title="Recovery & Fatigue Profile"><RecoveryPanel recovery={recovery} /></Card>
              <Card title="Coach Recommendations"><CoachRecommendations items={data.analytics?.coach_recommendations ?? []} /></Card>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) { return <div className="card" style={{ padding: 16 }}><h3 style={{ marginTop: 0 }}>{title}</h3>{children}</div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div style={metric}><small style={{ color: "var(--muted)" }}>{label}</small><strong>{value}</strong></div>; }
function LineChart({ points }: { points: XYPoint[]; label: string }) { if (!points.length) return <Empty message="No weekly data yet." />; return <SimpleBars values={points.map((p) => p.value ?? 0)} labels={points.map((p) => p.week ?? "")}/>; }
function DualMiniChart({ sets, reps }: { sets: XYPoint[]; reps: XYPoint[] }) { if (!sets.length && !reps.length) return <Empty message="No weekly sets/reps data." />; return <div style={{ display: "grid", gap: 8 }}><small>Sets</small><SimpleBars values={sets.map((s) => s.value ?? 0)} labels={sets.map((s) => s.week ?? "")} /><small>Reps</small><SimpleBars values={reps.map((r) => r.value ?? 0)} labels={reps.map((r) => r.week ?? "")} /></div>; }
function SimpleBars({ values, labels }: { values: number[]; labels: string[] }) { const max = Math.max(...values, 1); return <div style={{ display: "grid", gap: 6 }}>{values.map((v, i) => <div key={`${labels[i]}-${i}`} title={`${labels[i]}: ${formatNum(v)}`} style={{ display: "grid", gridTemplateColumns: "100px 1fr auto", gap: 8, alignItems: "center" }}><small style={{ color: "var(--muted)" }}>{labels[i]?.slice(5) || `W${i + 1}`}</small><div style={{ height: 8, background: "var(--off)", borderRadius: 99 }}><div style={{ width: `${Math.max(2, (v / max) * 100)}%`, height: "100%", background: "linear-gradient(90deg,var(--lav),#8f8dff)", borderRadius: 99 }} /></div><small>{formatNum(v)}</small></div>)}</div>; }
function DonutChart({ data }: { data: Record<string, number> }) { const entries = Object.entries(data); if (!entries.length) return <Empty message="RPE values are mostly missing." />; const total = entries.reduce((a, [, b]) => a + b, 0); return <ul style={{ margin: 0, paddingLeft: 18 }}>{entries.map(([k, v]) => <li key={k}>RPE {k}: {v} sets ({((v / total) * 100).toFixed(1)}%)</li>)}</ul>; }
function TopListVolume({ rows }: { rows: ExerciseVolume[] }) { if (!rows.length) return <Empty message="No volume leaders available." />; return <ul style={{ margin: 0, paddingLeft: 18 }}>{rows.map((r, i) => <li key={`${r.exercise}-${i}`}>{r.exercise}: {formatNum(r.volume_lbs)} lbs</li>)}</ul>; }
function TopListSets({ rows }: { rows: ExerciseSets[] }) { if (!rows.length) return <Empty message="No set leaders available." />; return <ul style={{ margin: 0, paddingLeft: 18 }}>{rows.map((r, i) => <li key={`${r.exercise}-${i}`}>{r.exercise}: {formatNum(r.sets)} sets</li>)}</ul>; }
function MuscleHeatmap({ points }: { points: MuscleTrendPoint[] }) { if (!points.length) return <Empty message="No muscle trend data available." />; const grouped = new Map<string, number>(); points.forEach((p) => grouped.set(`${p.muscle}`, (grouped.get(`${p.muscle}`) ?? 0) + (p.sets ?? 0))); return <div style={{ display: "grid", gap: 6 }}>{Array.from(grouped.entries()).sort((a,b)=>b[1]-a[1]).map(([muscle, sets]) => <div key={muscle} style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 8 }}><span>{muscle}</span><strong>{sets} sets</strong></div>)}</div>; }
function StrengthTable({ rows }: { rows: Array<Record<string, string | number>> }) { if (!rows.length) return <Empty message="No estimated 1RM rows." />; return <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse" }}><thead><tr><th>Exercise</th><th>Best e1RM</th><th>Sets</th></tr></thead><tbody>{rows.map((row, i) => <tr key={i}><td>{String(row.exercise ?? "-")}</td><td>{formatNum(row.best_estimated_1rm as number)}</td><td>{formatNum(row.sets_logged as number)}</td></tr>)}</tbody></table></div>; }
function RecoveryPanel({ recovery }: { recovery?: WorkoutChartsPayload["analytics"]["recovery"] }) { if (!recovery) return <Empty message="No recovery metrics found." />; return <ul style={{ margin: 0, paddingLeft: 18 }}><li>Fatigue risk: {recovery.fatigue_risk ?? "unknown"}</li><li>Consecutive training days: {formatNum(recovery.consecutive_training_days)}</li><li>High-effort sets: {formatNum(recovery.high_effort_frequency?.count)} ({formatNum(recovery.high_effort_frequency?.percent)}%)</li><li>RPE quality score: {formatNum(recovery.rpe_quality_score)}%</li><li>Deload needed: {recovery.deload_needed ? "Yes" : "No"}</li></ul>; }
function CoachRecommendations({ items }: { items: string[] }) { if (!items.length) return <Empty message="No recommendations available yet." />; return <ul style={{ margin: 0, paddingLeft: 18 }}>{items.map((it, i) => <li key={`${it}-${i}`}>{it}</li>)}</ul>; }
function Empty({ message }: { message: string }) { return <p style={{ color: "var(--muted)", margin: 0 }}>{message}</p>; }

const headerWrap: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" };
const dropZone: CSSProperties = { padding: 24, border: "1px dashed var(--border)", borderRadius: 16, display: "grid", gap: 10, textAlign: "center", background: "linear-gradient(180deg, rgba(146,121,255,0.08), rgba(255,255,255,0))", cursor: "pointer" };
const reqWrap: CSSProperties = { display: "grid", gap: 4, background: "var(--off)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 };
const heroCard: CSSProperties = { padding: 18, border: "1px solid var(--border)", background: "linear-gradient(180deg, rgba(146,121,255,0.14), rgba(255,255,255,0))" };
const statsGrid: CSSProperties = { marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 };
const metric: CSSProperties = { border: "1px solid var(--border)", borderRadius: 10, padding: 10, display: "grid", gap: 4, background: "var(--off)" };
const twoCol: CSSProperties = { display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" };
const threeCol: CSSProperties = { display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" };

function riskBadge(level?: string) { return { display: "inline-flex", borderRadius: 999, padding: "6px 10px", border: "1px solid var(--border)", background: level === "high" ? "rgba(255,86,86,0.15)" : level === "moderate" ? "rgba(255,195,87,0.15)" : "rgba(139,233,144,0.15)" } as CSSProperties; }
function formatNum(value: number | null | undefined) { if (value == null || Number.isNaN(Number(value))) return "0"; return Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 }); }
