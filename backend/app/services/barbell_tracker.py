from __future__ import annotations

from time import perf_counter
from typing import Any, Literal

import cv2
import numpy as np

TrackerType = Literal["optical_flow", "kcf", "csrt"]


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
) -> dict[str, Any]:
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

    frame_index = max(0, min(start_frame, total_frames - 1))
    final_frame = total_frames - 1 if end_frame is None else max(frame_index, min(end_frame, total_frames - 1))
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
    ok, frame = cap.read()
    if not ok or frame is None:
        cap.release()
        raise ValueError("Unable to read start frame for tracking")

    h, w = frame.shape[:2]
    px = float(np.clip(anchor_x, 0.0, 1.0) * w)
    py = float(np.clip(anchor_y, 0.0, 1.0) * h)

    raw_tracked: list[dict[str, float | int | bool]] = []
    tracked_boxes: list[dict[str, float | int | bool | None]] = []
    fps_by_frame: list[dict[str, float | int]] = []
    lost_frames: list[int] = []

    if tracker_type == "optical_flow":
        prev_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        points = np.array([[[px, py]]], dtype=np.float32)

        lk_params: dict[str, Any] = {
            "winSize": (21, 21),
            "maxLevel": 3,
            "criteria": (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 20, 0.03),
        }

        while True:
            start_ts = perf_counter()

            visible = points is not None and len(points) > 0
            if visible:
                mean_x = float(np.mean(points[:, 0, 0]))
                mean_y = float(np.mean(points[:, 0, 1]))
                bw_px = max(8, int(np.clip(bbox_width, 0.01, 0.25) * w))
                bh_px = max(8, int(np.clip(bbox_height, 0.01, 0.25) * h))
                bx_px = max(0.0, min(float(w - bw_px), mean_x - (bw_px / 2.0)))
                by_px = max(0.0, min(float(h - bh_px), mean_y - (bh_px / 2.0)))
                raw_tracked.append(
                    {
                        "frame": frame_index,
                        "x": float(np.clip(mean_x / w, 0.0, 1.0)),
                        "y": float(np.clip(mean_y / h, 0.0, 1.0)),
                        "confidence": 1.0,
                        "visible": True,
                    }
                )
                tracked_boxes.append(
                    {
                        "frame": frame_index,
                        "x": float(np.clip(bx_px / w, 0.0, 1.0)),
                        "y": float(np.clip(by_px / h, 0.0, 1.0)),
                        "w": float(np.clip(bw_px / w, 0.0, 1.0)),
                        "h": float(np.clip(bh_px / h, 0.0, 1.0)),
                        "visible": True,
                    }
                )
            else:
                raw_tracked.append({"frame": frame_index, "x": None, "y": None, "confidence": 0.0, "visible": False})
                tracked_boxes.append({"frame": frame_index, "x": None, "y": None, "w": None, "h": None, "visible": False})
                lost_frames.append(frame_index)

            if frame_index >= final_frame:
                fps_by_frame.append({"frame": frame_index, "fps": 0.0})
                break

            ok, next_frame = cap.read()
            elapsed = perf_counter() - start_ts
            fps_by_frame.append({"frame": frame_index, "fps": (1.0 / elapsed) if elapsed > 0 else 0.0})

            if not ok or next_frame is None:
                break

            frame_index += 1
            gray = cv2.cvtColor(next_frame, cv2.COLOR_BGR2GRAY)

            if points is None or len(points) == 0:
                points = None
                prev_gray = gray
                frame = next_frame
                continue

            next_points, status, err = cv2.calcOpticalFlowPyrLK(prev_gray, gray, points, None, **lk_params)
            if next_points is None or status is None:
                points = None
                prev_gray = gray
                frame = next_frame
                continue

            good_mask = status.reshape(-1) == 1
            if np.any(good_mask):
                good = next_points[good_mask]
                points = good.reshape(-1, 1, 2).astype(np.float32)
                if err is not None:
                    tracked_err = err.reshape(-1)[good_mask]
                    conf = float(np.clip(1.0 - np.mean(tracked_err) / 30.0, 0.0, 1.0))
                    raw_tracked[-1]["confidence"] = conf
            else:
                points = None

            prev_gray = gray
            frame = next_frame

    else:
        tracker = _create_tracker(tracker_type)
        if None not in {roi_x, roi_y, roi_w, roi_h}:
            bw = max(8, int(np.clip(float(roi_w), 0.01, 1.0) * w))
            bh = max(8, int(np.clip(float(roi_h), 0.01, 1.0) * h))
            x0 = max(0, min(w - bw, int(np.clip(float(roi_x), 0.0, 1.0) * w)))
            y0 = max(0, min(h - bh, int(np.clip(float(roi_y), 0.0, 1.0) * h)))
        else:
            bw = max(8, int(np.clip(bbox_width, 0.01, 0.25) * w))
            bh = max(8, int(np.clip(bbox_height, 0.01, 0.25) * h))
            x0 = max(0, min(w - bw, int(px - bw / 2)))
            y0 = max(0, min(h - bh, int(py - bh / 2)))
        init_box = (x0, y0, bw, bh)
        tracker.init(frame, init_box)

        while True:
            start_ts = perf_counter()
            ok_box, box = tracker.update(frame)

            if ok_box:
                bx, by, bw, bh = box
                cx = float(np.clip((bx + bw / 2.0) / w, 0.0, 1.0))
                cy = float(np.clip((by + bh / 2.0) / h, 0.0, 1.0))
                raw_tracked.append({"frame": frame_index, "x": cx, "y": cy, "confidence": 1.0, "visible": True})
                tracked_boxes.append(
                    {
                        "frame": frame_index,
                        "x": float(np.clip(bx / w, 0.0, 1.0)),
                        "y": float(np.clip(by / h, 0.0, 1.0)),
                        "w": float(np.clip(bw / w, 0.0, 1.0)),
                        "h": float(np.clip(bh / h, 0.0, 1.0)),
                        "visible": True,
                    }
                )
            else:
                raw_tracked.append({"frame": frame_index, "x": None, "y": None, "confidence": 0.0, "visible": False})
                tracked_boxes.append({"frame": frame_index, "x": None, "y": None, "w": None, "h": None, "visible": False})
                lost_frames.append(frame_index)

            if frame_index >= final_frame:
                fps_by_frame.append({"frame": frame_index, "fps": 0.0})
                break

            ok, frame = cap.read()
            elapsed = perf_counter() - start_ts
            fps_by_frame.append({"frame": frame_index, "fps": (1.0 / elapsed) if elapsed > 0 else 0.0})

            if not ok or frame is None:
                break

            frame_index += 1

    cap.release()

    smoothed_tracked = _smooth_visible_points(raw_tracked, alpha=0.28)
    visible_count = sum(1 for point in raw_tracked if point["visible"])
    total_count = len(raw_tracked)
    success_rate = (visible_count / total_count) if total_count else 0.0
    average_fps = (
        float(sum(item["fps"] for item in fps_by_frame) / len(fps_by_frame)) if fps_by_frame else 0.0
    )

    end_frame = int(raw_tracked[-1]["frame"]) if raw_tracked else frame_index
    return {
        "tracked_path": smoothed_tracked,
        "raw_tracked_path": raw_tracked,
        "smoothed_tracked_path": smoothed_tracked,
        "tracked_boxes": tracked_boxes,
        "fps_by_frame": fps_by_frame,
        "average_fps": average_fps,
        "tracking_success_rate": success_rate,
        "lost_frames": lost_frames,
        "tracker_type": tracker_type,
        "start_frame": start_frame,
        "end_frame": end_frame,
    }
