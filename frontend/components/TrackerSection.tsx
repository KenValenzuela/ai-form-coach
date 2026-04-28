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

type HypertrophyBalanceData = NonNullable<WorkoutChartsPayload["analytics"]>["hypertrophy_balance"];
type RecoveryData = NonNullable<WorkoutChartsPayload["analytics"]>["recovery"];

type Phase = "upload" | "loading" | "report";

type RadarDatum = {
  axis: string;
  value: number;
  normalized: number;
};

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

  const radarMetrics = useMemo(() => buildReadinessRadar(data), [data]);

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
        throw new Error(
          payload && "detail" in payload
            ? String((payload as Record<string, unknown>).detail)
            : payload && "message" in payload
              ? String((payload as Record<string, unknown>).message)
              : `Workout analytics failed with status ${resp.status}`,
        );
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
              Upload your workout CSV for a strength-coach style report with performance, readiness, and programming balance signals.
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

            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
              <div className="card" style={{ padding: 18 }}>
                <h2 style={sectionTitle}>Athlete Readiness Radar</h2>
                <p style={chartSubtitle}>Coach blend of volume consistency, intensity, recovery quality, and muscle balance.</p>
                <ReadinessRadarChart metrics={radarMetrics} />
              </div>

              <div className="card" style={{ padding: 18 }}>
                <h2 style={sectionTitle}>RPE Distribution</h2>
                <p style={chartSubtitle}>Target most sets in RPE 6–8, reserve RPE 9–10 for planned peak work.</p>
                <RpeDonutChart rpeDist={data?.charts?.rpe_dist ?? {}} />
              </div>
            </div>

            <div className="card" style={{ padding: 18 }}>
              <h2 style={sectionTitle}>Weekly Volume Trend</h2>
              <p style={chartSubtitle}>Smoothed trendline helps identify spikes that raise fatigue risk and injury exposure.</p>
              <WeeklyVolumeChart points={data?.charts?.weekly_volume ?? []} />
            </div>

            <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
              <div className="card" style={{ padding: 18 }}>
                <h2 style={sectionTitle}>Estimated 1RM Progress Curves</h2>
                <E1rmTrendChart trend={data?.charts?.e1rm_trend ?? {}} />
              </div>

              <div className="card" style={{ padding: 18 }}>
                <h2 style={sectionTitle}>Muscle Group Volume Heatmap</h2>
                <MuscleTrendHeatmap trend={data?.charts?.muscle_trend ?? {}} />
              </div>
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

function ReadinessRadarChart({ metrics }: { metrics: RadarDatum[] }) {
  if (!metrics.length) {
    return <EmptyState message="Not enough data to render readiness radar." />;
  }

  const size = 300;
  const center = size / 2;
  const radius = 110;
  const rings = [0.25, 0.5, 0.75, 1];

  const points = metrics.map((metric, index) => {
    const angle = (Math.PI * 2 * index) / metrics.length - Math.PI / 2;
    return {
      ...metric,
      axisX: center + Math.cos(angle) * radius,
      axisY: center + Math.sin(angle) * radius,
      valueX: center + Math.cos(angle) * radius * metric.normalized,
      valueY: center + Math.sin(angle) * radius * metric.normalized,
      labelX: center + Math.cos(angle) * (radius + 24),
      labelY: center + Math.sin(angle) * (radius + 24),
    };
  });

  const polygonPoints = points.map((p) => `${p.valueX},${p.valueY}`).join(" ");

  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 12 }}>
      <svg width={size} height={size} role="img" aria-label="Athlete readiness radar chart">
        {rings.map((ring) => (
          <circle
            key={ring}
            cx={center}
            cy={center}
            r={radius * ring}
            fill="none"
            stroke="rgba(168, 85, 247, 0.25)"
            strokeDasharray="4 6"
          />
        ))}

        {points.map((point) => (
          <line key={`axis-${point.axis}`} x1={center} y1={center} x2={point.axisX} y2={point.axisY} stroke="rgba(200, 200, 220, 0.35)" />
        ))}

        <polygon points={polygonPoints} fill="rgba(168, 85, 247, 0.28)" stroke="var(--lav)" strokeWidth={2} />

        {points.map((point) => (
          <circle key={`value-${point.axis}`} cx={point.valueX} cy={point.valueY} r={4} fill="var(--lav)" />
        ))}

        {points.map((point) => (
          <text
            key={`label-${point.axis}`}
            x={point.labelX}
            y={point.labelY}
            textAnchor="middle"
            alignmentBaseline="middle"
            fill="var(--text)"
            fontSize="11"
          >
            {point.axis}
          </text>
        ))}
      </svg>

      <div style={{ display: "grid", gap: 6, width: "100%" }}>
        {points.map((point) => (
          <div key={`legend-${point.axis}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
            <span style={{ color: "var(--muted)" }}>{point.axis}</span>
            <strong>{formatNumber(point.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function WeeklyVolumeChart({ points }: { points: number[] }) {
  if (!points.length) {
    return <EmptyState message="No weekly volume data available yet." />;
  }

  const maxPoint = Math.max(...points, 1);
  const pathD = points
    .map((point, idx) => {
      const x = (idx / Math.max(points.length - 1, 1)) * 100;
      const y = 100 - (point / maxPoint) * 100;
      return `${idx === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <svg viewBox="0 0 100 100" width="100%" height="220" preserveAspectRatio="none" role="img" aria-label="Weekly volume trend chart">
        <defs>
          <linearGradient id="volume-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(168, 85, 247, 0.45)" />
            <stop offset="100%" stopColor="rgba(168, 85, 247, 0.06)" />
          </linearGradient>
        </defs>
        {[20, 40, 60, 80].map((row) => (
          <line key={row} x1="0" y1={row} x2="100" y2={row} stroke="rgba(200, 200, 220, 0.2)" />
        ))}
        <path d={`${pathD} L100,100 L0,100 Z`} fill="url(#volume-fill)" />
        <path d={pathD} fill="none" stroke="var(--lav)" strokeWidth={2.2} />
      </svg>

      <div style={{ display: "grid", gridTemplateColumns: `repeat(${points.length}, minmax(40px, 1fr))`, gap: 8 }}>
        {points.map((point, idx) => (
          <div key={`${point}-${idx}`} style={{ fontSize: 12, textAlign: "center", color: "var(--muted)" }}>
            <div>W{idx + 1}</div>
            <div style={{ color: "var(--text)", fontWeight: 600 }}>{formatNumber(point)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RpeDonutChart({ rpeDist }: { rpeDist: Record<string, number> }) {
  const entries = Object.entries(rpeDist).filter(([, count]) => count > 0);
  if (!entries.length) {
    return <EmptyState message="No RPE distribution data available yet." />;
  }

  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  let running = 0;

  return (
    <div style={{ display: "grid", gap: 12, justifyItems: "center" }}>
      <svg width="220" height="220" viewBox="0 0 42 42" role="img" aria-label="RPE distribution donut chart">
        <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="rgba(200, 200, 220, 0.15)" strokeWidth="7" />
        {entries.map(([rpe, count], index) => {
          const pct = (count / total) * 100;
          const dashArray = `${pct} ${100 - pct}`;
          const segment = (
            <circle
              key={rpe}
              cx="21"
              cy="21"
              r="15.915"
              fill="transparent"
              stroke={chartPalette[index % chartPalette.length]}
              strokeWidth="7"
              strokeDasharray={dashArray}
              strokeDashoffset={-running}
            />
          );
          running += pct;
          return segment;
        })}
        <text x="21" y="20" textAnchor="middle" fill="var(--text)" fontSize="3.8" fontWeight="700">
          {formatNumber(total)}
        </text>
        <text x="21" y="24" textAnchor="middle" fill="var(--muted)" fontSize="2.8">
          total sets
        </text>
      </svg>

      <div style={{ display: "grid", gap: 6, width: "100%" }}>
        {entries.map(([rpe, count], index) => {
          const pct = (count / total) * 100;
          return (
            <div key={rpe} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 999, background: chartPalette[index % chartPalette.length] }} />
                RPE {rpe}
              </span>
              <span style={{ color: "var(--muted)" }}>
                {formatNumber(count)} sets ({formatNumber(pct)}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function E1rmTrendChart({ trend }: { trend: Record<string, number[]> }) {
  const entries = Object.entries(trend).filter(([, points]) => points.length > 0).slice(0, 5);
  if (!entries.length) {
    return <EmptyState message="No estimated 1RM trend data available yet." />;
  }

  const allValues = entries.flatMap(([, values]) => values);
  const maxValue = Math.max(...allValues, 1);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <svg viewBox="0 0 100 100" width="100%" height="230" preserveAspectRatio="none" role="img" aria-label="Estimated 1RM trend chart">
        {[20, 40, 60, 80].map((row) => (
          <line key={row} x1="0" y1={row} x2="100" y2={row} stroke="rgba(200, 200, 220, 0.2)" />
        ))}

        {entries.map(([exercise, points], index) => {
          const path = points
            .map((point, pointIndex) => {
              const x = (pointIndex / Math.max(points.length - 1, 1)) * 100;
              const y = 100 - (point / maxValue) * 100;
              return `${pointIndex === 0 ? "M" : "L"}${x},${y}`;
            })
            .join(" ");

          return <path key={exercise} d={path} fill="none" stroke={chartPalette[index % chartPalette.length]} strokeWidth={2.1} />;
        })}
      </svg>

      <div style={{ display: "grid", gap: 6 }}>
        {entries.map(([exercise, points], index) => (
          <div key={exercise} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, gap: 10 }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: chartPalette[index % chartPalette.length] }} />
              {exercise}
            </span>
            <span style={{ color: "var(--muted)" }}>
              {formatNumber(points[0] ?? 0)} → {formatNumber(points[points.length - 1] ?? 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MuscleTrendHeatmap({ trend }: { trend: Record<string, number[]> }) {
  const entries = Object.entries(trend).filter(([, points]) => points.length > 0);
  if (!entries.length) {
    return <EmptyState message="No muscle trend data available yet." />;
  }

  const maxCell = Math.max(...entries.flatMap(([, points]) => points), 1);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {entries.map(([muscle, points]) => (
        <div key={muscle} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--muted)", textTransform: "capitalize" }}>{muscle}</span>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${points.length}, minmax(18px, 1fr))`, gap: 4 }}>
            {points.map((point, index) => {
              const intensity = Math.max(point / maxCell, 0.08);
              return (
                <div
                  key={`${muscle}-${index}`}
                  title={`Week ${index + 1}: ${formatNumber(point)} sets`}
                  style={{
                    height: 18,
                    borderRadius: 4,
                    background: `rgba(168, 85, 247, ${intensity.toFixed(2)})`,
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                />
              );
            })}
          </div>
        </div>
      ))}
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
              <th key={h} style={thStyle}>
                {h}
              </th>
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

function HypertrophyBalance({ analytics }: { analytics: HypertrophyBalanceData | undefined }) {
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
          {undertrained.length > 0 && (
            <p>
              <strong>Undertrained:</strong> {undertrained.join(", ")}
            </p>
          )}
          {overloaded.length > 0 && (
            <p>
              <strong>Overloaded:</strong> {overloaded.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function RecoveryPanel({ recovery }: { recovery: RecoveryData | undefined }) {
  if (!recovery) {
    return <EmptyState message="No recovery profile data available yet." />;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <p>
        <strong>Fatigue risk:</strong> {(recovery.fatigue_risk ?? "unknown").toUpperCase()}
      </p>
      <p>
        <strong>RPE quality:</strong> {formatNumber(recovery.rpe_quality_score ?? 0)}
      </p>
      <p>
        <strong>High effort frequency:</strong> {formatNumber(recovery.high_effort_frequency ?? 0)}
      </p>
      <p>
        <strong>Consecutive training days:</strong> {formatNumber(recovery.consecutive_training_days ?? 0)}
      </p>
      <p>
        <strong>Deload needed:</strong> {recovery.deload_needed ? "Yes" : "No"}
      </p>
      {(recovery.volume_spike_weeks ?? []).length > 0 && (
        <p>
          <strong>Volume spike weeks:</strong> {(recovery.volume_spike_weeks ?? []).join(", ")}
        </p>
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

function buildReadinessRadar(data: WorkoutChartsPayload | null): RadarDatum[] {
  const weekly = data?.charts?.weekly_volume ?? [];
  const weeklyMean = average(weekly);
  const weeklyStd = stdDev(weekly);
  const consistency = clamp01(weeklyMean > 0 ? 1 - weeklyStd / weeklyMean : 0);

  const avgRpe = getNumber(data?.summary?.average_rpe);
  const intensityControl = clamp01(1 - Math.abs(avgRpe - 7.5) / 4.5);

  const recoveryScore = getNumber(data?.analytics?.recovery?.rpe_quality_score ?? 0) / 10;
  const fatiguePenalty = (data?.analytics?.recovery?.fatigue_risk ?? "").toLowerCase() === "high" ? 0.35 : 0;
  const deloadPenalty = data?.analytics?.recovery?.deload_needed ? 0.15 : 0;
  const readiness = clamp01(recoveryScore - fatiguePenalty - deloadPenalty);

  const balance = hypertrophyBalanceScore(data?.analytics?.hypertrophy_balance?.sets_by_muscle ?? {});

  const progression = e1rmProgressScore(data?.charts?.e1rm_trend ?? {});

  const metrics = [
    { axis: "Consistency", normalized: consistency, value: consistency * 100 },
    { axis: "Intensity", normalized: intensityControl, value: intensityControl * 100 },
    { axis: "Recovery", normalized: readiness, value: readiness * 100 },
    { axis: "Muscle Balance", normalized: balance, value: balance * 100 },
    { axis: "Strength Trend", normalized: progression, value: progression * 100 },
  ];

  return metrics;
}

function hypertrophyBalanceScore(setsByMuscle: Record<string, number>): number {
  const values = Object.values(setsByMuscle);
  if (!values.length) return 0;
  const avgSets = average(values);
  if (avgSets <= 0) return 0;
  const variance = values.reduce((acc, value) => acc + (value - avgSets) ** 2, 0) / values.length;
  const cv = Math.sqrt(variance) / avgSets;
  return clamp01(1 - cv);
}

function e1rmProgressScore(e1rmTrend: Record<string, number[]>): number {
  const growth = Object.values(e1rmTrend)
    .filter((points) => points.length >= 2 && points[0] > 0)
    .map((points) => (points[points.length - 1] - points[0]) / points[0]);

  if (!growth.length) return 0;
  return clamp01(average(growth) / 0.12);
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (!values.length) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat().format(Math.round(value * 100) / 100);
}

function getNumber(value: string | number | undefined | null): number {
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

const chartPalette = ["#a855f7", "#38bdf8", "#22c55e", "#f59e0b", "#fb7185", "#14b8a6"];
const sectionTitle: CSSProperties = { marginBottom: 8, fontSize: 20 };
const chartSubtitle: CSSProperties = { marginBottom: 12, color: "var(--muted)", fontSize: 13 };
const thStyle: CSSProperties = { textAlign: "left", borderBottom: "1px solid var(--border)", padding: "8px 6px" };
const tdStyle: CSSProperties = { borderBottom: "1px solid var(--border)", padding: "8px 6px" };
