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
) -> List[tuple[int, int]]:
    pixels: List[tuple[int, int]] = []
    for point in path_points:
        if point.get("x") is None or point.get("y") is None:
            continue
        pixels.append((int(point["x"] * width), int(point["y"] * height)))
    return pixels


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

    # Draw tracked landmarks
    for point in landmarks.values():
        x, y = _point_to_pixel(point, width, height)
        cv2.circle(overlay, (x, y), 4, (0, 255, 0), -1)


    if path_points:
        path_pixels = _compute_midpoint_path_pixels(path_points, width, height)
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
        cv2.circle(overlay, (x, y), 8, (0, 0, 255), 2)

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
