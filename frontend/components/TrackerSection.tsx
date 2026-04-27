"use client";

import { useMemo, useState } from "react";
import type { CSSProperties } from "react";

type WorkoutRow = {
  date: string;
  exercise: string;
  weight: number;
  reps: number;
  sets: number;
  volume: number;
};

type ParseResult = {
  rows: WorkoutRow[];
  errors: string[];
};

const EXPECTED_COLUMNS = ["date", "exercise", "weight", "reps", "sets"];

export default function TrackerSection() {
  const [rows, setRows] = useState<WorkoutRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [errors, setErrors] = useState<string[]>([]);

  const analytics = useMemo(() => {
    const totalVolume = rows.reduce((sum, row) => sum + row.volume, 0);
    const totalSets = rows.reduce((sum, row) => sum + row.sets, 0);
    const totalReps = rows.reduce((sum, row) => sum + row.reps * row.sets, 0);

    const byExercise = new Map<
      string,
      { volume: number; sets: number; reps: number; heaviestWeight: number; sessions: number }
    >();

    rows.forEach((row) => {
      const current = byExercise.get(row.exercise) ?? {
        volume: 0,
        sets: 0,
        reps: 0,
        heaviestWeight: 0,
        sessions: 0,
      };
      current.volume += row.volume;
      current.sets += row.sets;
      current.reps += row.reps * row.sets;
      current.heaviestWeight = Math.max(current.heaviestWeight, row.weight);
      current.sessions += 1;
      byExercise.set(row.exercise, current);
    });

    const exerciseAnalytics = [...byExercise.entries()]
      .map(([exercise, stats]) => ({ exercise, ...stats }))
      .sort((a, b) => b.volume - a.volume);

    return { totalVolume, totalSets, totalReps, exerciseAnalytics };
  }, [rows]);

  const onCsvUpload = async (file: File | null) => {
    if (!file) return;
    const csvText = await file.text();
    const result = parseWorkoutCsv(csvText);
    setRows(result.rows);
    setErrors(result.errors);
    setFileName(file.name);
  };

  return (
    <section className="section" id="tracker">
      <div className="container">
        <h1 style={{ fontSize: 32, marginBottom: 8 }}>Weightlifting Journal</h1>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>
          Upload your workout CSV and instantly view analytics for volume, total reps, and total sets.
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
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 10 }}>
            Expected columns: <code>{EXPECTED_COLUMNS.join(", ")}</code>
          </p>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
            Example row: <code>2026-04-20,Back Squat,225,5,3</code>
          </p>
          {fileName && <p style={{ marginTop: 10 }}>Loaded: {fileName}</p>}
        </div>

        {errors.length > 0 && (
          <div style={{ ...panel, borderColor: "#ef4444", color: "#b91c1c", padding: 14, marginBottom: 16 }}>
            <strong>CSV issues detected:</strong>
            <ul style={{ marginTop: 8, paddingLeft: 20 }}>
              {errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {rows.length > 0 && (
          <>
            <div style={metricsGrid}>
              <MetricCard label="Total Volume" value={formatNumber(analytics.totalVolume)} />
              <MetricCard label="Total Reps" value={formatNumber(analytics.totalReps)} />
              <MetricCard label="Total Sets" value={formatNumber(analytics.totalSets)} />
            </div>

            <div style={{ ...panel, padding: 14, marginTop: 16 }}>
              <h2 style={{ fontSize: 22, marginBottom: 10 }}>Per-Exercise Analytics</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Exercise</th>
                      <th style={thStyle}>Volume</th>
                      <th style={thStyle}>Reps</th>
                      <th style={thStyle}>Sets</th>
                      <th style={thStyle}>Heaviest Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.exerciseAnalytics.map((item) => (
                      <tr key={item.exercise}>
                        <td style={tdStyle}>{item.exercise}</td>
                        <td style={tdStyle}>{formatNumber(item.volume)}</td>
                        <td style={tdStyle}>{formatNumber(item.reps)}</td>
                        <td style={tdStyle}>{formatNumber(item.sets)}</td>
                        <td style={tdStyle}>{formatNumber(item.heaviestWeight)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
    <div style={{ ...panel, padding: 14 }}>
      <div style={{ color: "var(--muted)", fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function parseWorkoutCsv(csvText: string): ParseResult {
  const rows = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCsvLine);

  if (rows.length === 0) {
    return { rows: [], errors: ["The CSV is empty."] };
  }

  const header = rows[0].map((cell) => normalizeHeader(cell));
  const missing = EXPECTED_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    return { rows: [], errors: [`Missing required columns: ${missing.join(", ")}.`] };
  }

  const getIndex = (column: string) => header.indexOf(column);
  const data: WorkoutRow[] = [];
  const errors: string[] = [];

  rows.slice(1).forEach((line, idx) => {
    const lineNumber = idx + 2;
    const date = (line[getIndex("date")] ?? "").trim();
    const exercise = (line[getIndex("exercise")] ?? "").trim();
    const weight = Number(line[getIndex("weight")] ?? NaN);
    const reps = Number(line[getIndex("reps")] ?? NaN);
    const sets = Number(line[getIndex("sets")] ?? NaN);

    if (!date || !exercise) {
      errors.push(`Line ${lineNumber}: date and exercise are required.`);
      return;
    }

    if ([weight, reps, sets].some((num) => !Number.isFinite(num) || num <= 0)) {
      errors.push(`Line ${lineNumber}: weight, reps, and sets must be positive numbers.`);
      return;
    }

    data.push({
      date,
      exercise,
      weight,
      reps,
      sets,
      volume: weight * reps * sets,
    });
  });

  return { rows: data, errors };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const nextChar = line[i + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      out.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  out.push(current.trim());
  return out;
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, "_");
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(Math.round(value * 100) / 100);
}

const panel: CSSProperties = { border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)" };
const metricsGrid: CSSProperties = { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" };
const tableStyle: CSSProperties = { width: "100%", borderCollapse: "collapse", minWidth: 650 };
const thStyle: CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid var(--border)",
  padding: "10px 8px",
  color: "var(--muted)",
  fontSize: 13,
};
const tdStyle: CSSProperties = { borderBottom: "1px solid var(--border)", padding: "10px 8px", fontSize: 14 };
