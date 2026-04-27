from __future__ import annotations

import io

import pandas as pd

from .muscle_mapping import add_muscle_groups

REQUIRED_COLUMNS = [
    "title",
    "start_time",
    "end_time",
    "description",
    "exercise_title",
    "superset_id",
    "exercise_notes",
    "set_index",
    "set_type",
    "weight_lbs",
    "reps",
    "distance_miles",
    "duration_seconds",
    "rpe",
]

NUMERIC_COLUMNS = ["set_index", "weight_lbs", "reps", "distance_miles", "duration_seconds", "rpe"]


def load_and_prepare_csv(file_bytes: bytes) -> pd.DataFrame:
    raw_df = pd.read_csv(io.StringIO(file_bytes.decode("utf-8-sig")))
    raw_df.columns = [str(col).strip() for col in raw_df.columns]

    missing = [col for col in REQUIRED_COLUMNS if col not in raw_df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")

    df = raw_df.copy()
    df["start_time"] = pd.to_datetime(df["start_time"], errors="coerce")
    df["end_time"] = pd.to_datetime(df["end_time"], errors="coerce")
    for col in NUMERIC_COLUMNS:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df["exercise_title"] = df["exercise_title"].astype(str).str.strip()
    df["title"] = df["title"].astype(str).str.strip()
    df["volume_lbs"] = (df["weight_lbs"].fillna(0) * df["reps"].fillna(0)).round(2)
    df["estimated_1rm"] = (df["weight_lbs"] * (1 + (df["reps"] / 30))).round(2)
    df["session_date"] = df["start_time"].dt.date
    df["week_start"] = (df["start_time"] - pd.to_timedelta(df["start_time"].dt.weekday, unit="D")).dt.date
    df["day_of_week"] = df["start_time"].dt.day_name()

    df = add_muscle_groups(df)
    return df
