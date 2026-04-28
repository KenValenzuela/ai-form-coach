from __future__ import annotations

import io
from typing import Iterable

import pandas as pd

from .muscle_mapping import add_muscle_groups

REQUIRED_COLUMNS = ["title", "start_time", "exercise_title", "weight_lbs", "reps"]
OPTIONAL_COLUMNS = [
    "end_time",
    "description",
    "superset_id",
    "exercise_notes",
    "set_index",
    "set_type",
    "distance_miles",
    "duration_seconds",
    "rpe",
]

NUMERIC_COLUMNS = ["weight_lbs", "reps", "rpe", "duration_seconds", "distance_miles", "set_index"]
STRING_COLUMNS = [
    "title",
    "description",
    "exercise_title",
    "superset_id",
    "exercise_notes",
    "set_type",
]


def _ensure_columns(df: pd.DataFrame, columns: Iterable[str]) -> pd.DataFrame:
    for column in columns:
        if column not in df.columns:
            df[column] = pd.NA
    return df


def _safe_to_datetime(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce", format="mixed")


def load_and_prepare_csv(file_bytes: bytes) -> pd.DataFrame:
    raw_df = pd.read_csv(io.StringIO(file_bytes.decode("utf-8-sig")))
    raw_df.columns = [str(col).strip() for col in raw_df.columns]

    missing = [col for col in REQUIRED_COLUMNS if col not in raw_df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")

    df = _ensure_columns(raw_df.copy(), OPTIONAL_COLUMNS)

    for col in STRING_COLUMNS:
        df[col] = df[col].fillna("").astype(str).str.strip()

    df["exercise"] = df["exercise_title"]
    df["start_time_raw"] = df["start_time"]
    df["end_time_raw"] = df["end_time"]
    df["start_time"] = _safe_to_datetime(df["start_time"])
    df["end_time"] = _safe_to_datetime(df["end_time"])

    for col in NUMERIC_COLUMNS:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df["weight"] = df["weight_lbs"].fillna(0.0)
    df["volume_lbs"] = (df["weight_lbs"].fillna(0.0) * df["reps"].fillna(0.0)).round(2)
    df["estimated_1rm"] = (df["weight_lbs"] * (1 + (df["reps"] / 30))).where(df["weight_lbs"].notna() & df["reps"].notna()).round(2)
    df["session_date"] = df["start_time"].dt.date
    df["week_start"] = df["start_time"].dt.to_period("W").dt.start_time
    df["day_of_week"] = df["start_time"].dt.day_name()
    df["session_key"] = df["title"].fillna("") + "|" + df["start_time_raw"].fillna("")

    df = add_muscle_groups(df)
    return df
