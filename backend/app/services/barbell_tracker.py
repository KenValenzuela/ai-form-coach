from __future__ import annotations

import csv
from pathlib import Path
from time import perf_counter
from typing import Any, Literal
from uuid import uuid4

import cv2
import numpy as np

TrackerType = Literal["optical_flow", "kcf", "csrt"]
TrackingSource = Literal["tracker", "optical_flow", "interpolated", "manual_reselect"]

TRACKING_EXPORT_DIR = Path("app/data/tracking")
TRACKING_EXPORT_DIR.mkdir(parents=True, exist_ok=True)


def _compute_path_metrics(points: list[dict[str, float | int | bool | None]]) -> dict[str, float | None]:
    visible = [(float(p["x"]), float(p["y"])) for p in points if p.get("visible") and p.get("x") is not None and p.get("y") is not None]
    if len(visible) < 2:
        return {
            "vertical_displacement": None,
            "horizontal_drift": None,
            "path_smoothness": None,
        }

    xs = [p[0] for p in visible]
    ys = [p[1] for p in visible]
    vertical_displacement = max(ys) - min(ys)
    horizontal_drift = max(xs) - min(xs)

    step_lengths: list[float] = []
    for idx in range(1, len(visible)):
        dx = visible[idx][0] - visible[idx - 1][0]
        dy = visible[idx][1] - visible[idx - 1][1]
        step_lengths.append(float(np.hypot(dx, dy)))

    path_smoothness = float(np.std(step_lengths)) if len(step_lengths) >= 2 else 0.0
    return {
        "vertical_displacement": float(vertical_displacement),
        "horizontal_drift": float(horizontal_drift),
        "path_smoothness": path_smoothness,
    }


def _smooth_visible_points(
    points: list[dict[str, float | int | bool]],
    alpha: float = 0.25,
) -> list[dict[str, float | int | bool]]:
    smoothed: list[dict[str, float | int | bool]] = []
    prev: dict[str, float] | None = None

    for point in points:
        frame = int(point["frame"])
        visible = bool(point["visible"])
        confidence = float(point.get("confidence", 0.0))
        x = point.get("x")
        y = point.get("y")

        if not visible or x is None or y is None:
            smoothed.append({"frame": frame, "x": None, "y": None, "confidence": confidence, "visible": False})
            continue

        x_val = float(x)
        y_val = float(y)
        if prev is None:
            sx, sy = x_val, y_val
        else:
            sx = prev["x"] + alpha * (x_val - prev["x"])
            sy = prev["y"] + alpha * (y_val - prev["y"])

        prev = {"x": sx, "y": sy}
        smoothed.append({"frame": frame, "x": sx, "y": sy, "confidence": confidence, "visible": True})

    return smoothed


def _create_tracker(tracker_type: TrackerType):
    if tracker_type == "kcf":
        if hasattr(cv2, "TrackerKCF_create"):
            return cv2.TrackerKCF_create()
        legacy = getattr(cv2, "legacy", None)
        if legacy and hasattr(legacy, "TrackerKCF_create"):
            return legacy.TrackerKCF_create()
        raise ValueError("KCF tracker is unavailable in this OpenCV build")

    if tracker_type == "csrt":
        if hasattr(cv2, "TrackerCSRT_create"):
            return cv2.TrackerCSRT_create()
        legacy = getattr(cv2, "legacy", None)
        if legacy and hasattr(legacy, "TrackerCSRT_create"):
            return legacy.TrackerCSRT_create()
        raise ValueError("CSRT tracker is unavailable in this OpenCV build")

    raise ValueError(f"Unsupported tracker type: {tracker_type}")


def _interpolate_missing_points(
    points: list[dict[str, float | int | bool | str | None]],
) -> list[dict[str, float | int | bool | str | None]]:
    result = [dict(point) for point in points]
    n = len(result)
    idx = 0
    while idx < n:
        if result[idx].get("x") is not None and result[idx].get("y") is not None:
            idx += 1
            continue

        gap_start = idx
        while idx < n and (result[idx].get("x") is None or result[idx].get("y") is None):
            idx += 1
        gap_end = idx - 1
        prev_idx = gap_start - 1
        next_idx = idx if idx < n else None
        if prev_idx < 0 or next_idx is None:
            continue

        prev = result[prev_idx]
        nxt = result[next_idx]
        prev_x, prev_y = prev.get("x"), prev.get("y")
        next_x, next_y = nxt.get("x"), nxt.get("y")
        if None in {prev_x, prev_y, next_x, next_y}:
            continue

        gap_len = (gap_end - gap_start) + 1
        for offset, frame_idx in enumerate(range(gap_start, gap_end + 1), start=1):
            t = offset / (gap_len + 1)
            ix = float(prev_x) + (float(next_x) - float(prev_x)) * t
            iy = float(prev_y) + (float(next_y) - float(prev_y)) * t
            result[frame_idx]["x"] = ix
            result[frame_idx]["y"] = iy
            result[frame_idx]["visible"] = True
            result[frame_idx]["confidence"] = 0.3
            result[frame_idx]["tracking_status"] = "interpolated"
            result[frame_idx]["source"] = "interpolated"

    return result


def _write_tracking_csv(
    rows: list[dict[str, float | int | bool | str | None]],
    fps: float,
) -> str:
    filename = f"barbell_tracking_{uuid4().hex}.csv"
    out_path = TRACKING_EXPORT_DIR / filename
    fieldnames = ["frame_number", "timestamp_seconds", "x", "y", "tracking_status", "confidence", "source"]
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            frame_no = int(row["frame"])
            writer.writerow(
                {
                    "frame_number": frame_no,
                    "timestamp_seconds": (frame_no / fps) if fps > 0 else "",
                    "x": row.get("x"),
                    "y": row.get("y"),
                    "tracking_status": row.get("tracking_status", "lost"),
                    "confidence": row.get("confidence", 0.0),
                    "source": row.get("source", "tracker"),
                }
            )
    return f"/static/tracking/{filename}"


def track_barbell_path(
    video_path: str,
    anchor_x: float,
    anchor_y: float,
    start_frame: int = 0,
    end_frame: int | None = None,
    bbox_width: float = 0.05,
    bbox_height: float = 0.05,
    roi_x: float | None = None,
    roi_y: float | None = None,
    roi_w: float | None = None,
    roi_h: float | None = None,
    tracker_type: TrackerType = "optical_flow",
    frame_stride: int = 1,
    analysis_downscale: float = 1.0,
    render_annotated_video: bool = True,
) -> dict[str, Any]:
    stage_timings: dict[str, float] = {}
    total_start = perf_counter()
    decode_time = 0.0
    tracking_time = 0.0
    overlay_time = 0.0
    encode_time = 0.0
    csv_time = 0.0

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError("Unable to open video for tracking")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if total_frames <= 0:
        cap.release()
        return {
            "tracked_path": [],
            "raw_tracked_path": [],
            "smoothed_tracked_path": [],
            "fps_by_frame": [],
            "average_fps": 0.0,
            "tracking_success_rate": 0.0,
            "lost_frames": [],
            "tracker_type": tracker_type,
            "start_frame": 0,
            "end_frame": 0,
        }

    base_fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    render_fps = base_fps if base_fps > 0 else 30.0
    frame_index = max(0, min(start_frame, total_frames - 1))
    final_frame = total_frames - 1 if end_frame is None else max(frame_index, min(end_frame, total_frames - 1))
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
    decode_start = perf_counter()
    ok, frame = cap.read()
    decode_time += perf_counter() - decode_start
    if not ok or frame is None:
        cap.release()
        raise ValueError("Unable to read start frame for tracking")

    h, w = frame.shape[:2]
    frame_stride = max(1, int(frame_stride))
    analysis_downscale = float(np.clip(analysis_downscale, 0.25, 1.0))
    analysis_w = max(16, int(w * analysis_downscale))
    analysis_h = max(16, int(h * analysis_downscale))
    scale_x = analysis_w / float(w)
    scale_y = analysis_h / float(h)
    gray = cv2.cvtColor(cv2.resize(frame, (analysis_w, analysis_h), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
    if None not in {roi_x, roi_y, roi_w, roi_h}:
        rx = float(roi_x)  # type: ignore[arg-type]
        ry = float(roi_y)  # type: ignore[arg-type]
        rw = float(roi_w)  # type: ignore[arg-type]
        rh = float(roi_h)  # type: ignore[arg-type]
        if rw < 0.01 or rh < 0.01:
            cap.release()
            raise ValueError("Invalid bounding box: width/height are too small.")
        if rx < 0 or ry < 0 or (rx + rw) > 1 or (ry + rh) > 1:
            cap.release()
            raise ValueError("Invalid bounding box: ROI must stay inside the visible frame.")
    px = float(np.clip(anchor_x, 0.0, 1.0) * analysis_w)
    py = float(np.clip(anchor_y, 0.0, 1.0) * analysis_h)

    raw_tracked: list[dict[str, float | int | bool | str | None]] = []
    tracked_boxes: list[dict[str, float | int | bool | None]] = []
    tracking_records: list[dict[str, float | int | bool | None | dict[str, float | None]]] = []
    fps_by_frame: list[dict[str, float | int]] = []
    lost_frames: list[int] = []

    lk_params: dict[str, Any] = {
        "winSize": (21, 21),
        "maxLevel": 3,
        "criteria": (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 20, 0.03),
    }
    if None not in {roi_x, roi_y, roi_w, roi_h}:
        bw = max(8, int(np.clip(float(roi_w), 0.01, 1.0) * analysis_w))
        bh = max(8, int(np.clip(float(roi_h), 0.01, 1.0) * analysis_h))
        x0 = max(0, min(analysis_w - bw, int(np.clip(float(roi_x), 0.0, 1.0) * analysis_w)))
        y0 = max(0, min(analysis_h - bh, int(np.clip(float(roi_y), 0.0, 1.0) * analysis_h)))
    else:
        bw = max(8, int(np.clip(bbox_width, 0.01, 0.25) * analysis_w))
        bh = max(8, int(np.clip(bbox_height, 0.01, 0.25) * analysis_h))
        x0 = max(0, min(analysis_w - bw, int(px - bw / 2)))
        y0 = max(0, min(analysis_h - bh, int(py - bh / 2)))
    last_box = (float(x0), float(y0), float(bw), float(bh))
    prev_gray = gray
    flow_points = np.array([[[px, py]]], dtype=np.float32)

    tracker = None
    if tracker_type in {"kcf", "csrt"}:
        tracker = _create_tracker(tracker_type)
        tracker.init(gray, (x0, y0, bw, bh))

    frames_for_export: list[tuple[int, np.ndarray]] = []

    while True:
        t0 = perf_counter()
        ok_box = False
        source: TrackingSource = "tracker"
        confidence = 0.0
        box = None
        if tracker_type == "optical_flow" or tracker is None:
            source = "optical_flow"
            ok_box = flow_points is not None and len(flow_points) > 0
            if ok_box:
                mx = float(np.mean(flow_points[:, 0, 0]))
                my = float(np.mean(flow_points[:, 0, 1]))
                box = (mx - bw / 2.0, my - bh / 2.0, float(bw), float(bh))
                confidence = 0.75
        else:
            ok_box, candidate_box = tracker.update(gray)
            if ok_box:
                box = candidate_box
                confidence = 1.0
            else:
                source = "optical_flow"
                if flow_points is not None and len(flow_points) > 0:
                    mx = float(np.mean(flow_points[:, 0, 0]))
                    my = float(np.mean(flow_points[:, 0, 1]))
                    box = (mx - bw / 2.0, my - bh / 2.0, float(bw), float(bh))
                    ok_box = True
                    confidence = 0.55
        tracking_time += perf_counter() - t0
        frame_fps = (1.0 / max(1e-6, perf_counter() - t0))

        if ok_box and box is not None:
            bx, by, bw_box, bh_box = box
            bx = float(np.clip(bx, 0.0, analysis_w - bw_box))
            by = float(np.clip(by, 0.0, analysis_h - bh_box))
            cx = float((bx + bw_box / 2.0) / analysis_w)
            cy = float((by + bh_box / 2.0) / analysis_h)
            full_x = float(np.clip(cx, 0.0, 1.0))
            full_y = float(np.clip(cy, 0.0, 1.0))
            raw_tracked.append(
                {
                    "frame": frame_index,
                    "x": full_x,
                    "y": full_y,
                    "confidence": float(confidence),
                    "visible": True,
                    "tracking_status": "ok" if source == "tracker" else "low_confidence",
                    "source": source,
                }
            )
            tracked_boxes.append(
                {
                    "frame": frame_index,
                    "x": float(np.clip((bx / scale_x) / w, 0.0, 1.0)),
                    "y": float(np.clip((by / scale_y) / h, 0.0, 1.0)),
                    "w": float(np.clip((bw_box / scale_x) / w, 0.0, 1.0)),
                    "h": float(np.clip((bh_box / scale_y) / h, 0.0, 1.0)),
                    "visible": True,
                }
            )
            tracking_records.append(
                {
                    "frame_index": frame_index,
                    "timestamp": (frame_index / render_fps),
                    "bbox": {
                        "x": tracked_boxes[-1]["x"],
                        "y": tracked_boxes[-1]["y"],
                        "w": tracked_boxes[-1]["w"],
                        "h": tracked_boxes[-1]["h"],
                    },
                    "center_x": full_x,
                    "center_y": full_y,
                    "fps": frame_fps,
                    "tracking_success": True,
                }
            )
            last_box = (bx, by, bw_box, bh_box)
            flow_points = np.array([[[bx + bw_box / 2.0, by + bh_box / 2.0]]], dtype=np.float32)
        else:
            raw_tracked.append(
                {"frame": frame_index, "x": None, "y": None, "confidence": 0.0, "visible": False, "tracking_status": "lost", "source": "optical_flow"}
            )
            tracked_boxes.append({"frame": frame_index, "x": None, "y": None, "w": None, "h": None, "visible": False})
            lost_frames.append(frame_index)
            tracking_records.append(
                {
                    "frame_index": frame_index,
                    "timestamp": (frame_index / render_fps),
                    "bbox": {"x": None, "y": None, "w": None, "h": None},
                    "center_x": None,
                    "center_y": None,
                    "fps": frame_fps,
                    "tracking_success": False,
                }
            )

        fps_by_frame.append({"frame": frame_index, "fps": frame_fps})
        if frame_index >= final_frame:
            break

        next_read_idx = min(frame_index + frame_stride, final_frame + 1)
        next_frame = None
        for _ in range(next_read_idx - frame_index):
            decode_start = perf_counter()
            ok, next_frame = cap.read()
            decode_time += perf_counter() - decode_start
            if not ok or next_frame is None:
                next_frame = None
                break
        if next_frame is None:
            break
        frame_index = next_read_idx
        resized = cv2.resize(next_frame, (analysis_w, analysis_h), interpolation=cv2.INTER_AREA)
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

        if flow_points is not None and len(flow_points) > 0:
            next_points, status, err = cv2.calcOpticalFlowPyrLK(prev_gray, gray, flow_points, None, **lk_params)
            if next_points is not None and status is not None and np.any(status.reshape(-1) == 1):
                good = next_points[status.reshape(-1) == 1].reshape(-1, 1, 2).astype(np.float32)
                flow_points = good
                if err is not None and raw_tracked:
                    good_err = err.reshape(-1)[status.reshape(-1) == 1]
                    raw_tracked[-1]["confidence"] = float(np.clip(1.0 - np.mean(good_err) / 35.0, 0.0, 1.0))
            else:
                flow_points = None
        prev_gray = gray
        frame = next_frame
        if render_annotated_video:
            frames_for_export.append((frame_index, frame.copy()))

    cap.release()

    interpolated_tracked = _interpolate_missing_points(raw_tracked)
    smoothed_tracked = _smooth_visible_points(interpolated_tracked, alpha=0.28)
    visible_count = sum(1 for point in raw_tracked if point["visible"])
    total_count = len(raw_tracked)
    success_rate = (visible_count / total_count) if total_count else 0.0
    average_fps = (
        float(sum(item["fps"] for item in fps_by_frame) / len(fps_by_frame)) if fps_by_frame else 0.0
    )
    path_metrics = _compute_path_metrics(smoothed_tracked)
    stage_timings["decode_seconds"] = round(decode_time, 4)
    stage_timings["tracking_seconds"] = round(tracking_time, 4)

    csv_start = perf_counter()
    tracking_csv_url = _write_tracking_csv(interpolated_tracked, render_fps)
    csv_time += perf_counter() - csv_start
    stage_timings["csv_seconds"] = round(csv_time, 4)

    annotated_video_url = None
    if render_annotated_video and frames_for_export:
        encode_start = perf_counter()
        first_frame = frames_for_export[0][1]
        out_name = f"barbell_tracking_{uuid4().hex}.mp4"
        out_path = TRACKING_EXPORT_DIR / out_name
        writer = cv2.VideoWriter(
            str(out_path),
            cv2.VideoWriter_fourcc(*"mp4v"),
            max(15.0, render_fps / frame_stride),
            (first_frame.shape[1], first_frame.shape[0]),
        )
        for frame_no, canvas in frames_for_export:
            overlay_start = perf_counter()
            point = next((p for p in smoothed_tracked if p["frame"] == frame_no), None)
            box = next((b for b in tracked_boxes if b["frame"] == frame_no), None)
            trail = [p for p in smoothed_tracked if p["frame"] <= frame_no and p.get("x") is not None and p.get("y") is not None]
            for i in range(1, len(trail)):
                x1 = int(float(trail[i - 1]["x"]) * w)
                y1 = int(float(trail[i - 1]["y"]) * h)
                x2 = int(float(trail[i]["x"]) * w)
                y2 = int(float(trail[i]["y"]) * h)
                cv2.line(canvas, (x1, y1), (x2, y2), (32, 118, 255), 2)
            if box and box.get("x") is not None:
                x = int(float(box["x"]) * w)
                y = int(float(box["y"]) * h)
                bw_v = int(float(box["w"]) * w)
                bh_v = int(float(box["h"]) * h)
                cv2.rectangle(canvas, (x, y), (x + bw_v, y + bh_v), (188, 84, 255), 2)
            if point and point.get("x") is not None:
                cx = int(float(point["x"]) * w)
                cy = int(float(point["y"]) * h)
                cv2.circle(canvas, (cx, cy), 6, (0, 255, 255), -1)
            cv2.putText(canvas, f"FPS: {frame_fps:.1f}", (20, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            cv2.putText(canvas, f"t={frame_no / render_fps:.2f}s", (20, 58), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            writer.write(canvas)
            overlay_time += perf_counter() - overlay_start
        writer.release()
        encode_time += perf_counter() - encode_start
        annotated_video_url = f"/static/tracking/{out_name}"
    stage_timings["overlay_seconds"] = round(overlay_time, 4)
    stage_timings["encode_seconds"] = round(encode_time, 4)
    stage_timings["total_seconds"] = round(perf_counter() - total_start, 4)
    print(f"[track_barbell_path] timings={stage_timings}")

    end_frame = int(raw_tracked[-1]["frame"]) if raw_tracked else frame_index
    return {
        "tracked_path": smoothed_tracked,
        "raw_tracked_path": interpolated_tracked,
        "smoothed_tracked_path": smoothed_tracked,
        "tracked_boxes": tracked_boxes,
        "fps_by_frame": fps_by_frame,
        "tracking_records": tracking_records,
        "average_fps": average_fps,
        "tracking_success_rate": success_rate,
        "path_metrics": path_metrics,
        "lost_frames": lost_frames,
        "tracker_type": tracker_type,
        "start_frame": start_frame,
        "end_frame": end_frame,
        "tracking_csv_url": tracking_csv_url,
        "annotated_video_url": annotated_video_url,
        "stage_timings": stage_timings,
    }
