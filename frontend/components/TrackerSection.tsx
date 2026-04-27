"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type WorkoutAnalyticsResponse = {
  exercise_analytics: Record<string, {
    total_sessions?: number;
    total_sets?: number;
    total_volume?: number;
    recent_working_weight?: number | null;
    average_rpe?: number | null;
    last_performed_date?: string | null;
    lift_category?: string;
  }>;
  lift_analytics: Record<string, {
    total_volume: number;
    set_count: number;
    exercise_count: number;
    average_rpe?: number | null;
    last_performed_date?: string | null;
  }>;
  session_analytics: Array<{
    session_id: number;
    title: string;
    date: string;
    total_volume: number;
    number_of_sets: number;
    number_of_exercises: number;
    duration?: number | null;
    average_rpe?: number | null;
  }>;
  suggestions: string[];
};

export default function TrackerSection() {
  const [analytics, setAnalytics] = useState<WorkoutAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadAnalytics = async () => {
      setLoading(true);
      setError(null);
      try {
        const resp = await fetch(`${API_URL}/api/workouts/analytics`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.detail?.message ?? data?.detail ?? "Failed to load workout analytics");
        setAnalytics(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load workout analytics");
      } finally {
        setLoading(false);
      }
    };
    void loadAnalytics();
  }, []);

  const exerciseRows = useMemo(() => {
    if (!analytics?.exercise_analytics) return [];
    return Object.entries(analytics.exercise_analytics).sort((a, b) => a[0].localeCompare(b[0]));
  }, [analytics]);

  return (
    <section className="section" id="tracker">
      <div className="container">
        <h1 style={{ fontSize: 32, marginBottom: 8 }}>Training Journal & Analytics</h1>
        <p style={{ color: "var(--muted)", marginBottom: 14 }}>
          ROI tracking + posture/form coaching are now part of the main upload flow.
          Upload your lift on the Home page to get coaching feedback, then use this page for long-term training trends.
        </p>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <a className="btn-primary" href="/#analyze">Go to Upload & Coaching</a>
          <a className="btn-ghost" href="/">Open Home</a>
        </div>

        {error && <div style={{ ...card, borderColor: "#ef4444", color: "#991b1b", marginBottom: 12 }}>{error}</div>}
        {loading && <div style={card}>Loading analytics…</div>}

        {!loading && !error && analytics && (
          <div style={layout}>
            <div style={card}>
              <h3 style={h3}>Coaching Suggestions</h3>
              {analytics.suggestions?.length ? (
                <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 8 }}>
                  {analytics.suggestions.slice(0, 8).map((tip) => <li key={tip}>{tip}</li>)}
                </ul>
              ) : (
                <p style={muted}>No suggestions yet. Log workouts and upload more lift videos to build personalized coaching insights.</p>
              )}
            </div>

            <div style={card}>
              <h3 style={h3}>Lift Category Analytics</h3>
              {Object.entries(analytics.lift_analytics ?? {}).length ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {Object.entries(analytics.lift_analytics).map(([category, item]) => (
                    <div key={category} style={row}>
                      <strong style={{ textTransform: "capitalize" }}>{category.replaceAll("_", " ")}</strong>
                      <span>Volume: {item.total_volume.toFixed(0)}</span>
                      <span>Sets: {item.set_count}</span>
                      <span>Avg RPE: {item.average_rpe ?? "--"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={muted}>No lift-category analytics available yet.</p>
              )}
            </div>

            <div style={cardWide}>
              <h3 style={h3}>Recent Sessions</h3>
              {analytics.session_analytics?.length ? (
                <div style={{ overflowX: "auto" }}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th style={th}>Date</th><th style={th}>Title</th><th style={th}>Volume</th><th style={th}>Sets</th><th style={th}>Exercises</th><th style={th}>Avg RPE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.session_analytics.slice(0, 10).map((session) => (
                        <tr key={session.session_id}>
                          <td style={td}>{new Date(session.date).toLocaleDateString()}</td>
                          <td style={td}>{session.title}</td>
                          <td style={td}>{session.total_volume.toFixed(0)}</td>
                          <td style={td}>{session.number_of_sets}</td>
                          <td style={td}>{session.number_of_exercises}</td>
                          <td style={td}>{session.average_rpe ?? "--"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={muted}>No sessions logged yet.</p>
              )}
            </div>

            <div style={cardWide}>
              <h3 style={h3}>Exercise Breakdown</h3>
              {exerciseRows.length ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
                  {exerciseRows.map(([exercise, stats]) => (
                    <div key={exercise} style={tile}>
                      <strong>{exercise}</strong>
                      <span>Total Volume: {stats.total_volume?.toFixed(0) ?? "--"}</span>
                      <span>Total Sets: {stats.total_sets ?? "--"}</span>
                      <span>Recent Weight: {stats.recent_working_weight ?? "--"}</span>
                      <span>Avg RPE: {stats.average_rpe ?? "--"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={muted}>No exercise analytics available yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

const layout: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};

const card: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 12,
  background: "var(--card)",
  padding: 14,
};

const cardWide: CSSProperties = {
  ...card,
  gridColumn: "1 / -1",
};

const h3: CSSProperties = { margin: "0 0 10px" };
const muted: CSSProperties = { color: "var(--muted)", margin: 0 };
const row: CSSProperties = { display: "grid", gridTemplateColumns: "1fr repeat(3, auto)", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border)" };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const th: CSSProperties = { textAlign: "left", borderBottom: "1px solid var(--border)", padding: "8px 6px" };
const td: CSSProperties = { borderBottom: "1px solid var(--border)", padding: "8px 6px" };
const tile: CSSProperties = { border: "1px solid var(--border)", borderRadius: 10, padding: 10, display: "grid", gap: 4 };
