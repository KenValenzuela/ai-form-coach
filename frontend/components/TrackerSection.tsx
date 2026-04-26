"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type ImportPreview = {
  total_rows: number;
  valid_rows: number;
  invalid_rows: { row_number: number; errors: string[]; raw: Record<string, string> }[];
  preview: Record<string, unknown>[];
  can_import: boolean;
};

type AnalyticsPayload = {
  exercise_analytics: Record<string, {
    total_volume: number;
    best_weight: number;
    best_reps: number;
    estimated_1rm_trend: number[];
    average_rpe: number | null;
    frequency_per_week: number;
    last_performed_date: string;
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
  suggestions: string[];
  routine_templates: Array<{
    template_name: string;
    occurrences: number;
    tags: string[];
    exercises: Array<{
      exercise_name: string;
      recent_working_weight: number | null;
      typical_reps: number | null;
      typical_sets: number;
      average_rpe: number | null;
      last_used_weight: number | null;
      suggested_next_weight: number | null;
    }>;
  }>;
};

export default function TrackerSection() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);

  const exerciseCards = useMemo(() => Object.entries(analytics?.exercise_analytics ?? {}).slice(0, 6), [analytics]);

  const runPreview = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const resp = await fetch(`${API_URL}/api/workouts/import/preview`, { method: "POST", body: fd });
      if (!resp.ok) throw new Error(await resp.text());
      setPreview(await resp.json());
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
    const fd = new FormData();
    fd.append("file", file);
    try {
      const resp = await fetch(`${API_URL}/api/workouts/import`, { method: "POST", body: fd });
      if (!resp.ok) throw new Error(await resp.text());
      setImportResult(await resp.json());
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
    <section className="section" id="tracker" style={{ background: "var(--navy)" }}>
      <div className="container" style={{ color: "#fff" }}>
        <h1 style={{ fontSize: 30 }}>Training Tracker Analytics</h1>
        <p style={{ color: "rgba(255,255,255,.65)", marginTop: 8 }}>Upload workout history CSV, validate rows, import sessions, and get progression suggestions.</p>

        {error && <div style={{ marginTop: 12, color: "#FCA5A5" }}>⚠️ {error}</div>}

        <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 16 }}>
          <div style={panelStyle}>
            <h3>CSV Import</h3>
            <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="btn-ghost" onClick={runPreview} disabled={!file || loading} style={btnGhost}>Preview</button>
              <button className="btn-primary" onClick={importCsv} disabled={!preview?.can_import || loading}>Import Validated CSV</button>
              <button className="btn-ghost" onClick={fetchAnalytics} style={btnGhost}>Refresh Analytics</button>
            </div>
            {preview && (
              <div style={{ marginTop: 12, fontSize: 13 }}>
                <div>Total rows: {preview.total_rows} · Valid: {preview.valid_rows} · Invalid: {preview.invalid_rows.length}</div>
                {preview.invalid_rows.length > 0 && (
                  <ul style={{ marginTop: 8 }}>
                    {preview.invalid_rows.slice(0, 5).map((r) => <li key={r.row_number}>Row {r.row_number}: {r.errors.join(", ")}</li>)}
                  </ul>
                )}
                <div style={{ overflowX: "auto", marginTop: 8 }}>
                  <table style={{ width: "100%", fontSize: 12 }}><tbody>
                    {preview.preview.slice(0, 5).map((row, idx) => (
                      <tr key={idx}><td style={{ padding: 4, borderBottom: "1px solid rgba(255,255,255,.12)" }}>{String(row.exercise_title)}</td><td>{String(row.weight_lbs ?? "")}</td><td>{String(row.reps ?? "")}</td></tr>
                    ))}
                  </tbody></table>
                </div>
              </div>
            )}
            {importResult && <div style={{ marginTop: 10, fontSize: 12, color: "#A7F3D0" }}>{JSON.stringify(importResult)}</div>}
          </div>

          <div style={panelStyle}>
            <h3>Video Placement</h3>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,.65)" }}>The old focus box is replaced by a dedicated video slot for form review in tracker context.</p>
            <div style={{ height: 180, border: "1px dashed rgba(255,255,255,.3)", borderRadius: 10, display: "grid", placeItems: "center", color: "rgba(255,255,255,.5)" }}>
              Video panel (use Analyze tab upload for full processing)
            </div>
          </div>
        </div>

        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={panelStyle}>
            <h3>Exercise Progress Cards</h3>
            {exerciseCards.length === 0 ? <p style={muted}>No analytics yet.</p> : exerciseCards.map(([name, data]) => (
              <div key={name} style={{ borderTop: "1px solid rgba(255,255,255,.1)", paddingTop: 8, marginTop: 8, fontSize: 13 }}>
                <strong>{name}</strong> · Vol {data.total_volume} · Best {data.best_weight}x{data.best_reps} · Avg RPE {data.average_rpe ?? "--"}
              </div>
            ))}
          </div>

          <div style={panelStyle}>
            <h3>Suggestions</h3>
            {(analytics?.suggestions ?? []).length === 0 ? <p style={muted}>No suggestions yet.</p> : (
              <ul>{analytics?.suggestions.slice(0, 8).map((s, i) => <li key={i} style={{ marginBottom: 6, fontSize: 13 }}>{s}</li>)}</ul>
            )}
          </div>
        </div>

        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={panelStyle}>
            <h3>Recent Workouts</h3>
            {(analytics?.session_analytics ?? []).slice(0, 6).map((s) => (
              <div key={s.session_id} style={{ borderTop: "1px solid rgba(255,255,255,.1)", paddingTop: 8, marginTop: 8, fontSize: 13 }}>
                {new Date(s.date).toLocaleDateString()} · {s.title} · Sets {s.number_of_sets} · Vol {s.total_volume}
              </div>
            ))}
          </div>
          <div style={panelStyle}>
            <h3>Routine Auto-Fill</h3>
            {(analytics?.routine_templates ?? []).slice(0, 3).map((rt) => (
              <div key={rt.template_name} style={{ borderTop: "1px solid rgba(255,255,255,.1)", paddingTop: 8, marginTop: 8 }}>
                <strong>{rt.template_name}</strong> ({rt.occurrences}x)
                <div style={muted}>{rt.tags.join(", ") || "General"}</div>
                <div style={{ fontSize: 12 }}>{rt.exercises.map((e) => `${e.exercise_name} ${e.suggested_next_weight ?? "--"}lbs`).join(" · ")}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

const panelStyle: CSSProperties = { background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 12, padding: 14 };
const btnGhost: CSSProperties = { color: "#fff", borderColor: "rgba(255,255,255,.2)" };
const muted: CSSProperties = { color: "rgba(255,255,255,.55)", fontSize: 13 };
