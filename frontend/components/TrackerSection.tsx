"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import type { TrackPathResponse } from "@/lib/data";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type TrackerState =
  | "No video uploaded"
  | "Waiting for ROI"
  | "ROI selected"
  | "Tracking running"
  | "Tracking complete"
  | "Tracking degraded"
  | "Tracking failed";

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
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadPayload | null>(null);
  const [roi, setRoi] = useState<RoiBox | null>(null);
  const [draftRoi, setDraftRoi] = useState<RoiBox | null>(null);
  const [state, setState] = useState<TrackerState>("No video uploaded");
  const [tracking, setTracking] = useState<TrackPathResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const previewRef = useRef<HTMLDivElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  const trackedBoxes = useMemo<TrackedBox[]>(() => {
    if (!tracking) return [];
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
    if (!roi) return [];
    const source = tracking.bar_path_raw ?? tracking.raw_tracked_path ?? [];
    return source
      .filter((p) => p.x !== null && p.y !== null)
      .map((p) => ({
        frame: p.frame,
        time_sec: (p as { time_sec?: number }).time_sec ?? (tracking.video_fps ? p.frame / tracking.video_fps : 0),
        x: (p.x ?? 0) - ((roi.w * (upload?.width ?? 0)) / 2),
        y: (p.y ?? 0) - ((roi.h * (upload?.height ?? 0)) / 2),
        width: roi.w * (upload?.width ?? 0),
        height: roi.h * (upload?.height ?? 0),
        confidence: p.confidence,
      }));
  }, [tracking, roi, upload]);

  const warnings = useMemo(() => {
    const items = [...(tracking?.warnings ?? [])];
    if ((tracking?.horizontal_deviation_px ?? 0) < 3 && (tracking?.vertical_range_px ?? 0) < 3) {
      items.push("Tracking appears static. The ROI may be locked onto background instead of the barbell endcap.");
    }
    if ((tracking?.lost_frames?.length ?? 0) > 0) {
      items.push(`Lost frames detected: ${tracking?.lost_frames.length}`);
    }
    return Array.from(new Set(items));
  }, [tracking]);

  const runUpload = async () => {
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
      setTracking(null);
      setState("Waiting for ROI");
    } catch (e) {
      setState("Tracking failed");
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  const runTracking = async () => {
    if (!upload || !roi) return;
    setLoading(true);
    setError(null);
    setState("Tracking running");
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
          render_annotated_video: true,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.detail ?? "Tracking failed");
      setTracking(data);
      if ((data.warnings ?? []).length > 0 || (data.lost_frames?.length ?? 0) > 0) {
        setState("Tracking degraded");
      } else {
        setState("Tracking complete");
      }
    } catch (e) {
      setState("Tracking failed");
      setError(e instanceof Error ? e.message : "Tracking failed");
    } finally {
      setLoading(false);
    }
  };

  const onMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!upload) return;
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragStart.current = { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
    setDraftRoi(null);
  };

  const onMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const rect = previewRef.current?.getBoundingClientRect();
    if (!rect || !dragStart.current) return;
    const ex = (e.clientX - rect.left) / rect.width;
    const ey = (e.clientY - rect.top) / rect.height;
    const x = Math.max(0, Math.min(dragStart.current.x, ex));
    const y = Math.max(0, Math.min(dragStart.current.y, ey));
    const w = Math.min(1 - x, Math.abs(ex - dragStart.current.x));
    const h = Math.min(1 - y, Math.abs(ey - dragStart.current.y));
    setDraftRoi({ x, y, w, h });
  };

  const onMouseUp = () => {
    if (draftRoi && draftRoi.w > 0.01 && draftRoi.h > 0.01) {
      setRoi(draftRoi);
      setState("ROI selected");
    }
    dragStart.current = null;
  };

  useEffect(() => {
    const video = videoRef.current;
    const canvas = overlayRef.current;
    if (!video || !canvas || !tracking || !upload) return;
    let raf = 0;
    const path = tracking.bar_path_smooth ?? [];
    const draw = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const nowFrame = Math.round((video.currentTime || 0) * (tracking.video_fps ?? 30));
      const curr = trackedBoxes.reduce((best, box) => (Math.abs(box.frame - nowFrame) < Math.abs(best.frame - nowFrame) ? box : best), trackedBoxes[0]);
      if (curr && curr.x !== null && curr.y !== null) {
        const sx = canvas.width / upload.width;
        const sy = canvas.height / upload.height;
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 3;
        ctx.strokeRect(curr.x * sx, curr.y * sy, curr.width * sx, curr.height * sy);
        const cx = (curr.x + curr.width / 2) * sx;
        const cy = (curr.y + curr.height / 2) * sy;
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      const points = path.filter((p) => p.frame <= nowFrame && p.x !== null && p.y !== null);
      if (points.length > 1) {
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth = 2;
        ctx.beginPath();
        points.forEach((p, i) => {
          const px = (p.x ?? 0) * (canvas.width / upload.width);
          const py = (p.y ?? 0) * (canvas.height / upload.height);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      }
      ctx.fillStyle = "#fff";
      ctx.font = "13px DM Sans";
      ctx.fillText(`Frame: ${nowFrame}`, 14, 20);
      ctx.fillText(`Time: ${video.currentTime.toFixed(2)}s`, 14, 38);
      if (!video.paused && !video.ended) raf = requestAnimationFrame(draw);
    };

    const onPlay = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };
    const onPause = () => draw();
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onPause);
    draw();
    return () => {
      cancelAnimationFrame(raf);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onPause);
    };
  }, [tracking, upload, trackedBoxes]);

  return (
    <section className="section" id="tracker">
      <div className="container">
        <h1 style={{ fontSize: 32, marginBottom: 4 }}>Barbell Tracker Workflow</h1>
        <p style={{ color: "var(--muted)", marginBottom: 16 }}>Upload, select endcap ROI, run tracking, and review bar path results with clear status states.</p>
        {error && <div style={{ ...notice, borderColor: "#ef4444", color: "#b91c1c" }}>{error}</div>}
        <div style={layout}>
          <div className="card" style={{ padding: 14 }}>
            <div
              ref={previewRef}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              style={{ position: "relative", aspectRatio: "16/9", borderRadius: 10, overflow: "hidden", background: "#111827" }}
            >
              {!upload && <EmptyState text="No video uploaded" />}
              {upload && !tracking && (
                <img src={`${API_URL}${upload.preview_image_url}`} alt="first frame" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
              )}
              {upload && tracking && (
                <>
                  <video ref={videoRef} controls src={`${API_URL}${tracking.annotated_video_url ?? upload.video_url}`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  <canvas ref={overlayRef} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} />
                </>
              )}
              {[roi, draftRoi].filter(Boolean).map((box, i) => (
                <div key={i} style={{ position: "absolute", left: `${(box as RoiBox).x * 100}%`, top: `${(box as RoiBox).y * 100}%`, width: `${(box as RoiBox).w * 100}%`, height: `${(box as RoiBox).h * 100}%`, border: `2px solid ${i === 0 ? "#22c55e" : "#f59e0b"}` }} />
              ))}
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <h3 style={{ marginBottom: 10 }}>Controls</h3>
            <Step n={1} title="Upload" done={!!upload}>
              <input type="file" accept="video/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              <button className="btn-primary" style={{ marginTop: 8 }} onClick={runUpload} disabled={!file || loading}>Upload video</button>
            </Step>
            <Step n={2} title="Select Barbell Endcap" done={!!roi}>
              <p style={muted}>Draw a box around the sleeve/endcap on the first frame.</p>
            </Step>
            <Step n={3} title="Track Path" done={!!tracking}>
              <button className="btn-primary" onClick={runTracking} disabled={!upload || !roi || loading}>Start Tracking</button>
            </Step>
            <Step n={4} title="Results" done={!!tracking}>
              <p style={muted}>State: <strong>{state}</strong></p>
              {tracking && (
                <div style={{ fontSize: 13, display: "grid", gap: 6 }}>
                  <div>Tracking confidence: {tracking.tracking_quality_score ?? "--"}</div>
                  <div>Tracker method: {tracking.tracking_method_used ?? tracking.tracker_type}</div>
                  <div>Video FPS: {tracking.video_fps ?? "--"}</div>
                  <div>Processing FPS: {tracking.average_processing_fps ?? tracking.average_fps}</div>
                </div>
              )}
            </Step>
            {!!warnings.length && (
              <div style={{ ...notice, marginTop: 12, borderColor: "#f59e0b", color: "#92400e" }}>
                {warnings.map((w) => <div key={w}>⚠️ {w}</div>)}
              </div>
            )}
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700 }}>Advanced details</summary>
              <div style={{ marginTop: 8, fontSize: 12, color: "var(--muted)", display: "grid", gap: 6 }}>
                <div>Lost frames: {tracking?.lost_frames?.length ?? 0}</div>
                <div>Tracking failures: {tracking?.tracking_failures ?? 0}</div>
                <div>Horizontal deviation (px): {tracking?.horizontal_deviation_px ?? "--"}</div>
                <div>Vertical range (px): {tracking?.vertical_range_px ?? "--"}</div>
              </div>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, marginBottom: 8 }}>
        <span>Step {n}: {title}</span>
        <span style={{ color: done ? "var(--green)" : "var(--muted)" }}>{done ? "Done" : "Pending"}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div style={{ display: "grid", placeItems: "center", width: "100%", height: "100%", color: "#9ca3af", fontWeight: 700 }}>{text}</div>;
}

const layout: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: 14, alignItems: "start" };
const notice: CSSProperties = { border: "1px solid", borderRadius: 10, padding: "8px 10px" };
const muted: CSSProperties = { fontSize: 13, color: "var(--muted)" };
