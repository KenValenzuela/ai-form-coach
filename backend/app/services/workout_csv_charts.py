from __future__ import annotations

import base64
import io
from typing import Any

import matplotlib
import matplotlib.pyplot as plt
import pandas as pd
import seaborn as sns

matplotlib.use("Agg")

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


def _render_current_figure() -> str:
    buf = io.BytesIO()
    plt.tight_layout()
    plt.savefig(buf, format="png", dpi=160, bbox_inches="tight")
    plt.close()
    buf.seek(0)
    return base64.b64encode(buf.read()).decode("utf-8")


def _serialize_row(row: pd.Series) -> dict[str, Any]:
    record: dict[str, Any] = {}
    for key, value in row.items():
        if pd.isna(value):
            record[key] = None
        elif isinstance(value, pd.Timestamp):
            record[key] = value.isoformat()
        else:
            record[key] = value.item() if hasattr(value, "item") else value
    return record


def load_workout_csv(file_bytes: bytes) -> tuple[pd.DataFrame, list[str]]:
    raw_df = pd.read_csv(io.StringIO(file_bytes.decode("utf-8-sig")))
    headers = [str(col).strip() for col in raw_df.columns]
    raw_df.columns = headers

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
    df["set_type"] = df["set_type"].fillna("unknown").astype(str).str.strip()
    df["volume_lbs"] = (df["weight_lbs"].fillna(0) * df["reps"].fillna(0)).round(2)
    df["duration_minutes"] = (df["duration_seconds"].fillna(0) / 60).round(2)

    return df, missing


def build_summary(df: pd.DataFrame) -> dict[str, Any]:
    valid_start = df["start_time"].notna()
    session_key = df.loc[valid_start, ["title", "start_time"]].drop_duplicates()

    return {
        "rows": int(len(df)),
        "sessions": int(len(session_key)),
        "exercises": int(df["exercise_title"].nunique()),
        "total_sets": int(df["set_index"].notna().sum()),
        "total_reps": int(df["reps"].fillna(0).sum()),
        "total_volume_lbs": float(df["volume_lbs"].sum()),
        "total_distance_miles": float(df["distance_miles"].fillna(0).sum()),
        "total_duration_minutes": float(df["duration_minutes"].sum()),
        "average_rpe": float(df["rpe"].dropna().mean()) if df["rpe"].notna().any() else None,
    }


def build_charts(df: pd.DataFrame) -> dict[str, str]:
    sns.set_theme(style="whitegrid")
    charts: dict[str, str] = {}

    by_exercise = (
        df.groupby("exercise_title", as_index=False)["volume_lbs"]
        .sum()
        .sort_values("volume_lbs", ascending=False)
        .head(12)
    )
    if not by_exercise.empty:
        plt.figure(figsize=(10, 4.5))
        sns.barplot(data=by_exercise, x="exercise_title", y="volume_lbs", hue="exercise_title", legend=False, palette="Blues_d")
        plt.title("Top Exercise Volume (lbs)")
        plt.xlabel("Exercise")
        plt.ylabel("Total Volume (lbs)")
        plt.xticks(rotation=35, ha="right")
        charts["volume_by_exercise"] = _render_current_figure()

    session_volume = (
        df.dropna(subset=["start_time"]).assign(workout_day=lambda x: x["start_time"].dt.date).groupby("workout_day", as_index=False)["volume_lbs"].sum()
    )
    if not session_volume.empty:
        plt.figure(figsize=(10, 4.5))
        sns.lineplot(data=session_volume, x="workout_day", y="volume_lbs", marker="o", linewidth=2)
        plt.title("Workout Volume Over Time")
        plt.xlabel("Workout Date")
        plt.ylabel("Daily Volume (lbs)")
        plt.xticks(rotation=30, ha="right")
        charts["volume_over_time"] = _render_current_figure()

    rpe_data = df.dropna(subset=["rpe"]).copy()
    if not rpe_data.empty:
        top_rpe_exercises = rpe_data["exercise_title"].value_counts().head(8).index
        rpe_data = rpe_data[rpe_data["exercise_title"].isin(top_rpe_exercises)]
        plt.figure(figsize=(10, 4.5))
        sns.boxplot(data=rpe_data, x="exercise_title", y="rpe", hue="exercise_title", legend=False, palette="Set2")
        plt.title("RPE Distribution by Exercise")
        plt.xlabel("Exercise")
        plt.ylabel("RPE")
        plt.xticks(rotation=35, ha="right")
        charts["rpe_distribution"] = _render_current_figure()

    set_type_counts = df["set_type"].fillna("unknown").replace("", "unknown").value_counts().head(10)
    if not set_type_counts.empty:
        plt.figure(figsize=(8, 4.5))
        sns.barplot(x=set_type_counts.index, y=set_type_counts.values, hue=set_type_counts.index, legend=False, palette="mako")
        plt.title("Set Type Distribution")
        plt.xlabel("Set Type")
        plt.ylabel("Count")
        plt.xticks(rotation=25, ha="right")
        charts["set_type_distribution"] = _render_current_figure()

    workout_duration = (
        df.dropna(subset=["start_time", "end_time", "title"])
        .drop_duplicates(subset=["title", "start_time", "end_time"])
        .assign(duration_minutes=lambda x: (x["end_time"] - x["start_time"]).dt.total_seconds() / 60)
    )
    workout_duration = workout_duration[workout_duration["duration_minutes"] > 0]
    if not workout_duration.empty:
        plt.figure(figsize=(10, 4.5))
        sns.barplot(
            data=workout_duration.sort_values("start_time"),
            x="title",
            y="duration_minutes",
            hue="title",
            legend=False,
            palette="crest",
        )
        plt.title("Workout Duration by Session")
        plt.xlabel("Workout")
        plt.ylabel("Duration (minutes)")
        plt.xticks(rotation=35, ha="right")
        charts["duration_by_workout"] = _render_current_figure()

    return charts


def generate_workout_charts_payload(file_bytes: bytes) -> dict[str, Any]:
    df, _ = load_workout_csv(file_bytes)
    invalid_rows = []

    for idx, row in df.iterrows():
        row_errors = []
        if pd.isna(row.get("start_time")):
            row_errors.append("start_time is invalid")
        if not str(row.get("exercise_title") or "").strip():
            row_errors.append("exercise_title is required")
        if pd.isna(row.get("set_index")):
            row_errors.append("set_index is required")
        has_perf = any((row.get(col) or 0) > 0 for col in ["weight_lbs", "reps", "distance_miles", "duration_seconds"])
        if not has_perf:
            row_errors.append("at least one performance field must be > 0")
        if row_errors:
            invalid_rows.append({"row_number": int(idx + 2), "errors": row_errors})

    preview_rows = [_serialize_row(r) for _, r in df.head(15).iterrows()]

    return {
        "summary": build_summary(df),
        "invalid_rows": invalid_rows[:100],
        "charts": build_charts(df),
        "preview": preview_rows,
        "required_columns": REQUIRED_COLUMNS,
    }
