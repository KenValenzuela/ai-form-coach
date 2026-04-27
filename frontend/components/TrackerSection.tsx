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
};

const CHART_TITLES: Record<string, string> = {
  volume_by_exercise: "Top Exercise Volume",
  volume_over_time: "Workout Volume Over Time",
  rpe_distribution: "RPE Distribution by Exercise",
  set_type_distribution: "Set Type Distribution",
  duration_by_workout: "Workout Duration by Session",
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
        <h1 style={{ fontSize: 32, marginBottom: 8 }}>Workout Tracker (CSV + Charts)</h1>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>
          Upload a workout CSV and generate analytics charts powered by pandas + seaborn.
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
          {loading && <p style={{ marginTop: 10 }}>Analyzing CSV and rendering charts...</p>}
          {error && <p style={{ marginTop: 10, color: "#b91c1c" }}>{error}</p>}
        </div>

        {data && (
          <>
            <div style={metricsGrid}>
              <MetricCard label="Sessions" value={formatNumber(data.summary.sessions)} />
              <MetricCard label="Exercises" value={formatNumber(data.summary.exercises)} />
              <MetricCard label="Total Sets" value={formatNumber(data.summary.total_sets)} />
              <MetricCard label="Total Reps" value={formatNumber(data.summary.total_reps)} />
              <MetricCard label="Total Volume (lbs)" value={formatNumber(data.summary.total_volume_lbs)} />
              <MetricCard label="Distance (miles)" value={formatNumber(data.summary.total_distance_miles)} />
              <MetricCard label="Duration (min)" value={formatNumber(data.summary.total_duration_minutes)} />
              <MetricCard label="Avg RPE" value={data.summary.average_rpe == null ? "—" : formatNumber(data.summary.average_rpe)} />
            </div>

            {data.invalid_rows.length > 0 && (
              <div style={{ ...panel, borderColor: "#f59e0b", padding: 14, marginTop: 16 }}>
                <strong>CSV validation warnings</strong>
                <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                  {data.invalid_rows.slice(0, 20).map((item) => (
                    <li key={item.row_number}>
                      Row {item.row_number}: {item.errors.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
              {Object.entries(data.charts).map(([chartKey, base64]) => (
                <div key={chartKey} style={{ ...panel, padding: 12 }}>
                  <h3 style={{ marginBottom: 10 }}>{CHART_TITLES[chartKey] ?? chartKey}</h3>
                  <img
                    src={`data:image/png;base64,${base64}`}
                    alt={CHART_TITLES[chartKey] ?? chartKey}
                    style={{ width: "100%", height: "auto", borderRadius: 8 }}
                  />
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
