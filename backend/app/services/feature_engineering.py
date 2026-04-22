from typing import Dict, Any, Optional, List
import math
from ..utils.geometry import calculate_angle, safe_average


def _is_valid_point(point: Optional[Dict[str, Any]]) -> bool:
    if not point:
        return False
    for coord in ("x", "y"):
        value = point.get(coord)
        if value is None:
            return False
        if isinstance(value, float) and not math.isfinite(value):
            return False
    return True


def _angle_if_possible(a: Optional[Dict[str, Any]], b: Optional[Dict[str, Any]], c: Optional[Dict[str, Any]]) -> Optional[float]:
    if not (_is_valid_point(a) and _is_valid_point(b) and _is_valid_point(c)):
        return None
    angle = calculate_angle(a, b, c)
    if angle is None or (isinstance(angle, float) and not math.isfinite(angle)):
        return None
    return angle


def get_average_point(landmarks: Dict[str, Any], left_key: str, right_key: str) -> Optional[Dict[str, float]]:
    left = landmarks.get(left_key)
    right = landmarks.get(right_key)
    if not (_is_valid_point(left) and _is_valid_point(right)):
        return None

    z_left = left.get("z")
    z_right = right.get("z")
    vis_left = left.get("visibility")
    vis_right = right.get("visibility")

    return {
        "x": (left["x"] + right["x"]) / 2.0,
        "y": (left["y"] + right["y"]) / 2.0,
        "z": safe_average([z_left, z_right]),
        "visibility": safe_average([vis_left, vis_right]),
    }


def compute_frame_metrics(frame: Dict[str, Any]) -> Dict[str, Optional[float]]:
    landmarks = frame["landmarks"]

    left_knee_angle = _angle_if_possible(
        landmarks.get("left_hip"), landmarks.get("left_knee"), landmarks.get("left_ankle")
    )
    right_knee_angle = _angle_if_possible(
        landmarks.get("right_hip"), landmarks.get("right_knee"), landmarks.get("right_ankle")
    )
    avg_knee_angle = safe_average([left_knee_angle, right_knee_angle])

    left_hip_angle = _angle_if_possible(
        landmarks.get("left_shoulder"), landmarks.get("left_hip"), landmarks.get("left_knee")
    )
    right_hip_angle = _angle_if_possible(
        landmarks.get("right_shoulder"), landmarks.get("right_hip"), landmarks.get("right_knee")
    )
    avg_hip_angle = safe_average([left_hip_angle, right_hip_angle])

    shoulder_mid = get_average_point(landmarks, "left_shoulder", "right_shoulder")
    hip_mid = get_average_point(landmarks, "left_hip", "right_hip")
    knee_mid = get_average_point(landmarks, "left_knee", "right_knee")

    torso_lean = _angle_if_possible(shoulder_mid, hip_mid, knee_mid)

    hip_to_knee_delta = None
    if hip_mid and knee_mid:
        hip_to_knee_delta = hip_mid["y"] - knee_mid["y"]

    left_heel = landmarks.get("left_heel")
    right_heel = landmarks.get("right_heel")
    left_toe = landmarks.get("left_foot_index")
    right_toe = landmarks.get("right_foot_index")

    avg_heel_y = safe_average([
        left_heel.get("y") if _is_valid_point(left_heel) else None,
        right_heel.get("y") if _is_valid_point(right_heel) else None,
    ])
    avg_foot_index_y = safe_average([
        left_toe.get("y") if _is_valid_point(left_toe) else None,
        right_toe.get("y") if _is_valid_point(right_toe) else None,
    ])

    heel_lift_from_floor = None
    if avg_heel_y is not None and avg_foot_index_y is not None:
        # With image-normalized coordinates, y increases toward the floor.
        # Positive value indicates heel is higher than forefoot (possible heel rise).
        heel_lift_from_floor = avg_foot_index_y - avg_heel_y

    return {
        "knee_angle": avg_knee_angle,
        "hip_angle": avg_hip_angle,
        "torso_lean": torso_lean,
        "hip_to_knee_delta": hip_to_knee_delta,
        "avg_heel_y": avg_heel_y,
        "avg_foot_index_y": avg_foot_index_y,
        "heel_lift_from_floor": heel_lift_from_floor,
    }


def compute_rep_features(smoothed_landmarks: List[Dict[str, Any]], rep: Dict[str, int], fps: float) -> Dict[str, Optional[float]]:
    start_frame = rep["start_frame"]
    end_frame = rep["end_frame"]

    rep_frames = smoothed_landmarks[start_frame:end_frame + 1]
    metrics_per_frame = [compute_frame_metrics(frame) for frame in rep_frames]

    knee_angles = [m["knee_angle"] for m in metrics_per_frame if m["knee_angle"] is not None]
    hip_angles = [m["hip_angle"] for m in metrics_per_frame if m["hip_angle"] is not None]
    torso_leans = [m["torso_lean"] for m in metrics_per_frame if m["torso_lean"] is not None]
    heel_lifts = [m["heel_lift_from_floor"] for m in metrics_per_frame if m["heel_lift_from_floor"] is not None]

    bottom_frame = rep["bottom_frame"]
    bottom_metrics = compute_frame_metrics(smoothed_landmarks[bottom_frame])
    start_metrics = compute_frame_metrics(smoothed_landmarks[start_frame])

    rep_duration_sec = (end_frame - start_frame + 1) / fps if fps > 0 else None
    baseline_heel_lift = start_metrics["heel_lift_from_floor"]
    max_heel_lift_from_baseline = None
    if heel_lifts and baseline_heel_lift is not None:
        max_heel_lift_from_baseline = max(heel_lifts) - baseline_heel_lift

    return {
        "min_knee_angle": min(knee_angles) if knee_angles else None,
        "min_hip_angle": min(hip_angles) if hip_angles else None,
        "max_torso_lean": max(torso_leans) if torso_leans else None,
        "bottom_hip_to_knee_delta": bottom_metrics["hip_to_knee_delta"],
        "rep_duration_sec": rep_duration_sec,
        "max_heel_lift_from_baseline": max_heel_lift_from_baseline,
    }
