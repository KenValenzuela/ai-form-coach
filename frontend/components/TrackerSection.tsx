"use client";

import { useState } from "react";
import type { CSSProperties } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type ChartsResponse = {
  summary: {
    rows: number;
    sessions: number;
    exercises: number;
    total_sets: number;
    total_reps: number;
    total_volume_lbs: number;
    total_distance_miles: number;
    total_duration_minutes: number;
    average_rpe: number | null;
  };
  invalid_rows: { row_number: number; errors: string[] }[];
  charts: Record<string, string>;
  preview: Record<string, string | number | null>[];
  required_columns: string[];
  analytics?: {
    training_overview: {
      total_sessions: number;
      total_sets: number;
      total_volume_lbs: number;
      average_session_duration_minutes: number;
      workouts_per_week: number;
      average_sets_per_session: number;
      average_volume_per_session: number;
    };
    strength_progression: {
      pr_table: {
        exercise: string;
        best_estimated_1rm: number;
        last_estimated_1rm: number;
        change_from_first: number;
        sessions_logged: number;
        sets_logged: number;
      }[];
    };
    hypertrophy_balance: {
      sets_by_muscle: Record<string, number>;
      ratios: Record<string, number | null>;
      undertrained: string[];
      overloaded: string[];
    };
    recovery: {
      rpe_quality_score: number;
      fatigue_risk: string;
      deload_needed: boolean;
      high_effort_frequency: number;
      consecutive_training_days: number;
      volume_spike_weeks: string[];
    };
    junk_volume_flags: { exercise: string; set_count: number; flag: string }[];
    coach_recommendations: string[];
  };
};

const CHART_TITLES: Record<string, string> = {
  weekly_total_volume_lineplot: "Weekly Total Volume",
  weekly_sets_by_muscle_stacked: "Weekly Sets by Muscle Group",
  dow_volume_heatmap: "Volume Heatmap (Day x Week)",
  estimated_1rm_by_exercise_lineplot: "Estimated 1RM Over Time",
  total_volume_by_muscle_bar: "Total Volume by Muscle Group",
  total_sets_by_muscle_bar: "Total Sets by Muscle Group",
  volume_vs_rpe_scatter: "Volume vs RPE",
  reps_by_exercise_boxplot: "Reps by Exercise",
  metric_correlation_heatmap: "Correlation Heatmap",
  recent_vs_previous_8_weeks: "Recent 8 vs Previous 8 Weeks",
};

export default function TrackerSection() {
  const [fileName, setFileName] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ChartsResponse | null>(null);

  const onCsvUpload = async (file: File | null) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setData(null);
    setFileName(file.name);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const resp = await fetch(`${API_URL}/api/workouts/charts`, {
        method: "POST",
        body: formData,
      });
      const payload = await resp.json();
      if (!resp.ok) {
        throw new Error(payload?.detail ?? "Failed to analyze CSV.");
      }
      setData(payload as ChartsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze CSV.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="section" id="tracker">
      <div className="container">
        <h1 style={{ fontSize: 32, marginBottom: 8 }}>Tracker Coach Dashboard</h1>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>
          Upload a workout CSV for progression, fatigue, balance, and next-week coaching calls.
        </p>

        <div style={{ ...panel, padding: 16, marginBottom: 16 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <strong>Upload workout CSV</strong>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const nextFile = e.target.files?.[0] ?? null;
                void onCsvUpload(nextFile);
              }}
            />
          </label>
          {fileName && <p style={{ marginTop: 10 }}>Loaded: {fileName}</p>}
          {loading && <p style={{ marginTop: 10 }}>Analyzing training history...</p>}
          {error && <p style={{ marginTop: 10, color: "#b91c1c" }}>{error}</p>}
        </div>

        {data && (
          <>
            <h2 style={sectionTitle}>Training Overview</h2>
            <div style={metricsGrid}>
              <MetricCard label="Sessions" value={formatNumber(data.summary.sessions)} />
              <MetricCard label="Total Sets" value={formatNumber(data.summary.total_sets)} />
              <MetricCard label="Total Volume (lbs)" value={formatNumber(data.summary.total_volume_lbs)} />
              <MetricCard label="Avg Session Minutes" value={formatNumber(data.analytics?.training_overview.average_session_duration_minutes ?? 0)} />
              <MetricCard label="Workouts / Week" value={formatNumber(data.analytics?.training_overview.workouts_per_week ?? 0)} />
              <MetricCard label="Avg RPE" value={data.summary.average_rpe == null ? "—" : formatNumber(data.summary.average_rpe)} />
            </div>

            {data.analytics && (
              <>
                <h2 style={sectionTitle}>Strength Progression</h2>
                <div style={{ ...panel, padding: 14, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {['Exercise', 'Best e1RM', 'Last e1RM', 'Δ from first', 'Sessions'].map((h) => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.analytics.strength_progression.pr_table.map((row) => (
                        <tr key={row.exercise}>
                          <td style={tdStyle}>{row.exercise}</td>
                          <td style={tdStyle}>{formatNumber(row.best_estimated_1rm)}</td>
                          <td style={tdStyle}>{formatNumber(row.last_estimated_1rm)}</td>
                          <td style={tdStyle}>{formatNumber(row.change_from_first)}</td>
                          <td style={tdStyle}>{formatNumber(row.sessions_logged)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h2 style={sectionTitle}>Hypertrophy Balance & Recovery</h2>
                <div style={metricsGrid}>
                  <MetricCard label="Push:Pull" value={formatNumber(data.analytics.hypertrophy_balance.ratios.push_pull ?? 0)} />
                  <MetricCard label="Quad:Hamstring" value={formatNumber(data.analytics.hypertrophy_balance.ratios.quad_hamstring ?? 0)} />
                  <MetricCard label="Upper:Lower" value={formatNumber(data.analytics.hypertrophy_balance.ratios.upper_lower ?? 0)} />
                  <MetricCard label="RPE Quality %" value={formatNumber(data.analytics.recovery.rpe_quality_score)} />
                  <MetricCard label="High-Effort %" value={formatNumber(data.analytics.recovery.high_effort_frequency)} />
                  <MetricCard label="Fatigue Risk" value={data.analytics.recovery.fatigue_risk.toUpperCase()} />
                </div>

                <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr", marginTop: 16 }}>
                  <div style={{ ...panel, padding: 14 }}>
                    <strong>Junk Volume Flags</strong>
                    <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                      {data.analytics.junk_volume_flags.slice(0, 8).map((x) => (
                        <li key={x.exercise}>{x.exercise} ({x.set_count} sets): {x.flag}</li>
                      ))}
                    </ul>
                  </div>
                  <div style={{ ...panel, padding: 14 }}>
                    <strong>Coach Recommendations</strong>
                    <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                      {data.analytics.coach_recommendations.map((x, i) => (
                        <li key={`${x}-${i}`}>{x}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            )}

            <h2 style={sectionTitle}>Visual Analytics</h2>
            <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
              {Object.entries(data.charts).map(([chartKey, base64]) => (
                <div key={chartKey} style={{ ...panel, padding: 12 }}>
                  <h3 style={{ marginBottom: 10 }}>{CHART_TITLES[chartKey] ?? chartKey}</h3>
                  <img src={`data:image/png;base64,${base64}`} alt={CHART_TITLES[chartKey] ?? chartKey} style={{ width: "100%", height: "auto", borderRadius: 8 }} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ ...panel, padding: 14 }}>
      <div style={{ color: "var(--muted)", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(Math.round(value * 100) / 100);
}

const panel: CSSProperties = { border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)" };
const metricsGrid: CSSProperties = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" };
const sectionTitle: CSSProperties = { marginTop: 24, marginBottom: 10, fontSize: 24 };
const thStyle: CSSProperties = { textAlign: "left", borderBottom: "1px solid var(--border)", padding: "8px 6px" };
const tdStyle: CSSProperties = { borderBottom: "1px solid var(--border)", padding: "8px 6px" };
