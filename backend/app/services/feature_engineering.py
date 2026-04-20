from typing import Dict, Any, Optional, List
from ..utils.geometry import calculate_angle, safe_average


def get_average_point(landmarks: Dict[str, Any], left_key: str, right_key: str) -> Optional[Dict[str, float]]:
    left = landmarks.get(left_key)
    right = landmarks.get(right_key)
    if not left or not right:
        return None

    return {
        "x": (left["x"] + right["x"]) / 2.0,
        "y": (left["y"] + right["y"]) / 2.0,
        "z": (left["z"] + right["z"]) / 2.0,
        "visibility": (left["visibility"] + right["visibility"]) / 2.0,
    }


def compute_frame_metrics(frame: Dict[str, Any]) -> Dict[str, Optional[float]]:
    landmarks = frame["landmarks"]

    required = [
        "left_shoulder", "right_shoulder",
        "left_hip", "right_hip",
        "left_knee", "right_knee",
        "left_ankle", "right_ankle",
    ]
    if not all(k in landmarks for k in required):
        return {
            "knee_angle": None,
            "hip_angle": None,
            "torso_lean": None,
            "hip_to_knee_delta": None,
        }

    left_knee_angle = calculate_angle(
        landmarks["left_hip"], landmarks["left_knee"], landmarks["left_ankle"]
    )
    right_knee_angle = calculate_angle(
        landmarks["right_hip"], landmarks["right_knee"], landmarks["right_ankle"]
    )
    avg_knee_angle = safe_average([left_knee_angle, right_knee_angle])

    left_hip_angle = calculate_angle(
        landmarks["left_shoulder"], landmarks["left_hip"], landmarks["left_knee"]
    )
    right_hip_angle = calculate_angle(
        landmarks["right_shoulder"], landmarks["right_hip"], landmarks["right_knee"]
    )
    avg_hip_angle = safe_average([left_hip_angle, right_hip_angle])

    shoulder_mid = get_average_point(landmarks, "left_shoulder", "right_shoulder")
    hip_mid = get_average_point(landmarks, "left_hip", "right_hip")
    knee_mid = get_average_point(landmarks, "left_knee", "right_knee")

    torso_lean = None
    if shoulder_mid and hip_mid and knee_mid:
        torso_lean = calculate_angle(shoulder_mid, hip_mid, knee_mid)

    hip_to_knee_delta = None
    if hip_mid and knee_mid:
        hip_to_knee_delta = hip_mid["y"] - knee_mid["y"]

    return {
        "knee_angle": avg_knee_angle,
        "hip_angle": avg_hip_angle,
        "torso_lean": torso_lean,
        "hip_to_knee_delta": hip_to_knee_delta,
    }


def compute_rep_features(smoothed_landmarks: List[Dict[str, Any]], rep: Dict[str, int], fps: float) -> Dict[str, Optional[float]]:
    start_frame = rep["start_frame"]
    end_frame = rep["end_frame"]

    rep_frames = smoothed_landmarks[start_frame:end_frame + 1]
    metrics_per_frame = [compute_frame_metrics(frame) for frame in rep_frames]

    knee_angles = [m["knee_angle"] for m in metrics_per_frame if m["knee_angle"] is not None]
    hip_angles = [m["hip_angle"] for m in metrics_per_frame if m["hip_angle"] is not None]
    torso_leans = [m["torso_lean"] for m in metrics_per_frame if m["torso_lean"] is not None]

    bottom_frame = rep["bottom_frame"]
    bottom_metrics = compute_frame_metrics(smoothed_landmarks[bottom_frame])

    rep_duration_sec = (end_frame - start_frame + 1) / fps if fps > 0 else None

    return {
        "min_knee_angle": min(knee_angles) if knee_angles else None,
        "min_hip_angle": min(hip_angles) if hip_angles else None,
        "max_torso_lean": max(torso_leans) if torso_leans else None,
        "bottom_hip_to_knee_delta": bottom_metrics["hip_to_knee_delta"],
        "rep_duration_sec": rep_duration_sec,
    }