from __future__ import annotations

from typing import Any
import cv2
import numpy as np


def track_barbell_path(
    video_path: str,
    anchor_x: float,
    anchor_y: float,
    start_frame: int = 0,
    max_points: int = 1,
) -> list[dict[str, float]]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError("Unable to open video for tracking")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if total_frames <= 0:
        cap.release()
        return []

    frame_index = max(0, min(start_frame, total_frames - 1))
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
    ok, frame = cap.read()
    if not ok or frame is None:
        cap.release()
        raise ValueError("Unable to read start frame for tracking")

    h, w = frame.shape[:2]
    px = float(np.clip(anchor_x, 0.0, 1.0) * w)
    py = float(np.clip(anchor_y, 0.0, 1.0) * h)

    prev_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    points = np.array([[[px, py]]], dtype=np.float32)

    lk_params: dict[str, Any] = {
        "winSize": (21, 21),
        "maxLevel": 3,
        "criteria": (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 20, 0.03),
    }

    tracked: list[dict[str, float]] = []

    while True:
        if points is not None and len(points) > 0:
            mean_x = float(np.mean(points[:, 0, 0]))
            mean_y = float(np.mean(points[:, 0, 1]))
            tracked.append(
                {
                    "frame": float(frame_index),
                    "x": float(np.clip(mean_x / w, 0.0, 1.0)),
                    "y": float(np.clip(mean_y / h, 0.0, 1.0)),
                }
            )

        ok, frame = cap.read()
        if not ok or frame is None:
            break

        frame_index += 1
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        if points is None or len(points) == 0:
            break

        next_points, status, _ = cv2.calcOpticalFlowPyrLK(prev_gray, gray, points, None, **lk_params)
        if next_points is None or status is None:
            break

        good = next_points[status.reshape(-1) == 1]
        if len(good) == 0:
            break

        if len(good) > max_points:
            good = good[:max_points]

        points = good.reshape(-1, 1, 2).astype(np.float32)
        prev_gray = gray

    cap.release()
    return tracked
