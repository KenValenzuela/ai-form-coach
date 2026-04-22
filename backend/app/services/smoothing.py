from typing import List, Dict, Any
import pandas as pd

TRACKED_KEYS = [
    "left_shoulder", "right_shoulder",
    "left_hip", "right_hip",
    "left_knee", "right_knee",
    "left_ankle", "right_ankle",
    "left_heel", "right_heel",
    "left_foot_index", "right_foot_index",
]


def smooth_landmarks(raw_landmarks: List[Dict[str, Any]], window: int = 5) -> List[Dict[str, Any]]:
    if not raw_landmarks:
        return raw_landmarks

    rows = []
    for frame in raw_landmarks:
        row = {"frame_index": frame["frame_index"]}
        for key in TRACKED_KEYS:
            point = frame["landmarks"].get(key)
            row[f"{key}_x"] = point["x"] if point else None
            row[f"{key}_y"] = point["y"] if point else None
            row[f"{key}_z"] = point["z"] if point else None
            row[f"{key}_visibility"] = point["visibility"] if point else None
        rows.append(row)

    df = pd.DataFrame(rows)

    for col in df.columns:
        if col != "frame_index":
            df[col] = df[col].interpolate(limit_direction="both")
            df[col] = df[col].rolling(window=window, center=True, min_periods=1).mean()

    smoothed = []
    for _, row in df.iterrows():
        frame_data = {
            "frame_index": int(row["frame_index"]),
            "landmarks": {},
        }
        for key in TRACKED_KEYS:
            frame_data["landmarks"][key] = {
                "x": float(row[f"{key}_x"]),
                "y": float(row[f"{key}_y"]),
                "z": float(row[f"{key}_z"]),
                "visibility": float(row[f"{key}_visibility"]),
            }
        smoothed.append(frame_data)

    return smoothed
