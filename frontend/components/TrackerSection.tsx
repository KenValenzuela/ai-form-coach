"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import type { TrackPathResponse } from "@/lib/data";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type Mode = "upload" | "roi" | "tracking" | "results";
type UploadPayload = {
  video_id: number;
  video_url: string;
  width: number;
  height: number;
  preview_image_url: string;
};
type RoiBox = { x: number; y: number; w: number; h: number };
type TrackedBox = { frame: number; time_sec: number; x: number | null; y: number | null; width: number; height: number; confidence: number };

export default function TrackerSection() {
  const [mode, setMode] = useState<Mode>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadPayload | null>(null);
  const [roi, setRoi] = useState<RoiBox | null>(null);
  const [draftRoi, setDraftRoi] = useState<RoiBox | null>(null);
  const [tracking, setTracking] = useState<TrackPathResponse | null>(null);
  const [showPath, setShowPath] = useState(true);
  const [fps, setFps] = useState<number>(0);
  const [trackingActive, setTrackingActive] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const lastTickRef = useRef<number | null>(null);

  const trackedBoxes = useMemo<TrackedBox[]>(() => {
    if (!tracking || !upload) return [];
    if (tracking.tracked_boxes?.length) {
      return tracking.tracked_boxes.map((b) => ({
        frame: b.frame,
        time_sec: (b as { time_sec?: number }).time_sec ?? (tracking.video_fps ? b.frame / tracking.video_fps : 0),
        x: b.x,
        y: b.y,
        width: (b as { width?: number; w?: number }).width ?? (b as { w?: number }).w ?? 0,
        height: (b as { height?: number; h?: number }).height ?? (b as { h?: number }).h ?? 0,
        confidence: (b as { confidence?: number }).confidence ?? 0,
      }));
    }

    const source = tracking.bar_path_raw ?? tracking.raw_tracked_path ?? [];
    const roiW = roi ? roi.w * upload.width : 24;
    const roiH = roi ? roi.h * upload.height : 24;
    return source.map((p) => ({
      frame: p.frame,
      time_sec: (p as { time_sec?: number }).time_sec ?? (tracking.video_fps ? p.frame / tracking.video_fps : 0),
      x: p.x == null ? null : p.x - roiW / 2,
      y: p.y == null ? null : p.y - roiH / 2,
      width: roiW,
      height: roiH,
      confidence: p.confidence,
    }));
  }, [tracking, upload, roi]);

  const smoothPath = useMemo(() => {
    if (!tracking) return [];
    return (tracking.bar_path_smooth ?? tracking.smoothed_tracked_path ?? []).filter((p) => p.x !== null && p.y !== null);
  }, [tracking]);

  const statusLabel = trackingActive ? "ACTIVE" : "LOST";

  const resetAll = () => {
    setMode("upload");
    setFile(null);
    setUpload(null);
    setRoi(null);
    setDraftRoi(null);
    setTracking(null);
    setShowPath(true);
    setFps(0);
    setTrackingActive(true);
    setError(null);
  };

  const uploadVideo = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("video", file);
      fd.append("exercise_type", "squat");
      fd.append("camera_view", "side");
      const resp = await fetch(`${API_URL}/api/analyze/upload-tracker-video`, { method: "POST", body: fd });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail ?? "Upload failed");
      setUpload(data);
      setRoi(null);
      setDraftRoi(null);
      setTracking(null);
      setMode("roi");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const startTracking = async () => {
    if (!upload || !roi) return;
    setLoading(true);
    setError(null);
    try {
      const anchor_x = roi.x + roi.w / 2;
      const anchor_y = roi.y + roi.h / 2;
      const resp = await fetch(`${API_URL}/api/analyze/${upload.video_id}/track-path`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anchor_x,
          anchor_y,
          roi_x: roi.x,
          roi_y: roi.y,
          roi_w: roi.w,
          roi_h: roi.h,
          tracker_type: "csrt",
          frame_stride: 1,
          analysis_downscale: 1,
          export_downscale: 1,
          render_annotated_video: false,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail ?? "Tracking failed");
      setTracking(data);
      setMode("tracking");
      setTrackingActive(true);
      lastTickRef.current = null;
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          void videoRef.current.play();
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tracking failed");
    } finally {
      setLoading(false);
    }
  };

  const startRoiDrag = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (mode !== "roi") return;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragStartRef.current = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
    setDraftRoi(null);
  };

  const moveRoiDrag = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (mode !== "roi" || !dragStartRef.current) return;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ex = (e.clientX - rect.left) / rect.width;
    const ey = (e.clientY - rect.top) / rect.height;
    const x = Math.max(0, Math.min(dragStartRef.current.x, ex));
    const y = Math.max(0, Math.min(dragStartRef.current.y, ey));
    const w = Math.min(1 - x, Math.abs(ex - dragStartRef.current.x));
    const h = Math.min(1 - y, Math.abs(ey - dragStartRef.current.y));
    setDraftRoi({ x, y, w, h });
  };

  const endRoiDrag = () => {
    if (mode === "roi" && draftRoi && draftRoi.w > 0.01 && draftRoi.h > 0.01) {
      setRoi(draftRoi);
    }
    dragStartRef.current = null;
  };

  useEffect(() => {
    const video = videoRef.current;
    const canvas = overlayRef.current;
    if (!video || !canvas || !upload || !tracking) return;

    let raf = 0;
    const drawOverlay = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
      }

      const now = performance.now();
      if (lastTickRef.current != null) {
        const dt = (now - lastTickRef.current) / 1000;
        if (dt > 0) setFps(1 / dt);
      }
      lastTickRef.current = now;

      const frameNow = Math.round((video.currentTime || 0) * (tracking.video_fps ?? 30));
      const current = trackedBoxes.reduce<TrackedBox | null>((best, box) => {
        if (!best) return box;
        return Math.abs(box.frame - frameNow) < Math.abs(best.frame - frameNow) ? box : best;
      }, null);

      const isVisible = !!current && current.x !== null && current.y !== null;
      setTrackingActive(isVisible);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const sx = canvas.width / upload.width;
      const sy = canvas.height / upload.height;

      if (isVisible && current) {
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 3;
        ctx.strokeRect((current.x as number) * sx, (current.y as number) * sy, current.width * sx, current.height * sy);

        const cx = ((current.x as number) + current.width / 2) * sx;
        const cy = ((current.y as number) + current.height / 2) * sy;
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      if (showPath) {
        const points = smoothPath.filter((p) => p.frame <= frameNow && p.x !== null && p.y !== null);
        if (points.length > 1) {
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 2;
          ctx.beginPath();
          points.forEach((p, idx) => {
            const px = (p.x as number) * sx;
            const py = (p.y as number) * sy;
            if (idx === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          });
          ctx.stroke();
        }
      }

      if (!video.paused && !video.ended && mode === "tracking") {
        raf = requestAnimationFrame(drawOverlay);
      }
    };
    void loadAnalytics();
  }, []);

    const redraw = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(drawOverlay);
    };

    const onEnded = () => {
      setMode("results");
      redraw();
    };

    video.addEventListener("play", redraw);
    video.addEventListener("pause", redraw);
    video.addEventListener("seeked", redraw);
    video.addEventListener("timeupdate", redraw);
    video.addEventListener("ended", onEnded);
    redraw();

    return () => {
      cancelAnimationFrame(raf);
      video.removeEventListener("play", redraw);
      video.removeEventListener("pause", redraw);
      video.removeEventListener("seeked", redraw);
      video.removeEventListener("timeupdate", redraw);
      video.removeEventListener("ended", onEnded);
    };
  }, [tracking, upload, trackedBoxes, smoothPath, showPath, mode]);

  return (
    <section className="section" id="tracker">
      <div className="container">
        <h1 style={{ fontSize: 32, marginBottom: 8 }}>Barbell Tracker</h1>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>Mode-based workflow: Upload → ROI Selection → Tracking → Results.</p>
        {error && <div style={{ ...panel, borderColor: "#ef4444", color: "#b91c1c", marginBottom: 12 }}>{error}</div>}

        <div style={{ ...panel, padding: 16 }}>
          <div
            ref={previewRef}
            onMouseDown={startRoiDrag}
            onMouseMove={moveRoiDrag}
            onMouseUp={endRoiDrag}
            style={videoStage}
          >
            {mode === "upload" && <EmptyState text="UPLOAD MODE — Select a video to begin." />}

            {upload && (
              <>
                {mode === "roi" && (
                  <img src={`${API_URL}${upload.preview_image_url}`} alt="ROI selection frame" style={mediaStyle} />
                )}
                {(mode === "tracking" || mode === "results") && (
                  <>
                    <video ref={videoRef} controls src={`${API_URL}${upload.video_url}`} style={mediaStyle} />
                    <canvas ref={overlayRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
                    <div style={hudStyle}>
                      <div>FPS: {fps ? Math.round(fps) : "--"}</div>
                      <div>Status: <span style={{ color: trackingActive ? "#22c55e" : "#ef4444" }}>{statusLabel}</span></div>
                    </div>
                  </>
                )}
              </>
            )}

            {mode === "roi" && [roi, draftRoi].filter(Boolean).map((box, i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${(box as RoiBox).x * 100}%`,
                  top: `${(box as RoiBox).y * 100}%`,
                  width: `${(box as RoiBox).w * 100}%`,
                  height: `${(box as RoiBox).h * 100}%`,
                  border: `2px solid ${i === 0 ? "#22c55e" : "#f59e0b"}`,
                }}
              />
            ))}
          </div>

          <div style={instructions}>
            {mode === "upload" && <span>Upload a squat video. Overlays are hidden in this mode.</span>}
            {mode === "roi" && <span>ROI SELECTION MODE: Draw box around barbell end cap, press confirm.</span>}
            {mode === "tracking" && <span>TRACKING MODE: Bounding box updates every frame and follows playback in real time.</span>}
            {mode === "results" && <span>RESULTS MODE: Full tracked path shown. ROI editing is disabled.</span>}
          </div>

          <div style={controlsBar}>
            {mode === "upload" && (
              <>
                <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                <button className="btn-primary" onClick={uploadVideo} disabled={!file || loading}>Upload Video</button>
              </>
            )}

            {mode === "roi" && (
              <>
                <button className="btn-primary" onClick={startTracking} disabled={!roi || loading}>Confirm & Start Tracking</button>
                <button className="btn-ghost" onClick={() => { setRoi(null); setDraftRoi(null); }} disabled={loading}>Clear ROI</button>
                <button className="btn-ghost" onClick={resetAll} disabled={loading}>Reset</button>
              </>
            )}

            {(mode === "tracking" || mode === "results") && (
              <>
                <button className="btn-primary" onClick={() => {
                  if (videoRef.current) {
                    if (videoRef.current.paused) void videoRef.current.play();
                    else videoRef.current.pause();
                  }
                }}>
                  {videoRef.current?.paused ? "Play" : "Pause"}
                </button>
                <button className="btn-ghost" onClick={() => setShowPath((v) => !v)}>{showPath ? "Hide Path" : "Show Path"}</button>
                <button className="btn-ghost" onClick={resetAll}>Reset</button>
                {!trackingActive && <button className="btn-ghost" onClick={() => setMode("roi")}>Reinitialize</button>}
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div style={{ display: "grid", placeItems: "center", width: "100%", height: "100%", color: "#9ca3af", fontWeight: 700 }}>{text}</div>;
}

const panel: CSSProperties = { border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)" };
const mediaStyle: CSSProperties = { width: "100%", height: "100%", objectFit: "contain" };
const videoStage: CSSProperties = {
  position: "relative",
  width: "min(100%, 1000px)",
  margin: "0 auto",
  aspectRatio: "16 / 9",
  borderRadius: 12,
  overflow: "hidden",
  background: "#0f172a",
};
const hudStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  background: "rgba(0,0,0,0.55)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 10,
  padding: "8px 10px",
  fontSize: 12,
  display: "grid",
  gap: 4,
};
const instructions: CSSProperties = { marginTop: 12, textAlign: "center", color: "var(--muted)", fontSize: 14 };
const controlsBar: CSSProperties = { marginTop: 14, display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" };
