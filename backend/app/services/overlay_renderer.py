from __future__ import annotations

from pathlib import Path
from typing import Dict, Any, List, Optional
from uuid import uuid4

import cv2

OVERLAY_DIR = Path("app/data/overlays")
OVERLAY_DIR.mkdir(parents=True, exist_ok=True)

JOINT_HIGHLIGHTS = {
    "insufficient_depth": ["left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle"],
    "excessive_forward_lean": ["left_shoulder", "right_shoulder", "left_hip", "right_hip"],
    "poor_control": ["left_knee", "right_knee", "left_hip", "right_hip"],
    "heel_lift": ["left_heel", "right_heel", "left_foot_index", "right_foot_index"],
}


def _point_to_pixel(point: Dict[str, float], width: int, height: int) -> tuple[int, int]:
    return int(point["x"] * width), int(point["y"] * height)


def _compute_midpoint_path_pixels(
    path_points: List[Dict[str, float]],
    width: int,
    height: int,
    bbox: Optional[tuple[int, int, int, int]] = None,
) -> List[tuple[int, int]]:
    pixels: List[tuple[int, int]] = []
    for point in path_points:
        if point.get("x") is None or point.get("y") is None:
            continue
        px = int(point["x"] * width)
        py = int(point["y"] * height)
        if bbox:
            x_min, y_min, x_max, y_max = bbox
            if not (x_min <= px <= x_max and y_min <= py <= y_max):
                continue
        pixels.append((px, py))
    return pixels


def _compute_subject_bbox(
    landmarks: Dict[str, Dict[str, float]],
    width: int,
    height: int,
    padding_ratio: float = 0.12,
) -> Optional[tuple[int, int, int, int]]:
    valid_points: List[tuple[int, int]] = []
    for point in landmarks.values():
        x = point.get("x")
        y = point.get("y")
        if x is None or y is None:
            continue
        if not (0.0 <= x <= 1.0 and 0.0 <= y <= 1.0):
            continue
        valid_points.append((int(x * width), int(y * height)))

    if not valid_points:
        return None

    x_values = [p[0] for p in valid_points]
    y_values = [p[1] for p in valid_points]

    x_min = min(x_values)
    x_max = max(x_values)
    y_min = min(y_values)
    y_max = max(y_values)

    pad_x = max(int((x_max - x_min) * padding_ratio), 20)
    pad_y = max(int((y_max - y_min) * padding_ratio), 20)

    return (
        max(0, x_min - pad_x),
        max(0, y_min - pad_y),
        min(width - 1, x_max + pad_x),
        min(height - 1, y_max + pad_y),
    )


def render_overlay_image(
    frame: Any,
    landmarks: Dict[str, Dict[str, float]],
    issues: List[Dict[str, str]],
    rep_index: int,
    path_points: Optional[List[Dict[str, float]]] = None,
) -> str:
    """
    Render a simple pose overlay and highlighted joints for detected issues.
    Returns a web URL that can be served from FastAPI static files.
    """
    overlay = frame.copy()
    height, width = overlay.shape[:2]
    subject_bbox = _compute_subject_bbox(landmarks, width, height)

    # Draw tracked landmarks
    for point in landmarks.values():
        x, y = _point_to_pixel(point, width, height)
        if subject_bbox:
            x_min, y_min, x_max, y_max = subject_bbox
            if not (x_min <= x <= x_max and y_min <= y <= y_max):
                continue
        cv2.circle(overlay, (x, y), 4, (0, 255, 0), -1)


    if path_points:
        path_pixels = _compute_midpoint_path_pixels(path_points, width, height, bbox=subject_bbox)
        for i in range(1, len(path_pixels)):
            cv2.line(overlay, path_pixels[i - 1], path_pixels[i], (0, 0, 255), 2)
        if path_pixels:
            cv2.circle(overlay, path_pixels[-1], 4, (0, 0, 255), -1)

    # Highlight joints relevant to detected issues
    highlighted = set()
    for issue in issues:
        highlighted.update(JOINT_HIGHLIGHTS.get(issue["label"], []))

    for key in highlighted:
        point = landmarks.get(key)
        if not point:
            continue
        x, y = _point_to_pixel(point, width, height)
        if subject_bbox:
            x_min, y_min, x_max, y_max = subject_bbox
            if not (x_min <= x <= x_max and y_min <= y <= y_max):
                continue
        cv2.circle(overlay, (x, y), 8, (0, 0, 255), 2)

    if subject_bbox:
        x_min, y_min, x_max, y_max = subject_bbox
        cv2.rectangle(overlay, (x_min, y_min), (x_max, y_max), (255, 255, 0), 2)

    issue_text = ", ".join([issue["label"] for issue in issues]) if issues else "acceptable_form"
    cv2.putText(
        overlay,
        f"rep_{rep_index}: {issue_text}",
        (20, 40),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.8,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )

    filename = f"overlay_{uuid4().hex}.jpg"
    out_path = OVERLAY_DIR / filename
    cv2.imwrite(str(out_path), overlay)
    return f"/static/overlays/{filename}"
