from __future__ import annotations

import csv
import logging
import os
from collections import Counter
from pathlib import Path
from time import perf_counter
from typing import Any, Literal
from uuid import uuid4

import cv2
import numpy as np

from .timing_log import write_timing_log

TrackerType = Literal["optical_flow", "kcf", "csrt"]
MethodType = Literal["kcf", "csrt", "optical_flow", "template_recovery", "pose_proxy"]

TRACKING_EXPORT_DIR = Path("app/data/tracking")
TRACKING_EXPORT_DIR.mkdir(parents=True, exist_ok=True)
logger = logging.getLogger(__name__)


def _is_valid_frame(frame: np.ndarray | None) -> bool:
    return frame is not None and hasattr(frame, "size") and frame.size > 0 and len(frame.shape) >= 2


def _create_tracker(tracker_type: TrackerType):
    """Build an OpenCV tracker when available."""
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

    return None


def create_tracker(tracker_type: str = "KCF"):
    tracker_key = tracker_type.upper()
    if tracker_key == "KCF":
        if hasattr(cv2, "TrackerKCF_create"):
            return cv2.TrackerKCF_create()
        legacy = getattr(cv2, "legacy", None)
        if legacy and hasattr(legacy, "TrackerKCF_create"):
            return legacy.TrackerKCF_create()
        raise RuntimeError("KCF tracker not available. Install opencv-contrib-python.")
    if tracker_key == "CSRT":
        if hasattr(cv2, "TrackerCSRT_create"):
            return cv2.TrackerCSRT_create()
        legacy = getattr(cv2, "legacy", None)
        if legacy and hasattr(legacy, "TrackerCSRT_create"):
            return legacy.TrackerCSRT_create()
        raise RuntimeError("CSRT tracker not available. Install opencv-contrib-python.")
    raise RuntimeError(f"Unsupported tracker_type '{tracker_type}'.")


def _build_tracker_candidates(preferred: TrackerType) -> list[TrackerType]:
    ordered: list[TrackerType] = []
    for candidate in [preferred, "csrt", "kcf"]:
        if candidate not in ordered and candidate in {"csrt", "kcf"}:
            ordered.append(candidate)  # type: ignore[arg-type]
    return ordered


def _resolve_initial_roi(
    frame_w: int,
    frame_h: int,
    anchor_x: float,
    anchor_y: float,
    bbox_width: float,
    bbox_height: float,
    roi_x: float | None,
    roi_y: float | None,
    roi_w: float | None,
    roi_h: float | None,
) -> tuple[int, int, int, int]:
    """Resolve normalized ROI to integer pixels inside frame."""
    if None not in {roi_x, roi_y, roi_w, roi_h}:
        rx = float(roi_x)  # type: ignore[arg-type]
        ry = float(roi_y)  # type: ignore[arg-type]
        rw = float(roi_w)  # type: ignore[arg-type]
        rh = float(roi_h)  # type: ignore[arg-type]
    else:
        rw = float(np.clip(bbox_width, 0.02, 0.3))
        rh = float(np.clip(bbox_height, 0.02, 0.3))
        rx = float(np.clip(anchor_x - (rw / 2.0), 0.0, 1.0 - rw))
        ry = float(np.clip(anchor_y - (rh / 2.0), 0.0, 1.0 - rh))

    if rw <= 0.0 or rh <= 0.0:
        raise ValueError("Invalid ROI dimensions")
    if rx < 0.0 or ry < 0.0 or rx + rw > 1.0 or ry + rh > 1.0:
        raise ValueError("Invalid ROI: bounding box must remain in frame bounds")

    w = max(8, int(round(rw * frame_w)))
    h = max(8, int(round(rh * frame_h)))
    x = int(round(rx * frame_w))
    y = int(round(ry * frame_h))
    x = max(0, min(frame_w - w, x))
    y = max(0, min(frame_h - h, y))
    return x, y, w, h


def validate_roi(roi: dict[str, Any], frame_width: int, frame_height: int) -> tuple[int, int, int, int]:
    try:
        x = float(roi.get("x"))
        y = float(roi.get("y"))
        w = float(roi.get("width"))
        h = float(roi.get("height"))
    except (TypeError, ValueError):
        raise ValueError("Invalid ROI. Select a box fully inside the video frame.")
    if w <= 0 or h <= 0 or x < 0 or y < 0:
        raise ValueError("Invalid ROI. Select a box fully inside the video frame.")
    if x + w > frame_width or y + h > frame_height:
        raise ValueError("Invalid ROI. Select a box fully inside the video frame.")
    return int(round(x)), int(round(y)), int(round(w)), int(round(h))


def _smooth_path_moving_average(
    points: list[dict[str, float | int | None]],
    window: int = 5,
) -> list[dict[str, float | int]]:
    """Smooth path using moving average over available points."""
    if not points:
        return []
    window = max(1, int(window))
    smoothed: list[dict[str, float | int]] = []
    for idx, point in enumerate(points):
        start = max(0, idx - window + 1)
        chunk = points[start : idx + 1]
        xs = [float(p["x"]) for p in chunk if p.get("x") is not None]
        ys = [float(p["y"]) for p in chunk if p.get("y") is not None]
        if not xs or not ys or point.get("x") is None or point.get("y") is None:
            continue
        smoothed.append(
            {
                "frame": int(point["frame"]),
                "time_sec": float(point["time_sec"]),
                "x": float(sum(xs) / len(xs)),
                "y": float(sum(ys) / len(ys)),
            }
        )
    return smoothed


def _roi_texture_score(gray_roi: np.ndarray) -> dict[str, float]:
    if gray_roi.size == 0:
        return {"variance": 0.0, "edge_density": 0.0}
    variance = float(np.var(gray_roi))
    edges = cv2.Canny(gray_roi, 80, 160)
    edge_density = float(np.count_nonzero(edges) / max(1, edges.size))
    return {"variance": variance, "edge_density": edge_density}


def _should_reject_jump(prev_xy: tuple[float, float] | None, current_xy: tuple[float, float], max_jump_px: float) -> bool:
    """Reject physically implausible jumps."""
    if prev_xy is None:
        return False
    return float(np.hypot(current_xy[0] - prev_xy[0], current_xy[1] - prev_xy[1])) > max_jump_px


def _interpolate_short_gaps(
    points: list[dict[str, float | int | None]],
    max_gap: int = 4,
) -> list[dict[str, float | int | None]]:
    """Linearly interpolate short missing spans for degraded tracking resilience."""
    out = [dict(p) for p in points]
    i = 0
    n = len(out)
    while i < n:
        if out[i]["x"] is not None and out[i]["y"] is not None:
            i += 1
            continue
        start = i
        while i < n and (out[i]["x"] is None or out[i]["y"] is None):
            i += 1
        end = i - 1
        gap = end - start + 1
        prev_idx = start - 1
        next_idx = i if i < n else None
        if gap > max_gap or prev_idx < 0 or next_idx is None:
            continue
        prev = out[prev_idx]
        nxt = out[next_idx]
        if None in {prev["x"], prev["y"], nxt["x"], nxt["y"]}:
            continue
        for j, idx in enumerate(range(start, end + 1), start=1):
            t = j / (gap + 1)
            out[idx]["x"] = float(prev["x"]) + (float(nxt["x"]) - float(prev["x"])) * t
            out[idx]["y"] = float(prev["y"]) + (float(nxt["y"]) - float(prev["y"])) * t
            out[idx]["confidence"] = 0.35
    return out


def _calculate_metrics(points: list[dict[str, float | int | None]]) -> dict[str, float]:
    valid = [(float(p["x"]), float(p["y"])) for p in points if p.get("x") is not None and p.get("y") is not None]
    if len(valid) < 2:
        return {
            "horizontal_deviation_px": 0.0,
            "vertical_range_px": 0.0,
            "tracking_quality_score": 0.0,
        }
    xs = [p[0] for p in valid]
    ys = [p[1] for p in valid]
    horizontal_deviation_px = float(max(xs) - min(xs))
    vertical_range_px = float(max(ys) - min(ys))
    return {
        "horizontal_deviation_px": horizontal_deviation_px,
        "vertical_range_px": vertical_range_px,
        "tracking_quality_score": float(max(0.0, 100.0 - (horizontal_deviation_px * 0.05))),
    }


def _write_tracking_csv(rows: list[dict[str, float | int | None]]) -> str:
    filename = f"bar_path_coordinates_{uuid4().hex}.csv"
    out_path = TRACKING_EXPORT_DIR / filename
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=["frame", "time_sec", "x", "y", "confidence"],
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
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
    tracker_type: TrackerType = "csrt",
    frame_stride: int = 2,
    analysis_downscale: float = 0.75,
    render_annotated_video: bool = True,
    export_downscale: float = 1.0,
) -> dict[str, Any]:
    """Track barbell sleeve/end-cap with tracker + optical flow + local template recovery."""
    total_t0 = perf_counter()
    decode_sec = 0.0
    track_sec = 0.0
    render_sec = 0.0
    encode_sec = 0.0

    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video not found: {video_path}")
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError("Unable to open video")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    video_fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    if total_frames <= 0:
        cap.release()
        return {
            "tracked_path": [],
            "raw_tracked_path": [],
            "smoothed_tracked_path": [],
            "bar_path_raw": [],
            "bar_path_smooth": [],
            "tracking_method_used": "pose_proxy",
            "tracking_quality_score": 0.0,
            "tracking_failures": 0,
            "average_processing_fps": 0.0,
            "average_fps": 0.0,
            "video_fps": video_fps,
            "horizontal_deviation_px": 0.0,
            "vertical_range_px": 0.0,
            "path_metrics": {"vertical_displacement": 0.0, "horizontal_drift": 0.0, "path_smoothness": 0.0},
            "lost_frames": [],
            "tracker_type": tracker_type,
            "start_frame": 0,
            "end_frame": 0,
        }

    frame_stride = max(1, int(frame_stride))
    analysis_downscale = float(np.clip(analysis_downscale, 0.25, 1.0))

    frame_idx = max(0, min(start_frame, total_frames - 1))
    end_idx = total_frames - 1 if end_frame is None else max(frame_idx, min(end_frame, total_frames - 1))
    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    logger.info(
        "track_barbell_path: path=%s fps=%.3f frame_count=%s width=%s height=%s start_frame=%s end_frame=%s tracker=%s",
        video_path,
        video_fps,
        total_frames,
        frame_width,
        frame_height,
        frame_idx,
        end_idx,
        tracker_type,
    )
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)

    t0 = perf_counter()
    ok, frame = cap.read()
    decode_sec += perf_counter() - t0
    if not ok or not _is_valid_frame(frame):
        cap.release()
        raise ValueError("Failed to read start frame")

    full_h, full_w = frame.shape[:2]
    track_w = max(32, int(full_w * analysis_downscale))
    track_h = max(32, int(full_h * analysis_downscale))

    def to_track_gray(img: np.ndarray) -> np.ndarray:
        if not _is_valid_frame(img):
            raise ValueError("Encountered empty frame during grayscale conversion.")
        resized = cv2.resize(img, (track_w, track_h), interpolation=cv2.INTER_AREA)
        if not _is_valid_frame(resized):
            raise ValueError("Resize failed: empty tracking frame.")
        return cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)

    gray = to_track_gray(frame)
    roi = _resolve_initial_roi(track_w, track_h, anchor_x, anchor_y, bbox_width, bbox_height, roi_x, roi_y, roi_w, roi_h)
    x, y, w, h = roi
    init_x, init_y, init_w, init_h = x, y, w, h
    if w * h < 144:
        cap.release()
        raise ValueError("Selected ROI is too small. Select the barbell sleeve/endcap with a larger box.")
    roi_gray = gray[y : y + h, x : x + w]
    if roi_gray.size == 0:
        cap.release()
        raise ValueError("Invalid ROI. Select a box fully inside the video frame.")
    roi_texture = _roi_texture_score(roi_gray)
    if roi_texture["variance"] < 35.0 or roi_texture["edge_density"] < 0.01:
        cap.release()
        raise ValueError(
            "Selected ROI has low texture/contrast. Re-select ROI tightly around the barbell sleeve/endcap."
        )
    template = roi_gray.copy()

    trackers: list[tuple[str, Any]] = []
    for candidate in _build_tracker_candidates(tracker_type):
        try:
            t = _create_tracker(candidate)
        except Exception:
            t = None
        if t is None:
            continue
        try:
            t.init(gray, (x, y, w, h))
            trackers.append((candidate, t))
        except Exception:
            continue

    prev_gray = gray
    features = cv2.goodFeaturesToTrack(gray[y : y + h, x : x + w], maxCorners=20, qualityLevel=0.01, minDistance=4)
    if features is not None:
        features[:, 0, 0] += x
        features[:, 0, 1] += y

    lk_params: dict[str, Any] = {
        "winSize": (21, 21),
        "maxLevel": 3,
        "criteria": (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 20, 0.03),
    }

    bar_path_raw: list[dict[str, float | int | None]] = []
    tracked_boxes: list[dict[str, float | int | None]] = []
    fps_by_frame: list[dict[str, float | int]] = []
    tracking_records: list[dict[str, Any]] = []
    methods: list[MethodType] = []
    failures = 0
    lost_frames: list[int] = []
    recovery_attempts = 0
    max_jump_px = max(20.0, np.hypot(w, h) * 2.6)
    prev_center: tuple[float, float] | None = None
    full_roi_w = float(max(8.0, init_w * (full_w / track_w)))
    full_roi_h = float(max(8.0, init_h * (full_h / track_h)))
    frames_for_export: list[tuple[int, np.ndarray, float, str, float]] = []
    warnings: list[str] = []

    while True:
        t_track = perf_counter()
        method: MethodType = "pose_proxy"
        confidence = 0.0
        center_xy: tuple[float, float] | None = None
        candidate_box: tuple[float, float, float, float] | None = None

        for active_name, tracker in trackers:
            if gray.size == 0:
                continue
            ok_track, box = tracker.update(gray)
            if ok_track:
                bx, by, bw, bh = [float(v) for v in box]
                candidate_box = (bx, by, bw, bh)
                center_xy = (bx + bw / 2.0, by + bh / 2.0)
                method = active_name  # type: ignore[assignment]
                confidence = 0.9 if active_name == "csrt" else 0.8
                break

        if center_xy is None and features is not None and len(features) > 0:
            if prev_gray.size > 0 and gray.size > 0:
                next_pts, status, _ = cv2.calcOpticalFlowPyrLK(prev_gray, gray, features, None, **lk_params)
            else:
                next_pts, status = None, None
            if next_pts is not None and status is not None and np.any(status.reshape(-1) == 1):
                good = next_pts[status.reshape(-1) == 1].reshape(-1, 1, 2).astype(np.float32)
                features = good
                mx = float(np.mean(good[:, 0, 0]))
                my = float(np.mean(good[:, 0, 1]))
                center_xy = (mx, my)
                candidate_box = (mx - (w / 2.0), my - (h / 2.0), float(w), float(h))
                method = "optical_flow"
                confidence = 0.7

        if center_xy is None and template.size > 0:
            recovery_attempts += 1
            sx = 0
            sy = 0
            ex = track_w
            ey = track_h
            if prev_center is not None:
                radius = int(max(28, np.hypot(w, h) * 2.0))
                sx = max(0, int(prev_center[0] - radius))
                sy = max(0, int(prev_center[1] - radius))
                ex = min(track_w, int(prev_center[0] + radius))
                ey = min(track_h, int(prev_center[1] + radius))
            search = gray[sy:ey, sx:ex]
            if search.shape[0] >= h and search.shape[1] >= w:
                if search.size == 0 or template.size == 0:
                    resp = None
                else:
                    resp = cv2.matchTemplate(search, template, cv2.TM_CCOEFF_NORMED)
                if resp is None or resp.size == 0:
                    continue
                _, max_val, _, max_loc = cv2.minMaxLoc(resp)
                if max_val >= 0.45:
                    bx = float(sx + max_loc[0])
                    by = float(sy + max_loc[1])
                    candidate_box = (bx, by, float(w), float(h))
                    center_xy = (bx + (w / 2.0), by + (h / 2.0))
                    method = "template_recovery"
                    confidence = float(np.clip(max_val, 0.0, 1.0))

        if center_xy is not None and _should_reject_jump(prev_center, center_xy, max_jump_px):
            center_xy = None
            candidate_box = None
            confidence = 0.0

        processing_fps = 1.0 / max(1e-6, perf_counter() - t_track)
        fps_by_frame.append({"frame": frame_idx, "fps": float(processing_fps)})

        if center_xy is None:
            failures += 1
            lost_frames.append(frame_idx)
            bar_path_raw.append(
                {
                    "frame": frame_idx,
                    "time_sec": frame_idx / video_fps,
                    "x": None,
                    "y": None,
                    "confidence": 0.0,
                    "visible": False,
                }
            )
            methods.append("pose_proxy")
            tracked_boxes.append(
                {
                    "frame": frame_idx,
                    "time_sec": frame_idx / video_fps,
                    "x": None,
                    "y": None,
                    "width": full_roi_w,
                    "height": full_roi_h,
                    "confidence": 0.0,
                    "visible": False,
                }
            )
            tracking_records.append(
                {
                    "frame_index": frame_idx,
                    "timestamp": frame_idx / video_fps,
                    "bbox": {"x": None, "y": None, "w": full_roi_w, "h": full_roi_h},
                    "center_x": None,
                    "center_y": None,
                    "fps": float(processing_fps),
                    "tracking_success": False,
                }
            )
        else:
            cx = float(np.clip(center_xy[0] * (full_w / track_w), 0.0, full_w - 1.0))
            cy = float(np.clip(center_xy[1] * (full_h / track_h), 0.0, full_h - 1.0))
            bar_path_raw.append(
                {
                    "frame": frame_idx,
                    "time_sec": frame_idx / video_fps,
                    "x": cx,
                    "y": cy,
                    "confidence": confidence,
                    "visible": True,
                }
            )
            methods.append(method)
            tracked_boxes.append(
                {
                    "frame": frame_idx,
                    "time_sec": frame_idx / video_fps,
                    "x": float(np.clip(cx - (full_roi_w / 2.0), 0.0, max(0.0, full_w - full_roi_w))),
                    "y": float(np.clip(cy - (full_roi_h / 2.0), 0.0, max(0.0, full_h - full_roi_h))),
                    "width": full_roi_w,
                    "height": full_roi_h,
                    "confidence": confidence,
                    "visible": True,
                }
            )
            tracking_records.append(
                {
                    "frame_index": frame_idx,
                    "timestamp": frame_idx / video_fps,
                    "bbox": {
                        "x": float(np.clip(cx - (full_roi_w / 2.0), 0.0, max(0.0, full_w - full_roi_w))),
                        "y": float(np.clip(cy - (full_roi_h / 2.0), 0.0, max(0.0, full_h - full_roi_h))),
                        "w": full_roi_w,
                        "h": full_roi_h,
                    },
                    "center_x": cx,
                    "center_y": cy,
                    "fps": float(processing_fps),
                    "tracking_success": True,
                }
            )
            prev_center = center_xy
            if candidate_box is not None:
                bx, by, bw, bh = candidate_box
                x = int(np.clip(bx, 0.0, track_w - bw))
                y = int(np.clip(by, 0.0, track_h - bh))
                template = gray[y : y + h, x : x + w].copy()
                if template.size > 0:
                    features = cv2.goodFeaturesToTrack(template, maxCorners=20, qualityLevel=0.01, minDistance=4)
                    if features is not None:
                        features[:, 0, 0] += x
                        features[:, 0, 1] += y

        track_sec += perf_counter() - t_track

        if render_annotated_video and _is_valid_frame(frame):
            frames_for_export.append((frame_idx, frame.copy(), confidence, method, processing_fps))

        if frame_idx >= end_idx:
            break

        next_idx = min(end_idx, frame_idx + frame_stride)
        next_frame = None
        for _ in range(next_idx - frame_idx):
            t_decode = perf_counter()
            ok, next_frame = cap.read()
            decode_sec += perf_counter() - t_decode
            if not ok or not _is_valid_frame(next_frame):
                next_frame = None
                break
        if next_frame is None:
            break

        frame_idx = next_idx
        frame = next_frame
        prev_gray = gray
        gray = to_track_gray(frame)

    cap.release()

    bar_path_raw = _interpolate_short_gaps(bar_path_raw, max_gap=4)
    box_by_frame = {int(box["frame"]): box for box in tracked_boxes}
    for point in bar_path_raw:
        frame_no = int(point["frame"])
        existing_box = box_by_frame.get(frame_no)
        if existing_box and existing_box.get("x") is not None and existing_box.get("y") is not None:
            continue
        if point.get("x") is None or point.get("y") is None:
            continue
        cx = float(point["x"])
        cy = float(point["y"])
        box_by_frame[frame_no] = {
            "frame": frame_no,
            "time_sec": float(point["time_sec"]),
            "x": float(np.clip(cx - (full_roi_w / 2.0), 0.0, max(0.0, full_w - full_roi_w))),
            "y": float(np.clip(cy - (full_roi_h / 2.0), 0.0, max(0.0, full_h - full_roi_h))),
            "width": full_roi_w,
            "height": full_roi_h,
            "confidence": float(point.get("confidence") or 0.35),
            "visible": True,
        }
    tracked_boxes = [box_by_frame[int(p["frame"])] for p in bar_path_raw if int(p["frame"]) in box_by_frame]
    bar_path_smooth = _smooth_path_moving_average(bar_path_raw, window=5)

    valid_count = sum(1 for p in bar_path_raw if p["x"] is not None and p["y"] is not None)
    avg_processing_fps = float((valid_count / max(1e-6, track_sec + decode_sec))) if valid_count else 0.0
    method_counter = Counter(methods)
    tracking_method_used: MethodType = method_counter.most_common(1)[0][0] if method_counter else "pose_proxy"

    metrics = _calculate_metrics(bar_path_smooth if bar_path_smooth else bar_path_raw)
    quality = metrics["tracking_quality_score"]
    if failures > max(3, len(bar_path_raw) * 0.35):
        quality = max(0.0, quality * 0.6)
        warnings.append("Tracking experienced many lost frames; quality score was reduced.")
    if metrics["horizontal_deviation_px"] < 3.0 and metrics["vertical_range_px"] < 3.0 and len(bar_path_raw) > 12:
        quality = min(quality, 25.0)
        warnings.append(
            "Tracking appears static. The ROI may be locked onto background instead of the barbell endcap."
        )
    low_confidence_count = sum(1 for p in bar_path_raw if float(p.get("confidence") or 0.0) < 0.45)
    if low_confidence_count > max(3, len(bar_path_raw) * 0.2):
        warnings.append(
            "Tracking degraded. Try selecting a tighter ROI around the sleeve/endcap."
        )

    stage_timings = {
        "decode_seconds": round(decode_sec, 4),
        "tracking_seconds": round(track_sec, 4),
        "pose_seconds": 0.0,
        "render_seconds": 0.0,
        "encode_seconds": 0.0,
        "total_video_processing_seconds": round(perf_counter() - total_t0, 4),
    }

    tracking_csv_url = _write_tracking_csv(bar_path_raw)
    annotated_video_url = None
    if render_annotated_video and frames_for_export:
        t_encode = perf_counter()
        export_downscale = float(np.clip(export_downscale, 0.35, 1.0))
        fw = max(32, int(full_w * export_downscale))
        fh = max(32, int(full_h * export_downscale))
        fw -= fw % 2
        fh -= fh % 2
        out_name = f"barbell_tracking_{uuid4().hex}.mp4"
        out_path = TRACKING_EXPORT_DIR / out_name
        writer = cv2.VideoWriter(
            str(out_path),
            cv2.VideoWriter_fourcc(*"mp4v"),
            video_fps if video_fps > 0 else 30.0,
            (fw, fh),
        )
        if not writer.isOpened():
            writer = cv2.VideoWriter(
                str(out_path),
                cv2.VideoWriter_fourcc(*"avc1"),
                video_fps if video_fps > 0 else 30.0,
                (fw, fh),
            )
        if not writer.isOpened():
            raise RuntimeError("Could not open VideoWriter for processed output")
        smooth_by_frame = {int(p["frame"]): p for p in bar_path_smooth}
        box_by_frame = {int(b["frame"]): b for b in tracked_boxes}
        trail: list[tuple[int, int]] = []
        for f_no, canvas, conf, method, proc_fps in frames_for_export:
            t_render = perf_counter()
            if not _is_valid_frame(canvas):
                continue
            if export_downscale < 1.0:
                canvas = cv2.resize(canvas, (fw, fh), interpolation=cv2.INTER_AREA)
            p = smooth_by_frame.get(f_no)
            if p and p.get("x") is not None:
                cx = int(float(p["x"]) * (canvas.shape[1] / full_w))
                cy = int(float(p["y"]) * (canvas.shape[0] / full_h))
                trail.append((cx, cy))
                cv2.circle(canvas, (cx, cy), 6, (0, 255, 255), -1)
            box = box_by_frame.get(f_no)
            if box and box.get("x") is not None and box.get("y") is not None:
                bx = int(float(box["x"]) * (canvas.shape[1] / full_w))
                by = int(float(box["y"]) * (canvas.shape[0] / full_h))
                bw = max(8, int(float(box["width"]) * (canvas.shape[1] / full_w)))
                bh = max(8, int(float(box["height"]) * (canvas.shape[0] / full_h)))
                cv2.rectangle(canvas, (bx, by), (min(canvas.shape[1] - 1, bx + bw), min(canvas.shape[0] - 1, by + bh)), (0, 255, 120), 2)
            for i in range(1, len(trail)):
                cv2.line(canvas, trail[i - 1], trail[i], (30, 120, 255), 2)
            if not p or p.get("x") is None or p.get("y") is None:
                cv2.putText(canvas, "Tracking lost", (18, 180), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
            cv2.putText(canvas, f"Frame: {f_no}", (18, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            cv2.putText(canvas, f"Time: {f_no / max(1e-6, video_fps):.2f}s", (18, 155), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            cv2.putText(canvas, f"Video FPS: {video_fps:.1f}", (18, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            cv2.putText(canvas, f"Proc FPS: {proc_fps:.1f}", (18, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            cv2.putText(canvas, f"Method: {method}", (18, 80), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            cv2.putText(canvas, f"Conf: {conf:.2f}", (18, 105), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
            writer.write(canvas)
            render_sec += perf_counter() - t_render
        writer.release()
        encode_sec += perf_counter() - t_encode
        stage_timings["render_seconds"] = round(render_sec, 4)
        stage_timings["encode_seconds"] = round(encode_sec, 4)
        annotated_video_url = f"/static/tracking/{out_name}"

    timing_log_url = write_timing_log(
        {
            "video_path": video_path,
            "tracker_type": tracker_type,
            "tracking_method_used": tracking_method_used,
            "frame_stride": frame_stride,
            "analysis_downscale": analysis_downscale,
            "tracking_failures": failures,
            "stage_timings": stage_timings,
            "average_processing_fps": avg_processing_fps,
            "video_fps": video_fps,
            "debug": {
                "roi_px": {"x": init_x, "y": init_y, "w": init_w, "h": init_h},
                "tracker_init_frame": start_frame,
                "frame_count_tracked": len(bar_path_raw),
                "lost_frames": len(lost_frames),
                "recovery_attempts": recovery_attempts,
                "movement_range": {
                    "horizontal_deviation_px": metrics["horizontal_deviation_px"],
                    "vertical_range_px": metrics["vertical_range_px"],
                },
            },
        },
        prefix="tracking",
    )

    path_metrics = {
        "vertical_displacement": metrics["vertical_range_px"],
        "horizontal_drift": metrics["horizontal_deviation_px"],
        "path_smoothness": float(np.std(np.diff([float(p["x"]) for p in bar_path_smooth], prepend=0))) if len(bar_path_smooth) > 2 else 0.0,
    }

    return {
        "tracked_path": bar_path_smooth,
        "raw_tracked_path": bar_path_raw,
        "smoothed_tracked_path": bar_path_smooth,
        "tracked_boxes": tracked_boxes,
        "bar_path_raw": bar_path_raw,
        "bar_path_smooth": bar_path_smooth,
        "tracking_method_used": tracking_method_used,
        "tracking_quality_score": round(float(quality), 2),
        "tracking_failures": int(failures),
        "average_processing_fps": round(avg_processing_fps, 3),
        "average_fps": round(avg_processing_fps, 3),
        "video_fps": round(video_fps, 3),
        "horizontal_deviation_px": round(metrics["horizontal_deviation_px"], 3),
        "vertical_range_px": round(metrics["vertical_range_px"], 3),
        "fps_by_frame": fps_by_frame,
        "tracking_records": tracking_records,
        "tracking_success_rate": float(valid_count / len(bar_path_raw)) if bar_path_raw else 0.0,
        "path_metrics": path_metrics,
        "lost_frames": lost_frames,
        "tracker_type": tracker_type,
        "start_frame": start_frame,
        "start_time_seconds": float(start_frame / video_fps) if video_fps > 0 else 0.0,
        "end_frame": int(bar_path_raw[-1]["frame"]) if bar_path_raw else start_frame,
        "tracking_csv_url": tracking_csv_url,
        "annotated_video_url": annotated_video_url,
        "stage_timings": stage_timings,
        "timing_log_url": timing_log_url,
        "warnings": warnings,
        "debug": {
            "roi_px": {"x": init_x, "y": init_y, "w": init_w, "h": init_h},
            "tracker_initialization_frame": start_frame,
            "frame_count_tracked": len(bar_path_raw),
            "lost_frames_count": len(lost_frames),
            "recovery_attempts": recovery_attempts,
            "movement_range": {
                "horizontal_deviation_px": round(metrics["horizontal_deviation_px"], 3),
                "vertical_range_px": round(metrics["vertical_range_px"], 3),
            },
        },
    }


def track_barbell_from_time(
    video_path: str,
    start_time: float,
    start_frame: int | None,
    roi: dict[str, Any],
    tracker_type: str = "KCF",
) -> dict[str, Any]:
    if not os.path.exists(video_path):
        raise FileNotFoundError(f"Video not found: {video_path}")
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {video_path}")
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    logger.info(
        "track_barbell_from_time: path=%s fps=%.3f frame_count=%s width=%s height=%s start_time=%.3f roi=%s tracker=%s",
        video_path,
        fps,
        frame_count,
        width,
        height,
        start_time,
        roi,
        tracker_type,
    )
    cap.release()
    start_frame_from_time = int(max(0, round(start_time * fps)))
    requested_start_frame = start_frame_from_time if start_frame is None else int(max(0, start_frame))
    safe_start_frame = min(requested_start_frame, max(0, frame_count - 1))
    x, y, w, h = validate_roi(roi, width, height)
    return track_barbell_path(
        video_path=video_path,
        anchor_x=(x + (w / 2)) / max(1, width),
        anchor_y=(y + (h / 2)) / max(1, height),
        start_frame=safe_start_frame,
        roi_x=x / max(1, width),
        roi_y=y / max(1, height),
        roi_w=w / max(1, width),
        roi_h=h / max(1, height),
        tracker_type="kcf" if tracker_type.lower() == "kcf" else "csrt",
        frame_stride=1,
        analysis_downscale=1.0,
        render_annotated_video=True,
        export_downscale=1.0,
    )
