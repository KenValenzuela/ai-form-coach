"use client";

import { useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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
    training_overview?: Record<string, number>;
    strength_progression?: {
      pr_table?: Array<Record<string, string | number>>;
    };
    hypertrophy_balance?: {
      sets_by_muscle?: Record<string, number>;
      ratios?: Record<string, number>;
      undertrained?: string[];
      overloaded?: string[];
    };
    recovery?: {
      rpe_quality_score?: number;
      fatigue_risk?: string;
      deload_needed?: boolean;
      high_effort_frequency?: number;
      consecutive_training_days?: number;
      volume_spike_weeks?: string[];
    };
    junk_volume_flags?: Array<{
      exercise?: string;
      set_count?: number;
      flag?: string;
    }>;
    coach_recommendations?: string[];
  };
  charts?: {
    weekly_volume?: number[];
    muscle_trend?: Record<string, number[]>;
    e1rm_trend?: Record<string, number[]>;
    rpe_dist?: Record<string, number>;
  };
};

type Phase = "upload" | "loading" | "report";

export default function TrackerSection() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>("upload");
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<WorkoutChartsPayload | null>(null);

  const summaryCards = useMemo(
    () => [
      { label: "Sessions", value: data?.summary?.sessions ?? 0 },
      { label: "Exercises", value: data?.summary?.exercises ?? 0 },
      { label: "Total Sets", value: data?.summary?.total_sets ?? 0 },
      { label: "Total Reps", value: data?.summary?.total_reps ?? 0 },
      { label: "Volume (lbs)", value: data?.summary?.total_volume_lbs ?? 0 },
      { label: "Avg RPE", value: data?.summary?.average_rpe ?? 0 },
    ],
    [data],
  );

  const isCsvFile = (file: File) => {
    const fileNameIsCsv = file.name.toLowerCase().endsWith(".csv");
    const mimeTypeLooksCsv = file.type === "text/csv" || file.type === "application/vnd.ms-excel";
    return fileNameIsCsv || mimeTypeLooksCsv;
  };

  const onCsvUpload = async (file: File | null) => {
    if (!file) {
      setError("Please select a CSV file first.");
      return;
    }

    if (!isCsvFile(file)) {
      setError("Only CSV files are supported for workout analysis.");
      return;
    }

    setFileName(file.name);

    try {
      setPhase("loading");
      setError(null);

      const fd = new FormData();
      fd.append("file", file);

      const resp = await fetch(`${API_URL}/api/workouts/charts`, {
        method: "POST",
        body: fd,
      });

      const payload = (await resp.json().catch(() => null)) as WorkoutChartsPayload | null;

      if (!resp.ok) {
        throw new Error(payload && "detail" in payload ? String((payload as Record<string, unknown>).detail) : payload && "message" in payload ? String((payload as Record<string, unknown>).message) : `Workout analytics failed with status ${resp.status}`);
      }

      setData(payload);
      setPhase("report");
    } catch (err) {
      console.error("Workout chart upload failed:", err);
      setError(err instanceof Error ? err.message : "Could not analyze this CSV.");
      setPhase("upload");
      setData(null);
    }
  };

  const onDrop = async (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0] ?? null;
    await onCsvUpload(file);
  };

  const resetToUpload = () => {
    setPhase("upload");
    setData(null);
    setError(null);
    setFileName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <section className="section" id="tracker">
      <div className="container" style={{ display: "grid", gap: 20 }}>
        <div style={headerWrap}>
          <div>
            <span className="tag tag-lav">Workout Tracker</span>
            <h1 style={{ fontSize: 34, marginTop: 10 }}>Tracker Coach Dashboard</h1>
            <p style={{ color: "var(--muted)", marginTop: 8 }}>
              Upload your workout CSV to generate a real coaching report from backend analytics.
            </p>
          </div>
          {phase === "report" && (
            <button className="btn-ghost" onClick={resetToUpload} type="button">
              Upload new file
            </button>
          )}
        </div>

        {(phase === "upload" || phase === "loading") && (
          <div className="card" style={{ padding: 22 }}>
            <label
              onDrop={(event) => {
                void onDrop(event);
              }}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              style={dropZone}
            >
              <strong style={{ fontSize: 18 }}>Upload workout CSV</strong>
              <p style={{ color: "var(--muted)" }}>Drag and drop a .csv file here, or click to choose one.</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={(e) => {
                  const nextFile = e.target.files?.[0] ?? null;
                  void onCsvUpload(nextFile);
                }}
              />
              <span className="btn-primary" style={{ display: "inline-flex", marginTop: 8 }}>
                Choose CSV
              </span>
            </label>

            {fileName && <p style={{ marginTop: 12 }}>Selected file: {fileName}</p>}
            {phase === "loading" && <p style={{ marginTop: 10, color: "var(--lav)" }}>Analyzing training history...</p>}
            {error && <p style={{ marginTop: 10, color: "var(--red)" }}>{error}</p>}
          </div>
        )}

        {phase === "report" && (
          <>
            <div className="card" style={{ padding: 18 }}>
              <h2 style={sectionTitle}>Overview</h2>
              <div style={metricsGrid}>
                {summaryCards.map((card) => (
                  <MetricCard key={card.label} label={card.label} value={formatNumber(card.value)} />
                ))}
              </div>
            </div>

            <div className="card" style={{ padding: 18 }}>
              <h2 style={sectionTitle}>Weekly Volume Chart</h2>
              <WeeklyVolumeChart points={data?.charts?.weekly_volume ?? []} />
            </div>

            <div className="card" style={{ padding: 18 }}>
              <h2 style={sectionTitle}>Strength Progression</h2>
              <StrengthProgressionTable rows={data?.analytics?.strength_progression?.pr_table ?? []} />
            </div>

            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
              <div className="card" style={{ padding: 18 }}>
                <h2 style={sectionTitle}>Hypertrophy Balance</h2>
                <HypertrophyBalance analytics={data?.analytics?.hypertrophy_balance} />
              </div>

              <div className="card" style={{ padding: 18 }}>
                <h2 style={sectionTitle}>Recovery & Fatigue Profile</h2>
                <RecoveryPanel recovery={data?.analytics?.recovery} />
              </div>
            </div>

            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
              <div className="card" style={{ padding: 18 }}>
                <h2 style={sectionTitle}>Junk Volume Flags</h2>
                <JunkVolumeFlags flags={data?.analytics?.junk_volume_flags ?? []} />
              </div>

              <div className="card" style={{ padding: 18 }}>
                <h2 style={sectionTitle}>Coach Recommendations</h2>
                <CoachRecommendations items={data?.analytics?.coach_recommendations ?? []} />
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ color: "var(--muted)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function WeeklyVolumeChart({ points }: { points: number[] }) {
  if (!points.length) {
    return <EmptyState message="No weekly volume data available yet." />;
  }

  const maxPoint = Math.max(...points, 1);

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${points.length}, minmax(24px, 1fr))`, gap: 8, alignItems: "end" }}>
      {points.map((point, idx) => {
        const height = Math.max((point / maxPoint) * 180, 12);
        return (
          <div key={`${point}-${idx}`} style={{ display: "grid", gap: 6, justifyItems: "center" }}>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{formatNumber(point)}</span>
            <div style={{ width: "100%", height, borderRadius: 8, background: "linear-gradient(180deg, var(--lav-l), var(--lav))" }} />
            <span style={{ fontSize: 11, color: "var(--muted)" }}>W{idx + 1}</span>
          </div>
        );
      })}
    </div>
  );
}

function StrengthProgressionTable({ rows }: { rows: Array<Record<string, string | number>> }) {
  if (!rows.length) {
    return <EmptyState message="No strength progression data available yet." />;
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Exercise", "Best e1RM", "Last e1RM", "Change", "Sessions"].map((h) => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={`${String(row.exercise ?? "exercise")}-${idx}`}>
              <td style={tdStyle}>{String(row.exercise ?? "—")}</td>
              <td style={tdStyle}>{formatNumber(getNumber(row.best_estimated_1rm))}</td>
              <td style={tdStyle}>{formatNumber(getNumber(row.last_estimated_1rm))}</td>
              <td style={tdStyle}>{formatNumber(getNumber(row.change_from_first))}</td>
              <td style={tdStyle}>{formatNumber(getNumber(row.sessions_logged))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HypertrophyBalance({ analytics }: { analytics: WorkoutChartsPayload["analytics"] extends infer A ? A extends object ? A["hypertrophy_balance"] : never : never }) {
  const setsByMuscle = analytics?.sets_by_muscle ?? {};
  const ratios = analytics?.ratios ?? {};
  const undertrained = analytics?.undertrained ?? [];
  const overloaded = analytics?.overloaded ?? [];

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {Object.keys(setsByMuscle).length > 0 ? (
        <ul style={{ paddingLeft: 18 }}>
          {Object.entries(setsByMuscle).map(([muscle, sets]) => (
            <li key={muscle}>
              {muscle}: <strong>{formatNumber(sets)}</strong> sets
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState message="No muscle group set data available yet." />
      )}

      {Object.keys(ratios).length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(ratios).map(([name, value]) => (
            <span key={name} className="tag tag-lav">
              {name.replaceAll("_", " ")}: {formatNumber(value)}
            </span>
          ))}
        </div>
      )}

      {(undertrained.length > 0 || overloaded.length > 0) && (
        <div style={{ display: "grid", gap: 8 }}>
          {undertrained.length > 0 && <p><strong>Undertrained:</strong> {undertrained.join(", ")}</p>}
          {overloaded.length > 0 && <p><strong>Overloaded:</strong> {overloaded.join(", ")}</p>}
        </div>
      )}
    </div>
  );
}

function RecoveryPanel({ recovery }: { recovery: WorkoutChartsPayload["analytics"] extends infer A ? A extends object ? A["recovery"] : never : never }) {
  if (!recovery) {
    return <EmptyState message="No recovery profile data available yet." />;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p><strong>Fatigue risk:</strong> {(recovery.fatigue_risk ?? "unknown").toUpperCase()}</p>
      <p><strong>RPE quality:</strong> {formatNumber(recovery.rpe_quality_score ?? 0)}</p>
      <p><strong>High effort frequency:</strong> {formatNumber(recovery.high_effort_frequency ?? 0)}</p>
      <p><strong>Consecutive training days:</strong> {formatNumber(recovery.consecutive_training_days ?? 0)}</p>
      <p><strong>Deload needed:</strong> {recovery.deload_needed ? "Yes" : "No"}</p>
      {(recovery.volume_spike_weeks ?? []).length > 0 && (
        <p><strong>Volume spike weeks:</strong> {(recovery.volume_spike_weeks ?? []).join(", ")}</p>
      )}
    </div>
  );
}

function JunkVolumeFlags({ flags }: { flags: Array<{ exercise?: string; set_count?: number; flag?: string }> }) {
  if (!flags.length) {
    return <EmptyState message="No junk volume flags found." />;
  }

  return (
    <ul style={{ paddingLeft: 18 }}>
      {flags.map((item, idx) => (
        <li key={`${item.exercise ?? "exercise"}-${idx}`}>
          {item.exercise ?? "Unknown exercise"} ({formatNumber(item.set_count ?? 0)} sets): {item.flag ?? "Flagged"}
        </li>
      ))}
    </ul>
  );
}

function CoachRecommendations({ items }: { items: string[] }) {
  if (!items.length) {
    return <EmptyState message="No coach recommendations available yet." />;
  }

  return (
    <ol style={{ paddingLeft: 18, display: "grid", gap: 6 }}>
      {items.map((item, idx) => (
        <li key={`${item}-${idx}`}>{item}</li>
      ))}
    </ol>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p style={{ color: "var(--muted)" }}>{message}</p>;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat().format(Math.round(value * 100) / 100);
}

function getNumber(value: string | number | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

const headerWrap: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const dropZone: CSSProperties = {
  border: "2px dashed var(--border)",
  background: "var(--off)",
  borderRadius: 12,
  display: "grid",
  placeItems: "center",
  textAlign: "center",
  gap: 8,
  cursor: "pointer",
  padding: "34px 16px",
};

const metricsGrid: CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
};

const sectionTitle: CSSProperties = { marginBottom: 12, fontSize: 20 };
const thStyle: CSSProperties = { textAlign: "left", borderBottom: "1px solid var(--border)", padding: "8px 6px" };
const tdStyle: CSSProperties = { borderBottom: "1px solid var(--border)", padding: "8px 6px" };
