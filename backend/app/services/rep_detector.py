from typing import List, Dict, Any, Optional
from . import feature_engineering as fe


def _average_hip_y(frame: Dict[str, Any]) -> Optional[float]:
    avg_hip = fe.get_average_point(frame["landmarks"], "left_hip", "right_hip")
    return avg_hip["y"] if avg_hip else None


def detect_squat_reps(smoothed_landmarks: List[Dict[str, Any]], fps: float) -> List[Dict[str, int]]:
    """
    Detect multiple squat reps using a simple knee-angle state machine.

    State transitions (with hysteresis):
    - down when knee angle < 105
    - up when knee angle > 155

    During each down phase, the frame with max average hip y is treated as the bottom.
    """
    if len(smoothed_landmarks) < 10:
        return []

    min_phase_frames = max(int(0.15 * fps), 3) if fps > 0 else 3
    min_rep_frames = max(int(0.5 * fps), 8) if fps > 0 else 8

    reps: List[Dict[str, int]] = []

    state = "up"
    state_count = 0
    rep_start = None
    bottom_frame = None
    bottom_hip_y = None

    for i, frame in enumerate(smoothed_landmarks):
        metrics = fe.compute_frame_metrics(frame)
        knee_angle = metrics.get("knee_angle")
        hip_y = _average_hip_y(frame)

        if knee_angle is None:
            state_count = 0
            continue

        is_down = knee_angle < 105
        is_up = knee_angle > 155

        if state == "up":
            if is_down:
                state_count += 1
                if state_count >= min_phase_frames:
                    state = "down"
                    rep_start = max(i - state_count + 1, 0)
                    bottom_frame = i
                    bottom_hip_y = hip_y
                    state_count = 0
            else:
                state_count = 0

        else:  # state == "down"
            if hip_y is not None and (bottom_hip_y is None or hip_y > bottom_hip_y):
                bottom_hip_y = hip_y
                bottom_frame = i

            if is_up:
                state_count += 1
                if state_count >= min_phase_frames and rep_start is not None and bottom_frame is not None:
                    rep_end = i
                    if rep_end - rep_start + 1 >= min_rep_frames:
                        reps.append({
                            "rep_index": len(reps) + 1,
                            "start_frame": rep_start,
                            "bottom_frame": bottom_frame,
                            "end_frame": rep_end,
                        })
                    state = "up"
                    state_count = 0
                    rep_start = None
                    bottom_frame = None
                    bottom_hip_y = None
            else:
                state_count = 0

    # Fallback: if no complete transitions are found, return a single deepest-window rep
    if reps:
        return reps

    hip_series = [_average_hip_y(frame) for frame in smoothed_landmarks]
    valid_indices = [i for i, y in enumerate(hip_series) if y is not None]
    if len(valid_indices) < 10:
        return []

    valid_values = [hip_series[i] for i in valid_indices]
    deepest = valid_indices[valid_values.index(max(valid_values))]
    margin = max(int(fps * 0.75), 8) if fps > 0 else 8

    return [{
        "rep_index": 1,
        "start_frame": max(deepest - margin, 0),
        "bottom_frame": deepest,
        "end_frame": min(deepest + margin, len(smoothed_landmarks) - 1),
    }]
