"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import CoachBubble from "./CoachBubble";
import {
  EXERCISES,
  backendIssuesToCoachMsgs,
  repMetricsToOverview,
  type AnalyzeResponse,
  type BackendIssue,
  type BackendRepResult,
} from "@/lib/data";

type Phase = "upload" | "analyzing" | "results";
type Tab = "coach" | "overview" | "issues" | "video";
type CameraView = "side" | "front";

const PROGRESS_STEPS = [
  "Uploading video...",
  "Detecting body keypoints...",
  "Calculating joint angles...",
  "Comparing to biomechanical benchmarks...",
  "Generating coach feedback...",
];

const MAX_FILE_SIZE_MB = 500;
const SUPPORTED_TYPES = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"];

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const LAST_ANALYSIS_KEY = "align:last-analysis";

function aggregateIssues(results: BackendRepResult[]): BackendIssue[] {
  const seen = new Set<string>();
  const deduped: BackendIssue[] = [];
  for (const rep of results) {
    for (const issue of rep.issues) {
      if (!seen.has(issue.label)) {
        seen.add(issue.label);
        deduped.push(issue);
      }
    }
  }
  return deduped;
}

function calcScore(issues: BackendIssue[]): number {
  const deductions = issues.reduce((total, issue) => {
    if (issue.severity === "high") return total + 30;
    if (issue.severity === "medium") return total + 20;
    return total + 10;
  }, 0);
  return Math.max(0, 100 - deductions);
}

function getExerciseType(exercise: string): string {
  const lowered = exercise.toLowerCase();
  if (lowered.includes("squat")) return "squat";
  if (lowered.includes("deadlift")) return "deadlift";
  if (lowered.includes("bench")) return "bench_press";
  return "general";
}

function getFileValidationError(file: File): string | null {
  const sizeMb = file.size / 1024 / 1024;
  if (sizeMb > MAX_FILE_SIZE_MB) return `Video is ${sizeMb.toFixed(1)} MB. Max is ${MAX_FILE_SIZE_MB} MB.`;
  if (file.type && !SUPPORTED_TYPES.includes(file.type)) {
    return "Unsupported format. Use MP4, MOV, AVI, or WebM.";
  }
  return null;
}

export default function AnalyzeSection() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [tab, setTab] = useState<Tab>("video");
  const [drag, setDrag] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [exercise, setExercise] = useState("Back Squat");
  const [cameraView, setCameraView] = useState<CameraView>("side");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [sourceVideoUrl, setSourceVideoUrl] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [apiResult, setApiResult] = useState<AnalyzeResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const estimatedDuration = useMemo(() => {
    if (!file) return "~30 sec";
    const seconds = Math.max(15, Math.round((file.size / (1024 * 1024)) * 1.6));
    return seconds > 59 ? `~${Math.round(seconds / 60)} min` : `~${seconds} sec`;
  }, [file]);

  const readinessChecks = [
    { label: "Video uploaded", met: Boolean(file) },
    { label: "Camera angle selected", met: Boolean(cameraView) },
    { label: "Exercise selected", met: Boolean(exercise) },
    { label: "Consent acknowledged", met: consentChecked },
  ];

  const handleFile = (candidate: File) => {
    const validationError = getFileValidationError(candidate);
    if (validationError) {
      setApiError(validationError);
      return;
    }
    setApiError(null);
    setFile(candidate);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, []);

  const runAnalysis = async () => {
    if (!file || !consentChecked) return;
    setPhase("analyzing");
    setStep(0);
    setApiError(null);

    let i = 0;
    const iv = setInterval(() => {
      i++;
      setStep(i);
      if (i >= PROGRESS_STEPS.length - 1) clearInterval(iv);
    }, 450);

    try {
      const formData = new FormData();
      formData.append("video", file);
      formData.append("exercise_type", getExerciseType(exercise));
      formData.append("camera_view", cameraView);

      const resp = await fetch(`${API_URL}/api/analyze`, {
        method: "POST",
        body: formData,
      });

      clearInterval(iv);

      if (!resp.ok) throw new Error(await resp.text());

      const data: AnalyzeResponse = await resp.json();
      setApiResult(data);
      setPhase("results");
      setTab("video");
      localStorage.setItem(
        LAST_ANALYSIS_KEY,
        JSON.stringify({
          savedAt: new Date().toISOString(),
          exercise,
          result: data,
        })
      );
    } catch (err) {
      clearInterval(iv);
      setApiError(
        err instanceof Error
          ? err.message
          : "Analysis failed. Make sure the backend is running."
      );
      setPhase("upload");
    }
  };

  const reset = () => {
    setPhase("upload");
    setFile(null);
    setWeight("");
    setNotes("");
    setConsentChecked(false);
    setStep(0);
    setApiResult(null);
    setApiError(null);
    localStorage.removeItem(LAST_ANALYSIS_KEY);
  };

  useEffect(() => {
    const raw = localStorage.getItem(LAST_ANALYSIS_KEY);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as { exercise?: string; result?: AnalyzeResponse };
      if (!parsed?.result) return;
      setApiResult(parsed.result);
      setExercise(parsed.exercise ?? "Back Squat");
      setPhase("results");
      setTab("video");
    } catch {
      localStorage.removeItem(LAST_ANALYSIS_KEY);
    }
  }, []);

  useEffect(() => {
    if (!file) {
      setSourceVideoUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setSourceVideoUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <section className="section" id="analyze">
      <div className="container">
        <div style={{ marginBottom: 28 }}>
          <span className="label">Step 1</span>
          <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>
            Analyze Your Form
          </h2>
          <p style={{ color: "var(--muted)", marginTop: 6, fontSize: 15 }}>
            Upload your own demo video and get actionable coaching feedback in {estimatedDuration}
          </p>
        </div>

        {apiError && (
          <div
            style={{
              background: "oklch(96% .04 25)",
              border: "1px solid oklch(88% .07 25)",
              borderRadius: 10,
              padding: "12px 18px",
              marginBottom: 16,
              fontSize: 14,
              color: "var(--red)",
            }}
          >
            ⚠️ {apiError}
          </div>
        )}

        {phase === "upload" && (
          <UploadPhase
            drag={drag}
            file={file}
            exercise={exercise}
            cameraView={cameraView}
            weight={weight}
            notes={notes}
            consentChecked={consentChecked}
            estimatedDuration={estimatedDuration}
            readinessChecks={readinessChecks}
            fileRef={fileRef}
            setDrag={setDrag}
            setExercise={setExercise}
            setCameraView={setCameraView}
            setWeight={setWeight}
            setNotes={setNotes}
            setConsentChecked={setConsentChecked}
            onDrop={onDrop}
            handleFile={handleFile}
            runAnalysis={runAnalysis}
            clearFile={() => setFile(null)}
          />
        )}

        {phase === "analyzing" && <AnalyzingPhase step={step} />}

        {phase === "results" && (
          <ResultsPhase
            tab={tab}
            setTab={setTab}
            exercise={exercise}
            reset={reset}
            apiResult={apiResult}
            sourceVideoUrl={sourceVideoUrl}
          />
        )}
      </div>
    </section>
  );
}

/* ── Upload Phase ── */
interface UploadPhaseProps {
  drag: boolean;
  file: File | null;
  exercise: string;
  cameraView: CameraView;
  weight: string;
  notes: string;
  consentChecked: boolean;
  estimatedDuration: string;
  readinessChecks: { label: string; met: boolean }[];
  fileRef: React.RefObject<HTMLInputElement | null>;
  setDrag: (v: boolean) => void;
  setExercise: (v: string) => void;
  setCameraView: (v: CameraView) => void;
  setWeight: (v: string) => void;
  setNotes: (v: string) => void;
  setConsentChecked: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  handleFile: (f: File) => void;
  runAnalysis: () => void;
  clearFile: () => void;
}

function UploadPhase({
  drag, file, exercise, cameraView, weight, notes, consentChecked, estimatedDuration, readinessChecks, fileRef,
  setDrag, setExercise, setCameraView, setWeight, setNotes, setConsentChecked, onDrop, handleFile, runAnalysis, clearFile,
}: UploadPhaseProps) {
  const canAnalyze = Boolean(file) && consentChecked;

  return (
    <div className="card upload-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          padding: "40px 32px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          background: drag ? "var(--lav-d)" : file ? "oklch(96% .05 145 / .3)" : "transparent",
          border: `2px dashed ${drag ? "var(--lav)" : file ? "var(--green)" : "var(--border)"}`,
          borderRadius: "var(--r) 0 0 var(--r)",
          transition: "all .2s",
          textAlign: "center",
          gap: 14,
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="video/*"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {file ? (
          <>
            <div style={{ fontSize: 40 }}>✅</div>
            <div style={{ fontWeight: 600, color: "var(--green)", maxWidth: 280, wordBreak: "break-word" }}>{file.name}</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>
              {(file.size / 1024 / 1024).toFixed(1)} MB · Estimated processing {estimatedDuration}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-ghost" type="button">Replace</button>
              <button className="btn-ghost" type="button" onClick={(e) => { e.stopPropagation(); clearFile(); }}>Remove</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 44, opacity: 0.5 }}>🎬</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Drop your demo video here</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
              MP4, MOV, AVI, WebM up to {MAX_FILE_SIZE_MB} MB<br />
              Keep full body in frame from the selected camera angle
            </div>
            <button className="btn-ghost" style={{ marginTop: 4 }} type="button">Browse Files</button>
          </>
        )}
      </div>

      <div style={{ padding: "30px 32px", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="label">Exercise</label>
            <select value={exercise} onChange={(e) => setExercise(e.target.value)}>
              {EXERCISES.map((ex) => <option key={ex}>{ex}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Camera View</label>
            <select value={cameraView} onChange={(e) => setCameraView(e.target.value as CameraView)}>
              <option value="side">Side (recommended)</option>
              <option value="front">Front</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Weight (lbs)</label>
          <input type="number" placeholder="e.g. 135" value={weight} onChange={(e) => setWeight(e.target.value)} min={0} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="label">Session Notes (optional)</label>
          <textarea
            placeholder="e.g. hips felt tight, worked up to top single"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{
              background: "var(--off)", border: "1.5px solid var(--border)", borderRadius: 8,
              padding: "8px 12px", fontSize: 14, color: "var(--navy)", outline: "none",
              width: "100%", resize: "vertical", minHeight: 72,
              fontFamily: "DM Sans, sans-serif", transition: "border-color .15s",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--lav)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
          />
        </div>

        <div style={{ background: "var(--off)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 12px" }}>
          <div className="label" style={{ marginBottom: 6 }}>Readiness Checklist</div>
          <div style={{ display: "grid", gap: 4 }}>
            {readinessChecks.map((check) => (
              <div key={check.label} style={{ fontSize: 12, color: check.met ? "var(--green)" : "var(--muted)" }}>
                {check.met ? "✓" : "○"} {check.label}
              </div>
            ))}
          </div>
        </div>

        <label style={{ fontSize: 12, display: "flex", gap: 8, alignItems: "flex-start", color: "var(--muted)" }}>
          <input
            type="checkbox"
            checked={consentChecked}
            onChange={(e) => setConsentChecked(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          I confirm this is my own video and I want to process it for this demo analysis.
        </label>

        <div>
          <button
            className="btn-primary"
            style={{ width: "100%", padding: "13px", fontSize: 15 }}
            disabled={!canAnalyze}
            onClick={runAnalysis}
          >
            {canAnalyze ? "Analyze My Form →" : "Add video + confirm consent to continue"}
          </button>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>
            Processed for this session only. Upload quality directly impacts coaching accuracy.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── Analyzing Phase ── */
function AnalyzingPhase({ step }: { step: number }) {
  return (
    <div className="card" style={{ padding: "40px 32px", animation: "fadeUp .3s ease both" }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", letterSpacing: ".06em", textTransform: "uppercase" }}>Analyzing</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>{PROGRESS_STEPS[step]}</div>
      </div>
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <div style={{ aspectRatio: "16/9", background: "var(--navy)", borderRadius: 12, overflow: "hidden", position: "relative" }}>
          <div style={{ position: "absolute", width: "100%", height: 3, background: "linear-gradient(90deg,transparent,var(--lav),transparent)", animation: "scanline 2s linear infinite", opacity: 0.8 }} />
          <svg viewBox="0 0 300 200" style={{ width: "100%", height: "100%", opacity: 0.7 }}>
            {[
              ["M150 55 L150 100", "a"], ["M150 100 L120 150", "b"], ["M150 100 L180 150", "c"],
              ["M120 150 L115 190", "d"], ["M180 150 L185 190", "e"],
              ["M150 70 L115 90", "f"], ["M150 70 L185 90", "g"],
              ["M115 90 L105 120", "h"], ["M185 90 L195 120", "i"],
            ].map(([d, k]) => (
              <path key={k} d={d} stroke="var(--lav)" strokeWidth="2" fill="none" strokeDasharray="500"
                style={{ animation: "dash 1.5s ease-in-out infinite alternate" }} />
            ))}
            {[[150, 48], [150, 100], [120, 150], [180, 150]].map(([cx, cy], i) => (
              <circle key={i} cx={cx} cy={cy} r={5} fill="var(--lav-l)"
                style={{ animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite` }} />
            ))}
          </svg>
        </div>
        <div style={{ marginTop: 20, height: 4, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", background: "var(--lav)", borderRadius: 4, width: `${((step + 1) / PROGRESS_STEPS.length) * 100}%`, transition: "width .8s ease" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 20 }}>
          {PROGRESS_STEPS.map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <div style={{
                width: 20, height: 20, borderRadius: "50%", flexShrink: 0, display: "flex",
                alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700,
                background: i <= step ? "var(--lav)" : "var(--border)",
                color: i <= step ? "#fff" : "var(--muted)",
                transition: "background .3s",
              }}>{i <= step ? "✓" : i + 1}</div>
              <span style={{ color: i <= step ? "var(--navy)" : "var(--muted)" }}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Results Phase ── */
function ResultsPhase({
  tab, setTab, exercise, reset, apiResult, sourceVideoUrl,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  exercise: string;
  reset: () => void;
  apiResult: AnalyzeResponse | null;
  sourceVideoUrl: string | null;
}) {
  const [showCombinedView, setShowCombinedView] = useState(false);

  useEffect(() => {
    setShowCombinedView(false);
  }, [apiResult?.video_id]);

  if (apiResult?.rep_count === 0) {
    return (
      <div className="card" style={{ padding: "48px 32px", textAlign: "center", animation: "fadeUp .4s ease both" }}>
        <div style={{ fontSize: 48 }}>🔍</div>
        <div style={{ fontWeight: 700, fontSize: 20, marginTop: 12 }}>No Reps Detected</div>
        <p style={{ color: "var(--muted)", marginTop: 8, maxWidth: 380, margin: "8px auto 0" }}>
          Make sure you&apos;re filmed from the side with your full body visible throughout the movement.
        </p>
        <button className="btn-primary" style={{ marginTop: 24 }} onClick={reset}>Try Again</button>
      </div>
    );
  }

  const allIssues = aggregateIssues(apiResult?.results ?? []);
  const SCORE = calcScore(allIssues);
  const scoreColor = SCORE >= 80 ? "var(--green)" : SCORE >= 60 ? "var(--amber)" : "var(--red)";

  return (
    <div style={{ animation: "fadeUp .4s ease both" }}>
      <div className="card results-score-row" style={{ padding: "20px 28px", display: "flex", alignItems: "center", gap: 20, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1 }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", flexShrink: 0, background: `conic-gradient(${scoreColor} 0% ${SCORE}%, var(--border) ${SCORE}% 100%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 46, height: 46, borderRadius: "50%", background: "var(--card)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 16, color: scoreColor }}>
              {SCORE}
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Form Score: {SCORE}/100</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
              {exercise} · {apiResult?.rep_count ?? 0} rep{(apiResult?.rep_count ?? 0) !== 1 ? "s" : ""} · {allIssues.length} issue{allIssues.length !== 1 ? "s" : ""} detected
            </div>
          </div>
        </div>
        <div className="results-score-actions" style={{ display: "flex", gap: 10, marginLeft: "auto" }}>
          <button className="btn-ghost" style={{ fontSize: 13 }}>Export PDF</button>
          <button className="btn-ghost" style={{ fontSize: 13 }}>Save to History</button>
          <button className="btn-primary" style={{ fontSize: 13 }} onClick={reset}>New Analysis</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {([["coach", "🤖 AI Coach"], ["overview", "📊 Overview"], ["issues", "⚠️ Issues"], ["video", "🎬 Video"]] as [Tab, string][]).map(
            ([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  padding: "8px 18px", borderRadius: 8,
                  border: tab === t ? "none" : "1px solid var(--border)",
                  cursor: "pointer", fontSize: 13, fontWeight: 600,
                  background: tab === t ? "var(--lav)" : "var(--card)",
                  color: tab === t ? "#fff" : "var(--navy)",
                  transition: "all .15s",
                } as React.CSSProperties}
              >
                {label}
              </button>
            )
          )}
      </div>

      {tab === "coach" && <CoachTab allIssues={allIssues} />}
      {tab === "overview" && <OverviewTab apiResult={apiResult} />}
      {tab === "issues" && <IssuesTab allIssues={allIssues} />}
      {tab === "video" && (
        <VideoTab
          apiResult={apiResult}
          sourceVideoUrl={sourceVideoUrl}
          onVideoEnded={() => setShowCombinedView(true)}
          showCombinedView={showCombinedView}
          allIssues={allIssues}
        />
      )}
    </div>
  );
}

/* ── Coach Tab ── */
function CoachTab({ allIssues }: { allIssues: BackendIssue[] }) {
  const coachMsgs = backendIssuesToCoachMsgs(allIssues);
  const msgs = coachMsgs.length > 0
    ? coachMsgs
    : [{ id: 0, sev: "good" as const, icon: "✅", title: "Great Form!",
        msg: "No major issues detected in your squat. Your form is looking solid — keep recording to track consistency over time.",
        cue: "Film from different angles occasionally to get a full picture.", drill: null }];

  const [activeId, setActiveId] = useState(0);
  const active = msgs[activeId] ?? msgs[0];

  return (
    <div className="card" style={{ display: "flex", height: 520, overflow: "hidden" }}>
      <div style={{ width: 220, flexShrink: 0, borderRight: "1px solid var(--border)", overflowY: "auto", padding: "12px 8px" }}>
        {msgs.map((m, i) => {
          const tagClass = { critical: "tag-red", warning: "tag-amber", good: "tag-green", tip: "tag-lav" }[m.sev];
          return (
            <button key={m.id} onClick={() => setActiveId(i)} style={{ width: "100%", textAlign: "left", background: activeId === i ? "var(--lav-d)" : "none", border: "none", borderRadius: 8, padding: "10px 12px", cursor: "pointer", transition: "background .15s", marginBottom: 2, borderLeft: activeId === i ? "3px solid var(--lav)" : "3px solid transparent" }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--navy)" }}>{m.icon} {m.title}</div>
              <span className={`tag ${tagClass}`} style={{ marginTop: 5, display: "inline-block" }}>{m.sev}</span>
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
        <div className="coach-tabs" style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          {msgs.map((m, i) => {
            const tagClass = { critical: "tag-red", warning: "tag-amber", good: "tag-green", tip: "tag-lav" }[m.sev];
            return (
              <button key={m.id} onClick={() => setActiveId(i)} className={`tag ${tagClass}`}
                style={{ cursor: "pointer", border: activeId === i ? "2px solid currentColor" : undefined, fontSize: 12, padding: "4px 12px" }}>
                {m.icon} {m.title}
              </button>
            );
          })}
        </div>
        <CoachBubble key={activeId} msg={active} />
      </div>
    </div>
  );
}

/* ── Overview Tab ── */
function OverviewTab({ apiResult }: { apiResult: AnalyzeResponse | null }) {
  const firstRep = apiResult?.results[0];
  if (!firstRep) return (
    <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--muted)" }}>No metrics available</div>
  );

  const metrics = repMetricsToOverview(firstRep.metrics);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card overview-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, overflow: "hidden" }}>
        {metrics.map((m) => {
          const tagClass = ({ critical: "tag-red", warning: "tag-amber", good: "tag-green", tip: "tag-lav" } as Record<string, string>)[m.sev] ?? "tag-lav";
          return (
            <div key={m.label} style={{ padding: "20px 24px", borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
              <div className="label" style={{ marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700 }}>{m.val}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <span style={{ fontSize: 11, color: "var(--muted)" }}>Limit: {m.limit}</span>
                <span className={`tag ${tagClass}`}>{m.sev}</span>
              </div>
            </div>
          );
        })}
      </div>
      {apiResult && apiResult.results.length > 1 && (
        <div className="card" style={{ padding: "16px 24px" }}>
          <div className="label">Reps Analyzed</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{apiResult.rep_count}</div>
        </div>
      )}
    </div>
  );
}

/* ── Issues Tab ── */
function IssuesTab({ allIssues }: { allIssues: BackendIssue[] }) {
  const coachMsgs = backendIssuesToCoachMsgs(allIssues);
  const issues = coachMsgs.filter((m) => m.sev === "critical" || m.sev === "warning");
  const goods = coachMsgs.filter((m) => m.sev === "good");

  if (coachMsgs.length === 0) return (
    <div className="card" style={{ padding: "40px", textAlign: "center" }}>
      <div style={{ fontSize: 40 }}>✅</div>
      <div style={{ fontWeight: 600, fontSize: 18, marginTop: 12 }}>No Issues Detected</div>
      <p style={{ color: "var(--muted)", marginTop: 8 }}>Your form looks solid! Keep it up.</p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {issues.length > 0 && (
        <div className="card" style={{ padding: "20px 24px" }}>
          <div className="label" style={{ marginBottom: 12 }}>Issues Found ({issues.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {issues.map((m) => {
              const tagClass = { critical: "tag-red", warning: "tag-amber", good: "tag-green", tip: "tag-lav" }[m.sev];
              return (
                <div key={m.id} style={{ display: "flex", gap: 14, padding: "14px 16px", background: "var(--off)", borderRadius: 10, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 22 }}>{m.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <strong style={{ fontSize: 14 }}>{m.title}</strong>
                      <span className={`tag ${tagClass}`}>{m.sev}</span>
                    </div>
                    <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
                      {m.msg.slice(0, 120)}{m.msg.length > 120 ? "…" : ""}
                    </p>
                    {m.drill && (
                      <div style={{ fontSize: 12, marginTop: 6, color: "var(--lav)", fontWeight: 600 }}>Drill: {m.drill}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {goods.length > 0 && (
        <div className="card" style={{ padding: "20px 24px" }}>
          <div className="label" style={{ marginBottom: 12, color: "var(--green)" }}>What&apos;s Looking Good ({goods.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {goods.map((m) => (
              <div key={m.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 14px", background: "oklch(96% .05 145 / .2)", borderRadius: 8 }}>
                <span>{m.icon}</span>
                <div>
                  <strong style={{ fontSize: 13 }}>{m.title}</strong>
                  <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{m.msg.slice(0, 80)}{m.msg.length > 80 ? "…" : ""}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Video Tab ── */
function VideoTab({
  apiResult,
  sourceVideoUrl,
  onVideoEnded,
  showCombinedView,
  allIssues,
}: {
  apiResult: AnalyzeResponse | null;
  sourceVideoUrl: string | null;
  onVideoEnded: () => void;
  showCombinedView: boolean;
  allIssues: BackendIssue[];
}) {
  type TrackingStatus = "Idle" | "Locked" | "Tracking" | "Lost" | "Complete";

  const reps = apiResult?.results ?? [];
  const [selectedRepIndex, setSelectedRepIndex] = useState(0);
  const [anchorFrame, setAnchorFrame] = useState<number | null>(null);
  const [anchorPoint, setAnchorPoint] = useState<{ x: number; y: number } | null>(null);
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>("Idle");
  const [trackingMessage, setTrackingMessage] = useState<string>("Upload + play video, then click the barbell end cap.");
  const [trackingStats, setTrackingStats] = useState<{ fps: number; confidence: number; trackedFrames: number; lostFrames: number } | null>(null);
  const [trackedPath, setTrackedPath] = useState<Array<{ frame: number; x: number; y: number; confidence: number; visible: boolean }>>([]);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [videoTimeSec, setVideoTimeSec] = useState(0);
  const [showFullPath, setShowFullPath] = useState(true);
  const [overlayRect, setOverlayRect] = useState({ leftPct: 0, topPct: 0, widthPct: 100, heightPct: 100 });

  const videoBoxRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const templatePatchRef = useRef<Float32Array | null>(null);
  const templateSizeRef = useRef<number>(17);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const trackingStartedAtRef = useRef<number>(0);
  const processedFramesRef = useRef<number>(0);
  const lostFramesRef = useRef<number>(0);
  const selectedRep = reps[selectedRepIndex] ?? null;
  const overlayUrl = selectedRep?.overlay_image_url ?? apiResult?.overlay_image_url ?? null;
  const streamUrl = sourceVideoUrl ?? (apiResult?.video_url ? `${API_URL}${apiResult.video_url}` : null);
  const fps = apiResult?.fps ?? 30;
  const repStart = selectedRep?.start_frame ?? 0;
  const repEnd = selectedRep?.end_frame ?? -1;
  const renderPath = trackedPath;

  const pathByFrame = useMemo(() => {
    const m = new Map<number, { x: number; y: number; visible: boolean; confidence: number }>();
    for (const point of renderPath) {
      if (point.x == null || point.y == null) {
        m.set(point.frame, { x: 0, y: 0, visible: false, confidence: point.confidence ?? 0 });
      } else {
        m.set(point.frame, {
          x: point.x,
          y: point.y,
          visible: Boolean(point.visible),
          confidence: point.confidence ?? 1,
        });
      }
    }
    return m;
  }, [renderPath]);

  const activeFrame = Math.max(repStart, Math.min(repEnd, Math.round(videoTimeSec * fps)));
  const currentPoint = pathByFrame.get(activeFrame);
  const marker = currentPoint && currentPoint.visible ? { x: currentPoint.x, y: currentPoint.y } : null;
  const currentFps = trackingStats?.fps ?? null;

  const trailStartFrame = showFullPath ? repStart : Math.max(repStart, activeFrame - 70);
  const trail = [] as { x: number; y: number }[];
  for (let frame = trailStartFrame; frame <= activeFrame; frame += 1) {
    const p = pathByFrame.get(frame);
    if (p && p.visible) trail.push({ x: p.x, y: p.y });
  }

  useEffect(() => {
    setSelectedRepIndex(0);
  }, [apiResult?.video_id]);

  useEffect(() => {
    setAnchorFrame(null);
    setAnchorPoint(null);
    setTrackedPath([]);
    setTrackingStats(null);
    setTrackingStatus("Idle");
    setTrackError(null);
    setVideoTimeSec(0);
    setTrackingMessage("Upload + play video, then click the barbell end cap.");
  }, [selectedRepIndex, apiResult?.video_id]);

  useEffect(() => () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
    }
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    const syncTime = () => setVideoTimeSec(el.currentTime || 0);
    const onSeeked = () => syncTime();
    const onTimeUpdate = () => syncTime();
    syncTime();
    el.addEventListener("seeked", onSeeked);
    el.addEventListener("timeupdate", onTimeUpdate);
    return () => {
      el.removeEventListener("seeked", onSeeked);
      el.removeEventListener("timeupdate", onTimeUpdate);
    };
  }, [streamUrl]);

  const syncOverlayRect = useCallback(() => {
    const container = videoBoxRef.current;
    const videoEl = videoRef.current;
    if (!container || !videoEl) return;
    const containerRect = container.getBoundingClientRect();
    const videoRect = videoEl.getBoundingClientRect();
    if (!containerRect.width || !containerRect.height || !videoRect.width || !videoRect.height) return;
    if (!videoEl.videoWidth || !videoEl.videoHeight) return;

    // object-fit: contain can introduce letterboxing. We want overlay coordinates
    // in the actual rendered video content area, not the full <video> element box.
    const frameAspect = videoEl.videoWidth / videoEl.videoHeight;
    const elementAspect = videoRect.width / videoRect.height;
    const renderedWidth = elementAspect > frameAspect ? videoRect.height * frameAspect : videoRect.width;
    const renderedHeight = elementAspect > frameAspect ? videoRect.height : videoRect.width / frameAspect;
    const renderedLeft = videoRect.left + (videoRect.width - renderedWidth) / 2;
    const renderedTop = videoRect.top + (videoRect.height - renderedHeight) / 2;

    setOverlayRect({
      leftPct: ((renderedLeft - containerRect.left) / containerRect.width) * 100,
      topPct: ((renderedTop - containerRect.top) / containerRect.height) * 100,
      widthPct: (renderedWidth / containerRect.width) * 100,
      heightPct: (renderedHeight / containerRect.height) * 100,
    });
  }, []);

  useEffect(() => {
    syncOverlayRect();
    const onResize = () => syncOverlayRect();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [syncOverlayRect, streamUrl]);

  const toNormalizedPoint = useCallback((clientX: number, clientY: number) => {
    const videoEl = videoRef.current;
    if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return null;
    const videoRect = videoEl.getBoundingClientRect();
    const frameAspect = videoEl.videoWidth / videoEl.videoHeight;
    const elementAspect = videoRect.width / videoRect.height;
    const renderedWidth = elementAspect > frameAspect ? videoRect.height * frameAspect : videoRect.width;
    const renderedHeight = elementAspect > frameAspect ? videoRect.height : videoRect.width / frameAspect;
    const renderedLeft = videoRect.left + (videoRect.width - renderedWidth) / 2;
    const renderedTop = videoRect.top + (videoRect.height - renderedHeight) / 2;
    const x = (clientX - renderedLeft) / renderedWidth;
    const y = (clientY - renderedTop) / renderedHeight;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;

    return { x, y };
  }, []);

  const samplePatch = (gray: Uint8ClampedArray, width: number, height: number, cxPx: number, cyPx: number, half: number) => {
    const size = half * 2 + 1;
    const out = new Float32Array(size * size);
    let idx = 0;
    for (let yOff = -half; yOff <= half; yOff += 1) {
      for (let xOff = -half; xOff <= half; xOff += 1) {
        const x = Math.round(cxPx + xOff);
        const y = Math.round(cyPx + yOff);
        if (x < 0 || y < 0 || x >= width || y >= height) out[idx++] = 0;
        else out[idx++] = gray[y * width + x];
      }
    }
    return out;
  };

  const getBestMatch = (frameGray: Uint8ClampedArray, frameW: number, frameH: number, prev: { x: number; y: number }) => {
    const template = templatePatchRef.current;
    if (!template) return null;
    const half = Math.floor(templateSizeRef.current / 2);
    const cx = Math.round(prev.x * frameW);
    const cy = Math.round(prev.y * frameH);
    const searchRadius = Math.max(12, Math.round(frameW * 0.03));
    let bestScore = Number.POSITIVE_INFINITY;
    let best: { x: number; y: number } | null = null;
    for (let y = cy - searchRadius; y <= cy + searchRadius; y += 2) {
      for (let x = cx - searchRadius; x <= cx + searchRadius; x += 2) {
        const patch = samplePatch(frameGray, frameW, frameH, x, y, half);
        let ssd = 0;
        for (let i = 0; i < patch.length; i += 1) {
          const d = patch[i] - template[i];
          ssd += d * d;
        }
        if (ssd < bestScore) {
          bestScore = ssd;
          best = { x: x / frameW, y: y / frameH };
        }
      }
    }
    const confidence = Math.max(0, 1 - bestScore / (template.length * 6500));
    return best ? { point: best, confidence } : null;
  };

  const trackFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    const lastPoint = lastPointRef.current;
    if (!video || !canvas || !ctx || !lastPoint || video.paused || video.ended) {
      if (video?.ended) {
        setTrackingStatus("Complete");
        setTrackingMessage("Tracking complete for this playback.");
      }
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const gray = new Uint8ClampedArray(canvas.width * canvas.height);
    for (let i = 0, j = 0; i < pixels.length; i += 4, j += 1) {
      gray[j] = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
    }

    const matched = getBestMatch(gray, canvas.width, canvas.height, lastPoint);
    const frame = Math.round(video.currentTime * fps);
    processedFramesRef.current += 1;
    if (matched && matched.confidence > 0.18) {
      lastPointRef.current = matched.point;
      setTrackedPath((prev) => [...prev, { frame, x: matched.point.x, y: matched.point.y, confidence: matched.confidence, visible: true }]);
      setTrackingStatus("Tracking");
      setTrackingMessage("Live tracking active from your selected barbell end cap.");
    } else {
      lostFramesRef.current += 1;
      setTrackedPath((prev) => [...prev, { frame, x: lastPoint.x, y: lastPoint.y, confidence: 0, visible: false }]);
      setTrackingStatus("Lost");
      setTrackingMessage("Marker briefly lost. Keep barbell end cap in view.");
    }

    const elapsed = (performance.now() - trackingStartedAtRef.current) / 1000;
    const fpsNow = elapsed > 0 ? processedFramesRef.current / elapsed : 0;
    const tracked = processedFramesRef.current - lostFramesRef.current;
    const conf = tracked > 0 ? tracked / processedFramesRef.current : 0;
    setTrackingStats({ fps: fpsNow, confidence: conf, trackedFrames: tracked, lostFrames: lostFramesRef.current });

    rafRef.current = requestAnimationFrame(trackFrame);
  }, [fps]);

  const placeAnchorFromClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!selectedRep) return;
    const point = toNormalizedPoint(e.clientX, e.clientY);
    if (!point) {
      setTrackError("Click directly on the visible video frame (not letterbox area).");
      return;
    }
    const { x, y } = point;
    const startFrame = Math.max(repStart, Math.min(repEnd, activeFrame));

    setAnchorPoint({ x, y });
    setAnchorFrame(startFrame);
    setTrackingStatus("Locked");
    setTrackingMessage("Marker locked at barbell end cap. Press play for real-time pathing.");
    setTrackedPath([{ frame: startFrame, x, y, confidence: 1, visible: true }]);
    lastPointRef.current = { x, y };
    processedFramesRef.current = 1;
    lostFramesRef.current = 0;

    const video = videoRef.current;
    const canvas = captureCanvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (video && canvas && ctx && video.videoWidth && video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const gray = new Uint8ClampedArray(canvas.width * canvas.height);
      for (let i = 0, j = 0; i < data.length; i += 4, j += 1) {
        gray[j] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      }
      const half = Math.floor(templateSizeRef.current / 2);
      templatePatchRef.current = samplePatch(gray, canvas.width, canvas.height, Math.round(x * canvas.width), Math.round(y * canvas.height), half);
    }
  };

  const keyFrames = selectedRep
    ? [
        {
          key: "start",
          title: "Descent setup",
          frame: selectedRep.start_frame,
          description: "Start frame where the rep begins and setup posture is established.",
        },
        {
          key: "bottom",
          title: "Bottom depth",
          frame: selectedRep.bottom_frame,
          description: "Bottom position used for depth + posture checks and overlay visualization.",
        },
        {
          key: "end",
          title: "Ascent finish",
          frame: selectedRep.end_frame,
          description: "Final frame where control and rep completion are confirmed.",
        },
      ]
    : [];

  return (
    <div className="card" style={{ padding: "32px", textAlign: "center" }}>
      {streamUrl || overlayUrl ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {streamUrl && (
            <div style={{ textAlign: "left", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", background: "var(--navy)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: "1px solid var(--border)", background: "var(--card)" }}>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  Real-time barbell end-cap tracker (client-side, no proxy path label)
                </div>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted)" }}>
                  <input type="checkbox" checked={showFullPath} onChange={(e) => setShowFullPath(e.target.checked)} />
                  Show full traced line
                </label>
              </div>
              <div
                ref={videoBoxRef}
                style={{ position: "relative", width: "100%", maxHeight: 520, aspectRatio: "16/9", cursor: "crosshair" }}
                onClick={placeAnchorFromClick}
                title="Click the barbell end cap to lock marker and start tracking."
              >
                <video
                  ref={videoRef}
                  src={streamUrl}
                  controls
                  playsInline
                  onLoadedMetadata={syncOverlayRect}
                  onPlay={() => {
                    if (lastPointRef.current) {
                      trackingStartedAtRef.current = performance.now();
                      setTrackingStatus("Tracking");
                      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
                      rafRef.current = requestAnimationFrame(trackFrame);
                    }
                  }}
                  onPause={() => {
                    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
                    if (trackingStatus === "Tracking") setTrackingStatus("Locked");
                  }}
                  onEnded={onVideoEnded}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
                <canvas ref={captureCanvasRef} style={{ display: "none" }} />
                <svg
                  viewBox="0 0 1 1"
                  preserveAspectRatio="none"
                  style={{
                    position: "absolute",
                    left: `${overlayRect.leftPct}%`,
                    top: `${overlayRect.topPct}%`,
                    width: `${overlayRect.widthPct}%`,
                    height: `${overlayRect.heightPct}%`,
                    pointerEvents: "none",
                  }}
                >
                  {trail.length > 1 && (
                    <polyline
                      points={trail.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke="oklch(78% .17 25)"
                      strokeWidth={0.004}
                      strokeLinecap="round"
                    />
                  )}
                  {marker && <circle cx={marker.x} cy={marker.y} r={0.011} fill="oklch(88% .14 125)" />}
                  {anchorPoint && (
                    <g>
                      <line x1={anchorPoint.x - 0.015} y1={anchorPoint.y} x2={anchorPoint.x + 0.015} y2={anchorPoint.y} stroke="oklch(85% .16 280)" strokeWidth={0.002} />
                      <line x1={anchorPoint.x} y1={anchorPoint.y - 0.015} x2={anchorPoint.x} y2={anchorPoint.y + 0.015} stroke="oklch(85% .16 280)" strokeWidth={0.002} />
                      <rect x={anchorPoint.x - 0.02} y={anchorPoint.y - 0.02} width={0.04} height={0.04} fill="none" stroke="oklch(85% .16 280)" strokeWidth={0.002} />
                    </g>
                  )}
                </svg>
                <div style={{ position: "absolute", top: 10, left: 10, padding: "4px 8px", borderRadius: 6, background: "rgba(0,0,0,.5)", color: "white", fontSize: 12 }}>
                  FPS: {currentFps != null ? Math.round(currentFps) : "--"}
                </div>
                <div style={{ position: "absolute", top: 10, right: 10, padding: "4px 8px", borderRadius: 6, background: "rgba(0,0,0,.5)", color: "white", fontSize: 12 }}>
                  {trackingStatus}
                </div>
              </div>
              <div style={{ padding: "10px 12px", background: "var(--card)", borderTop: "1px solid var(--border)", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {trackingStatus === "Tracking" ? "Tracking..." : trackingMessage}
                </div>
                {trackError && <div style={{ fontSize: 12, color: "var(--red)" }}>{trackError}</div>}
              </div>
            </div>
          )}

          {trackingStats && (
            <div style={{ textAlign: "left", border: "1px solid var(--border)", borderRadius: 12, padding: "12px", background: "var(--off)" }}>
              <div className="label" style={{ marginBottom: 8 }}>Tracking Results</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, fontSize: 13 }}>
                <div><strong>Tracker:</strong> End-cap live matcher</div>
                <div><strong>Average FPS:</strong> {trackingStats.fps.toFixed(1)}</div>
                <div><strong>Success Rate:</strong> {(trackingStats.confidence * 100).toFixed(1)}%</div>
                <div><strong>Tracked Frames:</strong> {trackingStats.trackedFrames}</div>
                <div><strong>Lost Frames:</strong> {trackingStats.lostFrames}</div>
                <div><strong>Path Source:</strong> User-selected end cap (live)</div>
              </div>
              {trackingStats.confidence < 0.75 && (
                <div style={{ marginTop: 8, color: "var(--amber)", fontSize: 12 }}>
                  ⚠️ Path drift warning: low confidence/lost-frame rate detected.
                </div>
              )}
            </div>
          )}

          {overlayUrl && (
            <>
              <div className="label" style={{ marginBottom: 2 }}>
                Pose Overlay — Rep {selectedRep ? selectedRep.rep_index + 1 : 1} Bottom Position
              </div>
              <img key={overlayUrl} src={`${API_URL}${overlayUrl}`} alt="Pose overlay"
                style={{ maxWidth: "100%", borderRadius: 12, maxHeight: 480, objectFit: "contain" }} />
            </>
          )}
          {reps.length > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
              {reps.map((rep, idx) => (
                <button
                  key={rep.rep_index}
                  className={idx === selectedRepIndex ? "btn-primary" : "btn-ghost"}
                  style={{ fontSize: 12, padding: "6px 12px" }}
                  onClick={() => setSelectedRepIndex(idx)}
                >
                  Rep {rep.rep_index + 1}
                </button>
              ))}
            </div>
          )}
          {selectedRep && (
            <div style={{ textAlign: "left", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px", background: "var(--off)" }}>
              <div className="label" style={{ marginBottom: 8 }}>
                Frame-by-frame walkthrough (Task 5 demo)
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
                {keyFrames.map((item) => (
                  <div
                    key={item.key}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      background: "var(--card)",
                      padding: "10px 12px",
                    }}
                  >
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      Frame {item.frame}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 13, marginTop: 2 }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                      {item.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {apiResult?.disclaimer && (
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 12 }}>{apiResult.disclaimer}</p>
          )}
        </div>
      ) : (
        <div style={{ aspectRatio: "16/9", maxWidth: 560, margin: "0 auto", background: "var(--navy)", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
          <div style={{ fontSize: 48, opacity: 0.4 }}>🎬</div>
          <div style={{ color: "rgba(255,255,255,.4)", fontSize: 14 }}>Annotated playback coming soon</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.25)" }}>Will show pose overlay, angle markers, and frame-by-frame review</div>
        </div>
      )}
    </div>
  );
}
