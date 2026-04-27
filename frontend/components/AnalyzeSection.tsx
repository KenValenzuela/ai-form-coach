"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import CoachBubble from "./CoachBubble";
import {
  backendIssuesToCoachMsgs,
  repMetricsToOverview,
  type AnalyzeResponse,
  type BackendIssue,
  type BackendRepResult,
  type TrackPathResponse,
} from "@/lib/data";

const ANALYZE_EXERCISES = ["Back Squat"];

type Phase = "upload" | "analyzing" | "results";
type Tab = "coach" | "overview" | "issues" | "video";
type CameraView = "side";

const PROGRESS_STEPS = [
  "Uploading video...",
  "Detecting body keypoints...",
  "Calculating joint angles...",
  "Comparing to biomechanical benchmarks...",
  "Preparing playback...",
];

const MAX_FILE_SIZE_MB = 500;
const SUPPORTED_TYPES = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"];
const ANALYSIS_TIMEOUT_MS = 4 * 60 * 1000;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const LAST_ANALYSIS_KEY = "align:last-analysis";

const SPEED_PRESETS = {
  quick: { label: "Quick", frameStride: 4, analysisDownscale: 0.4, description: "Fastest first pass" },
  balanced: { label: "Balanced", frameStride: 3, analysisDownscale: 0.5, description: "Recommended demo mode" },
  detailed: { label: "Detailed", frameStride: 1, analysisDownscale: 0.75, description: "Slower, higher fidelity" },
} as const;

type SpeedPreset = keyof typeof SPEED_PRESETS;
type SpeedMode = SpeedPreset | "custom";

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

function getExerciseType(_exercise: string): string { return "squat"; }

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
  const [markerBox, setMarkerBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [markerDraftBox, setMarkerDraftBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [frameStride, setFrameStride] = useState(3);
  const [analysisDownscale, setAnalysisDownscale] = useState(0.5);
  const [speedPreset, setSpeedPreset] = useState<SpeedMode>("balanced");
  const [step, setStep] = useState(0);
  const [apiResult, setApiResult] = useState<AnalyzeResponse | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [previewFrameNumber] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const openFilePicker = useCallback(() => {
    const input = fileRef.current;
    if (!input) return;
    input.value = "";
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.click();
  }, []);

  const estimatedDuration = useMemo(() => {
    if (!file) return "~30 sec";
    const workFactor = (analysisDownscale / 0.5) * (3 / Math.max(1, frameStride));
    const seconds = Math.max(8, Math.round((file.size / (1024 * 1024)) * 0.8 * workFactor));
    return seconds > 59 ? `~${Math.round(seconds / 60)} min` : `~${seconds} sec`;
  }, [analysisDownscale, file, frameStride]);

  const readinessChecks = [
    { label: "Video uploaded", met: Boolean(file) },
    { label: "Barbell marker selected (recommended)", met: Boolean(markerBox) },
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
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    let i = 0;
    const iv = setInterval(() => {
      i++;
      setStep(i);
      if (i >= PROGRESS_STEPS.length - 1) clearInterval(iv);
    }, 450);

    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

      const formData = new FormData();
      formData.append("video", file);
      formData.append("exercise_type", getExerciseType(exercise));
      formData.append("camera_view", cameraView);
      if (markerBox) {
        formData.append("roi_x", markerBox.x.toString());
        formData.append("roi_y", markerBox.y.toString());
        formData.append("roi_w", markerBox.w.toString());
        formData.append("roi_h", markerBox.h.toString());
        formData.append("target_center_x", String(markerBox.x + markerBox.w / 2));
        formData.append("target_center_y", String(markerBox.y + markerBox.h / 2));
      }
      formData.append("target_frame_number", "0");
      formData.append("target_scale_factor", String(analysisDownscale));
      formData.append("tracker_type", "csrt");
      formData.append("frame_stride", String(frameStride));
      formData.append("analysis_downscale", String(analysisDownscale));
      formData.append("fast_mode", "true");
      formData.append("include_tracking_summary", "true");

      const resp = await fetch(`${API_URL}/api/analyze`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

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
          speedPreset,
          result: data,
        })
      );
    } catch (err) {
      clearInterval(iv);
      if (timeoutId) clearTimeout(timeoutId);
      const isTimeout = err instanceof DOMException && err.name === "AbortError";
      const isNetworkFailure = err instanceof TypeError;
      let fallbackMessage = "Analysis failed. Make sure the backend is running.";
      if (err instanceof Error) {
        try {
          const parsed = JSON.parse(err.message);
          fallbackMessage = parsed?.detail ?? err.message;
        } catch {
          fallbackMessage = err.message;
        }
      }
      setApiError(
        isTimeout
          ? `Analysis timed out after ${Math.round(ANALYSIS_TIMEOUT_MS / 60000)} minutes. Try a shorter clip or faster demo settings.`
          : isNetworkFailure
            ? `Failed to fetch analysis. Confirm backend is reachable at ${API_URL} and CORS allows this frontend origin.`
            : fallbackMessage
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
    setMarkerBox(null);
    setMarkerDraftBox(null);
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
      setSpeedPreset((parsed as { speedPreset?: SpeedMode }).speedPreset ?? "balanced");
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
            sourceVideoUrl={sourceVideoUrl}
            previewFrameNumber={previewFrameNumber}
            markerBox={markerBox}
            markerDraftBox={markerDraftBox}
            setDrag={setDrag}
            setExercise={setExercise}
            setCameraView={setCameraView}
            setWeight={setWeight}
            setNotes={setNotes}
            setConsentChecked={setConsentChecked}
            setMarkerBox={setMarkerBox}
            setMarkerDraftBox={setMarkerDraftBox}
            frameStride={frameStride}
            setFrameStride={setFrameStride}
            analysisDownscale={analysisDownscale}
            setAnalysisDownscale={setAnalysisDownscale}
            speedPreset={speedPreset}
            setSpeedPreset={setSpeedPreset}
            onDrop={onDrop}
            handleFile={handleFile}
            runAnalysis={runAnalysis}
            clearFile={() => setFile(null)}
            openFilePicker={openFilePicker}
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
  sourceVideoUrl: string | null;
  previewFrameNumber: number;
  markerBox: { x: number; y: number; w: number; h: number } | null;
  markerDraftBox: { x: number; y: number; w: number; h: number } | null;
  setDrag: (v: boolean) => void;
  setExercise: (v: string) => void;
  setCameraView: (v: CameraView) => void;
  setWeight: (v: string) => void;
  setNotes: (v: string) => void;
  setConsentChecked: (v: boolean) => void;
  setMarkerBox: (v: { x: number; y: number; w: number; h: number } | null) => void;
  setMarkerDraftBox: (v: { x: number; y: number; w: number; h: number } | null) => void;
  frameStride: number;
  setFrameStride: (v: number) => void;
  analysisDownscale: number;
  setAnalysisDownscale: (v: number) => void;
  speedPreset: SpeedMode;
  setSpeedPreset: (v: SpeedMode) => void;
  onDrop: (e: React.DragEvent) => void;
  handleFile: (f: File) => void;
  runAnalysis: () => void;
  clearFile: () => void;
  openFilePicker: () => void;
}

function UploadPhase({
  drag, file, exercise, cameraView, weight, notes, consentChecked, estimatedDuration, readinessChecks, fileRef, sourceVideoUrl, markerBox, markerDraftBox,
  previewFrameNumber,
  setDrag, setExercise, setCameraView, setWeight, setNotes, setConsentChecked, setMarkerBox, setMarkerDraftBox, frameStride, setFrameStride, analysisDownscale, setAnalysisDownscale, speedPreset, setSpeedPreset, onDrop, handleFile, runAnalysis, clearFile, openFilePicker,
}: UploadPhaseProps) {
  const canAnalyze = Boolean(file) && consentChecked;
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [draftBox, setDraftBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [zoomPreview, setZoomPreview] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const inlineVideoRef = useRef<HTMLVideoElement | null>(null);
  const zoomPreviewRef = useRef<HTMLDivElement | null>(null);
  const previewCandidate = draftBox ?? markerDraftBox ?? markerBox;

  const applySpeedPreset = (preset: SpeedPreset) => {
    setSpeedPreset(preset);
    setFrameStride(SPEED_PRESETS[preset].frameStride);
    setAnalysisDownscale(SPEED_PRESETS[preset].analysisDownscale);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && markerDraftBox) {
        setMarkerBox(markerDraftBox);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [markerDraftBox, setMarkerBox]);

  const toNorm = (clientX: number, clientY: number, target: "inline" | "zoom" = "inline") => {
    const containerRect =
      target === "zoom"
        ? zoomPreviewRef.current?.getBoundingClientRect()
        : previewRef.current?.getBoundingClientRect();
    if (!containerRect) return null;

    const video = inlineVideoRef.current;
    const hasIntrinsic = Boolean(video && video.videoWidth > 0 && video.videoHeight > 0);
    if (!hasIntrinsic) {
      const x = (clientX - containerRect.left) / containerRect.width;
      const y = (clientY - containerRect.top) / containerRect.height;
      if (x < 0 || x > 1 || y < 0 || y > 1) return null;
      return { x, y };
    }

    const aspect = (video!.videoWidth || 1) / (video!.videoHeight || 1);
    const containerAspect = containerRect.width / containerRect.height;
    const renderWidth = containerAspect > aspect ? containerRect.height * aspect : containerRect.width;
    const renderHeight = containerAspect > aspect ? containerRect.height : containerRect.width / aspect;
    const left = containerRect.left + (containerRect.width - renderWidth) / 2;
    const top = containerRect.top + (containerRect.height - renderHeight) / 2;
    const x = (clientX - left) / renderWidth;
    const y = (clientY - top) / renderHeight;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  };

  return (
    <div className="card upload-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => { if (!file) openFilePicker(); }}
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
          position: "relative",
          zIndex: 0,
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
            {sourceVideoUrl && (
              <div
                ref={previewRef}
                style={{ position: "relative", width: "100%", maxWidth: 720, aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}
                onMouseDown={(e) => {
                  const p = toNorm(e.clientX, e.clientY, "inline");
                  if (!p) return;
                  setDragStart(p);
                  setDraftBox({ x: p.x, y: p.y, w: 0.01, h: 0.01 });
                }}
                onMouseMove={(e) => {
                  if (!dragStart) return;
                  const p = toNorm(e.clientX, e.clientY, "inline");
                  if (!p) return;
                  setDraftBox({
                    x: Math.min(dragStart.x, p.x),
                    y: Math.min(dragStart.y, p.y),
                    w: Math.max(0.01, Math.abs(p.x - dragStart.x)),
                    h: Math.max(0.01, Math.abs(p.y - dragStart.y)),
                  });
                }}
                onMouseUp={() => {
                  if (draftBox) setMarkerDraftBox(draftBox);
                  setDragStart(null);
                  setDraftBox(null);
                }}
                onMouseLeave={() => setDragStart(null)}
                onClick={(e) => {
                  if (dragStart) return;
                  const p = toNorm(e.clientX, e.clientY, "inline");
                  if (!p) return;
                  const size = 0.06;
                  setMarkerDraftBox({
                    x: Math.max(0, p.x - size / 2),
                    y: Math.max(0, p.y - size / 2),
                    w: Math.min(size, 1 - Math.max(0, p.x - size / 2)),
                    h: Math.min(size, 1 - Math.max(0, p.y - size / 2)),
                  });
                }}
              >
                <video
                  ref={inlineVideoRef}
                  src={sourceVideoUrl}
                  style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
                  muted
                  playsInline
                  onLoadedMetadata={(e) => {
                    e.currentTarget.pause();
                    e.currentTarget.currentTime = 0;
                  }}
                />
                {previewCandidate && (
                  <div style={{
                    position: "absolute",
                    left: `${previewCandidate.x * 100}%`,
                    top: `${previewCandidate.y * 100}%`,
                    width: `${previewCandidate.w * 100}%`,
                    height: `${previewCandidate.h * 100}%`,
                    border: "2px solid oklch(82% .2 210)",
                    background: "oklch(85% .18 210 / 0.15)",
                  }} />
                )}
              </div>
            )}
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              First usable frame: {previewFrameNumber}. Click to auto-place a small box or drag to draw one. Press Enter or Confirm Target.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" type="button" onClick={(e) => { e.stopPropagation(); if (markerDraftBox) setMarkerBox(markerDraftBox); }} disabled={!markerDraftBox}>Confirm Target</button>
              <button className="btn-ghost" type="button" onClick={(e) => { e.stopPropagation(); openFilePicker(); }}>Replace</button>
              <button className="btn-ghost" type="button" onClick={(e) => { e.stopPropagation(); setZoomPreview(true); }}>Zoom preview</button>
              <button className="btn-ghost" type="button" onClick={(e) => { e.stopPropagation(); clearFile(); setMarkerBox(null); setMarkerDraftBox(null); }}>Remove</button>
            </div>
            {markerBox && (
              <div style={{ fontSize: 12, color: "var(--green)" }}>
                Target confirmed ✓ (center {(markerBox.x + markerBox.w / 2).toFixed(3)}, {(markerBox.y + markerBox.h / 2).toFixed(3)} · frame 0)
              </div>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 44, opacity: 0.5 }}>🎬</div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Drop your demo video here</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>
              MP4, MOV, AVI, WebM up to {MAX_FILE_SIZE_MB} MB<br />
              Keep full body in frame from the selected camera angle
            </div>
            <button
              className="btn-ghost"
              style={{ marginTop: 4 }}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openFilePicker();
              }}
            >
              Browse Files
            </button>
          </>
        )}
      </div>

      <div style={{ padding: "30px 32px", borderLeft: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 16, position: "relative", zIndex: 1 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="label">Exercise</label>
            <select value={exercise} onChange={(e) => setExercise(e.target.value)}>
              {ANALYZE_EXERCISES.map((ex) => <option key={ex}>{ex}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Camera View</label>
            <select value={cameraView} onChange={(e) => setCameraView(e.target.value as CameraView)}>
              <option value="side">Side (recommended)</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">Analysis Speed</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
            {(Object.entries(SPEED_PRESETS) as [SpeedPreset, typeof SPEED_PRESETS[SpeedPreset]][]).map(([key, preset]) => (
              <button
                key={key}
                type="button"
                className={speedPreset === key ? "btn-primary" : "btn-ghost"}
                style={{ padding: "9px 8px", fontSize: 12, minHeight: 54 }}
                onClick={() => applySpeedPreset(key)}
              >
                <span style={{ display: "block", fontWeight: 700 }}>{preset.label}</span>
                <span style={{ display: "block", fontSize: 11, fontWeight: 500, opacity: 0.78 }}>{preset.description}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="label">Frame stride</label>
            <select value={frameStride} onChange={(e) => { setFrameStride(Number(e.target.value)); setSpeedPreset("custom"); }}>
              <option value={1}>1 (max quality)</option>
              <option value={2}>2 (balanced)</option>
              <option value={3}>3 (recommended for demos)</option>
              <option value={4}>4 (fastest)</option>
            </select>
          </div>
          <div>
            <label className="label">Analysis scale</label>
            <select value={analysisDownscale} onChange={(e) => { setAnalysisDownscale(Number(e.target.value)); setSpeedPreset("custom"); }}>
              <option value={1}>1.0x (full)</option>
              <option value={0.75}>0.75x</option>
              <option value={0.6}>0.6x (balanced)</option>
              <option value={0.5}>0.5x (recommended for demos)</option>
              <option value={0.4}>0.4x (fastest)</option>
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
            {canAnalyze ? "Analyze My Form →" : "Upload video and confirm consent"}
          </button>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, textAlign: "center" }}>
            Processed for this session only. Upload quality directly impacts coaching accuracy.
          </p>
        </div>
      </div>

      {zoomPreview && sourceVideoUrl && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(13, 27, 62, 0.82)",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
          onClick={() => {
            setZoomPreview(false);
            setDragStart(null);
          }}
        >
          <div
            style={{
              width: "min(1100px, 94vw)",
              background: "var(--card)",
              borderRadius: 14,
              border: "1px solid var(--border)",
              padding: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "left" }}>
                Large marker mode: draw around the barbell end-cap on the first frame.
              </div>
              <button className="btn-ghost" type="button" onClick={() => setZoomPreview(false)}>Close</button>
            </div>
            <div
              ref={zoomPreviewRef}
              style={{ position: "relative", width: "100%", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}
              onMouseDown={(e) => {
                const p = toNorm(e.clientX, e.clientY, "zoom");
                if (!p) return;
                setDragStart(p);
                setDraftBox({ x: p.x, y: p.y, w: 0.01, h: 0.01 });
              }}
              onMouseMove={(e) => {
                if (!dragStart) return;
                const p = toNorm(e.clientX, e.clientY, "zoom");
                if (!p) return;
                setDraftBox({
                  x: Math.min(dragStart.x, p.x),
                  y: Math.min(dragStart.y, p.y),
                  w: Math.max(0.01, Math.abs(p.x - dragStart.x)),
                  h: Math.max(0.01, Math.abs(p.y - dragStart.y)),
                });
              }}
              onMouseUp={() => {
                if (draftBox) setMarkerDraftBox(draftBox);
                setDragStart(null);
                setDraftBox(null);
              }}
            >
              <video
                src={sourceVideoUrl}
                style={{ width: "100%", height: "100%", objectFit: "contain", background: "#000" }}
                muted
              />
              {(draftBox || markerDraftBox || markerBox) && (
                <div style={{
                  position: "absolute",
                  left: `${(draftBox ?? markerDraftBox ?? markerBox)!.x * 100}%`,
                  top: `${(draftBox ?? markerDraftBox ?? markerBox)!.y * 100}%`,
                  width: `${(draftBox ?? markerDraftBox ?? markerBox)!.w * 100}%`,
                  height: `${(draftBox ?? markerDraftBox ?? markerBox)!.h * 100}%`,
                  border: "2px solid oklch(82% .2 210)",
                  background: "oklch(85% .18 210 / 0.15)",
                }} />
              )}
            </div>
          </div>
        </div>
      )}
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
      {apiResult?.warnings && apiResult.warnings.length > 0 && (
        <div className="card" style={{ padding: "16px 24px", borderColor: "oklch(88% .07 70)" }}>
          <div className="label">Runtime Warnings</div>
          {apiResult.warnings.map((warn) => (
            <div key={warn} style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>⚠️ {warn}</div>
          ))}
        </div>
      )}
      {apiResult?.stage_timings && (
        <div className="card" style={{ padding: "16px 24px" }}>
          <div className="label">Timing (seconds)</div>
          <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr auto", rowGap: 4, columnGap: 12 }}>
            {Object.entries(apiResult.stage_timings).map(([stage, value]) => (
              <div key={stage} style={{ display: "contents" }}>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{stage}</div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{value.toFixed(3)}</div>
              </div>
            ))}
          </div>
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
  type TrackingStatus = "Idle" | "Selecting" | "Ready" | "Tracking" | "Complete" | "Cancelled";

  const reps = apiResult?.results ?? [];
  const [selectedRepIndex, setSelectedRepIndex] = useState(0);
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>("Idle");
  const [trackingMessage, setTrackingMessage] = useState<string>("Pause on first frame, then drag a box around the barbell sleeve/end-cap.");
  const [trackingStats, setTrackingStats] = useState<{ fps: number; confidence: number; trackedFrames: number; lostFrames: number } | null>(null);
  const [pathMetrics, setPathMetrics] = useState<{ vertical: number | null; horizontal: number | null; smoothness: number | null } | null>(null);
  const [trackedPath, setTrackedPath] = useState<Array<{ frame: number; x: number; y: number; confidence: number; visible: boolean }>>([]);
  const [trackedBoxes, setTrackedBoxes] = useState<Array<{ frame: number; x: number; y: number; w: number; h: number; visible: boolean }>>([]);
  const [pendingRoi, setPendingRoi] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [isDraggingRoi, setIsDraggingRoi] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [videoTimeSec, setVideoTimeSec] = useState(0);
  const [showFullPath, setShowFullPath] = useState(true);
  const [overlayRect, setOverlayRect] = useState({ leftPct: 0, topPct: 0, widthPct: 100, heightPct: 100 });
  const [bboxMode, setBboxMode] = useState(false);
  const [boundingBox, setBoundingBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [dragStartPoint, setDragStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [activeReviewFrame, setActiveReviewFrame] = useState<number | null>(null);
  const [trackingCsvUrl, setTrackingCsvUrl] = useState<string | null>(apiResult?.tracking_csv_url ?? null);
  const [annotatedVideoUrl, setAnnotatedVideoUrl] = useState<string | null>(apiResult?.annotated_video_url ?? null);

  const videoBoxRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const roiPointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressAnchorClickRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const selectedRep = reps[selectedRepIndex] ?? null;
  const overlayUrl = selectedRep?.overlay_image_url ?? apiResult?.overlay_image_url ?? null;
  const streamUrl = sourceVideoUrl ?? (apiResult?.video_url ? `${API_URL}${apiResult.video_url}` : null);
  const fps = apiResult?.fps ?? 30;
  const repStart = selectedRep?.start_frame ?? 0;
  const repEnd = selectedRep?.end_frame ?? -1;
  const normalizedRepEnd = repEnd >= repStart ? repEnd : repStart;

  const pathByFrame = useMemo(() => {
    const m = new Map<number, { x: number; y: number; visible: boolean; confidence: number }>();
    for (const point of trackedPath) {
      m.set(point.frame, { x: point.x, y: point.y, visible: Boolean(point.visible), confidence: point.confidence ?? 1 });
    }
    return m;
  }, [trackedPath]);
  const boxByFrame = useMemo(() => {
    const m = new Map<number, { x: number; y: number; w: number; h: number; visible: boolean }>();
    for (const box of trackedBoxes) m.set(box.frame, box);
    return m;
  }, [trackedBoxes]);

  const activeFrame = Math.max(repStart, Math.min(normalizedRepEnd, Math.round(videoTimeSec * fps)));
  const currentPoint = pathByFrame.get(activeFrame);
  const currentBox = boxByFrame.get(activeFrame);
  const currentFps = trackingStats?.fps ?? null;

  const trail = useMemo(() => {
    const trailStartFrame = showFullPath ? repStart : Math.max(repStart, activeFrame - 70);
    const points: { x: number; y: number }[] = [];
    for (let frame = trailStartFrame; frame <= activeFrame; frame += 1) {
      const p = pathByFrame.get(frame);
      if (p && p.visible) points.push({ x: p.x, y: p.y });
    }
    return points;
  }, [activeFrame, pathByFrame, repStart, showFullPath]);

  useEffect(() => {
    setSelectedRepIndex(0);
  }, [apiResult?.video_id]);

  useEffect(() => {
    setTrackedPath([]);
    setTrackedBoxes([]);
    setTrackingStats(null);
    setPathMetrics(null);
    setTrackingStatus("Idle");
    setTrackError(null);
    setPendingRoi(null);
    setIsDraggingRoi(false);
    setVideoTimeSec(0);
    setTrackingMessage("Upload + play video, then click the barbell end cap.");
    setBoundingBox(null);
    setBboxMode(false);
    setDragStartPoint(null);
    setActiveReviewFrame(null);
    setTrackingCsvUrl(apiResult?.tracking_csv_url ?? null);
    setAnnotatedVideoUrl(apiResult?.annotated_video_url ?? null);
    if (apiResult?.initial_target) {
      const targetX = apiResult.initial_target.x - apiResult.initial_target.width / 2;
      const targetY = apiResult.initial_target.y - apiResult.initial_target.height / 2;
      setPendingRoi({
        x: Math.max(0, Math.min(1 - apiResult.initial_target.width, targetX)),
        y: Math.max(0, Math.min(1 - apiResult.initial_target.height, targetY)),
        w: apiResult.initial_target.width,
        h: apiResult.initial_target.height,
      });
      setTrackingStatus("Ready");
      setTrackingMessage("Target carried over from upload. Start tracking when you want the bar path overlay.");
    }
  }, [selectedRepIndex, apiResult?.video_id]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

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

  const stopTracking = useCallback((message = "Tracking cancelled.") => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setTrackingStatus("Cancelled");
    setTrackingMessage(message);
  }, []);

  const startTracking = useCallback(async () => {
    if (!apiResult?.video_id || !pendingRoi) return;
    setTrackError(null);
    setTrackingStatus("Tracking");
    setTrackingMessage("Tracking in progress...");
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const anchorX = pendingRoi.x + pendingRoi.w / 2;
      const anchorY = pendingRoi.y + pendingRoi.h / 2;
      const payload = {
        anchor_x: anchorX,
        anchor_y: anchorY,
        start_frame: repStart,
        end_frame: repEnd,
        bbox_width: pendingRoi.w,
        bbox_height: pendingRoi.h,
        roi_x: pendingRoi.x,
        roi_y: pendingRoi.y,
        roi_w: pendingRoi.w,
        roi_h: pendingRoi.h,
        tracker_type: "csrt",
        frame_stride: 3,
        analysis_downscale: 0.5,
        export_downscale: 0.75,
        render_annotated_video: false,
      };
      const resp = await fetch(`${API_URL}/api/analyze/${apiResult.video_id}/track-path`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data: TrackPathResponse = await resp.json();
      setTrackedPath(
        data.smoothed_tracked_path
          .filter((p) => p.x != null && p.y != null)
          .map((p) => ({ frame: p.frame, x: p.x as number, y: p.y as number, confidence: p.confidence, visible: p.visible }))
      );
      setTrackedBoxes(
        (data.tracked_boxes ?? [])
          .filter((b) => b.x != null && b.y != null && b.w != null && b.h != null)
          .map((b) => ({ frame: b.frame, x: b.x as number, y: b.y as number, w: b.w as number, h: b.h as number, visible: b.visible }))
      );
      setTrackingStats({
        fps: data.average_fps,
        confidence: data.tracking_success_rate,
        trackedFrames: data.tracked_path.filter((p) => p.visible).length,
        lostFrames: data.lost_frames.length,
      });
      setPathMetrics({
        vertical: data.path_metrics.vertical_displacement,
        horizontal: data.path_metrics.horizontal_drift,
        smoothness: data.path_metrics.path_smoothness,
      });
      setTrackingStatus("Complete");
      setTrackingMessage("Tracking complete. Press Esc to clear/cancel.");
      setTrackingCsvUrl(data.tracking_csv_url ?? null);
      setAnnotatedVideoUrl(data.annotated_video_url ?? null);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setTrackingStatus("Idle");
      setTrackError(err instanceof Error ? err.message : "Tracking request failed.");
    }
  }, [apiResult?.video_id, pendingRoi, repEnd, repStart]);

  const onPointerDownRoi = (e: React.PointerEvent<HTMLDivElement>) => {
    if (bboxMode) return;
    const p = toNormalizedPoint(e.clientX, e.clientY);
    if (!p) return;
    setTrackError(null);
    dragStartRef.current = p;
    setPendingRoi({ x: p.x, y: p.y, w: 0.001, h: 0.001 });
    setIsDraggingRoi(true);
    roiPointerStartRef.current = p;
    suppressAnchorClickRef.current = false;
    setTrackingStatus("Selecting");
    setTrackingMessage("Draw ROI around the barbell end-cap, then press Enter to confirm.");
  };

  const onPointerMoveRoi = (e: React.PointerEvent<HTMLDivElement>) => {
    if (bboxMode) return;
    if (!isDraggingRoi || !dragStartRef.current) return;
    const p = toNormalizedPoint(e.clientX, e.clientY);
    if (!p) return;
    const sx = dragStartRef.current.x;
    const sy = dragStartRef.current.y;
    setPendingRoi({
      x: Math.min(sx, p.x),
      y: Math.min(sy, p.y),
      w: Math.max(0.001, Math.abs(p.x - sx)),
      h: Math.max(0.001, Math.abs(p.y - sy)),
    });
  };

  const onPointerUpRoi = () => {
    if (bboxMode) return;
    if (!isDraggingRoi) return;
    setIsDraggingRoi(false);
    const start = roiPointerStartRef.current;
    if (start && pendingRoi) {
      const moved = Math.abs(pendingRoi.x - start.x) + Math.abs(pendingRoi.y - start.y);
      suppressAnchorClickRef.current = moved > 0.01;
    }
    roiPointerStartRef.current = null;
    if (pendingRoi) {
      setTrackingStatus("Ready");
      setTrackingMessage("ROI selected. Press Enter to start backend tracking, Esc to cancel.");
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        stopTracking("Tracking cancelled. Press click/drag to select ROI again.");
        setPendingRoi(null);
        return;
      }
      if (e.key === "Enter" && pendingRoi && trackingStatus !== "Tracking") {
        void startTracking();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingRoi, startTracking, stopTracking, trackingStatus]);

  const placeAnchorFromClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressAnchorClickRef.current) {
      suppressAnchorClickRef.current = false;
      return;
    }
    if (bboxMode) return;
    if (!selectedRep) return;
    const point = toNormalizedPoint(e.clientX, e.clientY);
    if (!point) {
      setTrackError("Click directly on the visible video frame (not letterbox area).");
      return;
    }
    const half = 0.04;
    const x = Math.max(0, point.x - half);
    const y = Math.max(0, point.y - half);
    const w = Math.min(1 - x, half * 2);
    const h = Math.min(1 - y, half * 2);
    setPendingRoi({ x, y, w, h });
    setTrackingStatus("Ready");
    setTrackingMessage("Anchor ROI placed. Press Enter to start backend tracking, Esc to cancel.");
    setTrackError(null);
  };

  const beginBoundingBox = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!bboxMode) return;
    const point = toNormalizedPoint(e.clientX, e.clientY);
    if (!point) return;
    setDragStartPoint(point);
    setBoundingBox({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const updateBoundingBox = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!bboxMode || !dragStartPoint) return;
    const point = toNormalizedPoint(e.clientX, e.clientY);
    if (!point) return;
    const x1 = Math.min(dragStartPoint.x, point.x);
    const y1 = Math.min(dragStartPoint.y, point.y);
    const x2 = Math.max(dragStartPoint.x, point.x);
    const y2 = Math.max(dragStartPoint.y, point.y);
    setBoundingBox({ x: x1, y: y1, width: Math.max(0.01, x2 - x1), height: Math.max(0.01, y2 - y1) });
  };

  const finishBoundingBox = () => {
    if (!bboxMode) return;
    setDragStartPoint(null);
  };

  const jumpToFrame = (frame: number) => {
    const videoEl = videoRef.current;
    if (!videoEl || !Number.isFinite(frame)) return;
    const nextTime = frame / Math.max(1, fps);
    videoEl.currentTime = Math.max(0, nextTime);
    videoEl.pause();
    setVideoTimeSec(Math.max(0, nextTime));
    setActiveReviewFrame(frame);
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
                  Real-time barbell end-cap tracker + optional user-defined bounding box
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--muted)" }}>
                    <input type="checkbox" checked={showFullPath} onChange={(e) => setShowFullPath(e.target.checked)} />
                    Show full traced line
                  </label>
                  <button className={bboxMode ? "btn-primary" : "btn-ghost"} style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => setBboxMode((v) => !v)}>
                    {bboxMode ? "Bounding box mode ON" : "Set bounding box"}
                  </button>
                  {boundingBox && (
                    <button className="btn-ghost" style={{ fontSize: 12, padding: "6px 10px" }} onClick={() => setBoundingBox(null)}>
                      Clear box
                    </button>
                  )}
                </div>
              </div>
              <div
                ref={videoBoxRef}
                style={{ position: "relative", width: "100%", maxHeight: 520, aspectRatio: "16/9", cursor: bboxMode ? "crosshair" : "pointer" }}
                onClick={placeAnchorFromClick}
                onPointerDown={onPointerDownRoi}
                onPointerMove={onPointerMoveRoi}
                onPointerUp={onPointerUpRoi}
                onPointerCancel={onPointerUpRoi}
                onMouseDown={beginBoundingBox}
                onMouseMove={updateBoundingBox}
                onMouseUp={finishBoundingBox}
                onMouseLeave={finishBoundingBox}
                title="Click the barbell end cap to lock marker and start tracking."
              >
                <video
                  ref={videoRef}
                  src={streamUrl}
                  controls
                  playsInline
                  onLoadedMetadata={() => {
                    syncOverlayRect();
                    const v = videoRef.current;
                    if (v) {
                      v.pause();
                      v.currentTime = 0;
                    }
                  }}
                  onEnded={onVideoEnded}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
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
                  {currentBox?.visible && (
                    <rect x={currentBox.x} y={currentBox.y} width={currentBox.w} height={currentBox.h} fill="none" stroke="oklch(85% .16 280)" strokeWidth={0.003} />
                  )}
                  {pendingRoi && (
                    <rect
                      x={pendingRoi.x}
                      y={pendingRoi.y}
                      width={pendingRoi.w}
                      height={pendingRoi.h}
                      fill="oklch(85% .18 210 / 0.15)"
                      stroke="oklch(82% .2 210)"
                      strokeWidth={0.003}
                    />
                  )}
                  {boundingBox && (
                    <g>
                      <rect
                        x={boundingBox.x}
                        y={boundingBox.y}
                        width={boundingBox.width}
                        height={boundingBox.height}
                        fill="oklch(85% .18 210 / 0.15)"
                        stroke="oklch(82% .2 210)"
                        strokeWidth={0.003}
                      />
                      <text
                        x={Math.min(0.98, boundingBox.x + 0.005)}
                        y={Math.max(0.03, boundingBox.y - 0.006)}
                        fontSize={0.024}
                        fill="white"
                      >
                        ROI
                      </text>
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
                  {bboxMode ? "Drag on the video to place a bounding box." : trackingStatus === "Tracking" ? "Tracking..." : trackingMessage}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {trackError && <div style={{ fontSize: 12, color: "var(--red)" }}>{trackError}</div>}
                  {pendingRoi && trackingStatus !== "Tracking" && (
                    <button className="btn-primary" type="button" style={{ fontSize: 12, padding: "7px 10px" }} onClick={() => void startTracking()}>
                      {trackingStatus === "Complete" ? "Re-track Path" : "Start Fast Tracking"}
                    </button>
                  )}
                  {trackingStatus === "Tracking" && (
                    <button className="btn-ghost" type="button" style={{ fontSize: 12, padding: "7px 10px" }} onClick={() => stopTracking()}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {trackingStats && (
            <div style={{ textAlign: "left", border: "1px solid var(--border)", borderRadius: 12, padding: "12px", background: "var(--off)" }}>
              <div className="label" style={{ marginBottom: 8 }}>Tracking Results</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, fontSize: 13 }}>
                <div><strong>Tracker:</strong> Fast optical-flow ROI tracker</div>
                <div><strong>Average FPS:</strong> {trackingStats.fps.toFixed(1)}</div>
                <div><strong>Success Rate:</strong> {(trackingStats.confidence * 100).toFixed(1)}%</div>
                <div><strong>Tracked Frames:</strong> {trackingStats.trackedFrames}</div>
                <div><strong>Lost Frames:</strong> {trackingStats.lostFrames}</div>
                <div><strong>Path Source:</strong> Center of user-confirmed ROI</div>
                <div><strong>Vertical Displacement:</strong> {pathMetrics?.vertical != null ? pathMetrics.vertical.toFixed(4) : "--"}</div>
                <div><strong>Horizontal Drift:</strong> {pathMetrics?.horizontal != null ? pathMetrics.horizontal.toFixed(4) : "--"}</div>
                <div><strong>Path Smoothness:</strong> {pathMetrics?.smoothness != null ? pathMetrics.smoothness.toFixed(4) : "--"}</div>
              </div>
              {trackingStats.confidence < 0.75 && (
                <div style={{ marginTop: 8, color: "var(--amber)", fontSize: 12 }}>
                  ⚠️ Path drift warning: low confidence/lost-frame rate detected.
                </div>
              )}
              {(trackingCsvUrl || annotatedVideoUrl) && (
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {trackingCsvUrl && <a className="btn-ghost" style={{ fontSize: 12 }} href={`${API_URL}${trackingCsvUrl}`} target="_blank" rel="noreferrer">Download tracking CSV</a>}
                  {annotatedVideoUrl && <a className="btn-ghost" style={{ fontSize: 12 }} href={`${API_URL}${annotatedVideoUrl}`} target="_blank" rel="noreferrer">Download annotated video</a>}
                </div>
              )}
            </div>
          )}

          {apiResult?.stage_timings && (
            <div style={{ textAlign: "left", border: "1px solid var(--border)", borderRadius: 12, padding: "12px", background: "var(--card)" }}>
              <div className="label" style={{ marginBottom: 8 }}>Analysis Timing</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, fontSize: 12 }}>
                {Object.entries(apiResult.stage_timings).map(([k, v]) => <div key={k}><strong>{k}:</strong> {Number(v).toFixed(3)}s</div>)}
              </div>
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
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => jumpToFrame(item.frame)}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      background:
                        activeReviewFrame === item.frame
                          ? "var(--lav-d)"
                          : Math.abs(activeFrame - item.frame) <= 1
                            ? "oklch(97% .05 280)"
                            : "var(--card)",
                      padding: "10px 12px",
                      textAlign: "left",
                      cursor: "pointer",
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
                  </button>
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
