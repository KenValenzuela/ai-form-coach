from typing import List, Dict, Any
from . import feature_engineering as fe


def detect_squat_reps(smoothed_landmarks: List[Dict[str, Any]], fps: float) -> List[Dict[str, int]]:
    """
    MVP: detect the deepest single rep based on average hip Y.
    MediaPipe image coordinates increase downward, so deeper squat => larger hip y.
    """
    if len(smoothed_landmarks) < 10:
        return []

    hip_series = []
    for frame in smoothed_landmarks:
        avg_hip = fe.get_average_point(frame["landmarks"], "left_hip", "right_hip")
        hip_series.append(avg_hip["y"] if avg_hip else None)

    valid_indices = [i for i, y in enumerate(hip_series) if y is not None]
    if len(valid_indices) < 10:
        return []

    valid_values = [hip_series[i] for i in valid_indices]
    bottom_frame = valid_indices[valid_values.index(max(valid_values))]

    margin = max(int(fps * 0.75), 8)
    start_frame = max(bottom_frame - margin, 0)
    end_frame = min(bottom_frame + margin, len(smoothed_landmarks) - 1)

    return [{
        "rep_index": 1,
        "start_frame": start_frame,
        "bottom_frame": bottom_frame,
        "end_frame": end_frame,
    }]