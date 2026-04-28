from __future__ import annotations

from typing import Any

import pandas as pd


def _weekly_series(df: pd.DataFrame, metric: str, agg: str = "sum") -> list[dict[str, Any]]:
    weekly = df.dropna(subset=["week_start"]).groupby("week_start", as_index=False).agg(value=(metric, agg)).sort_values("week_start")
    return [{"week": row.week_start.date().isoformat(), "value": round(float(row.value), 2)} for row in weekly.itertuples()]


def build_visualizations(df: pd.DataFrame, _strength: dict[str, Any]) -> dict[str, Any]:
    weekly_volume = _weekly_series(df, "volume_lbs", "sum")
    weekly_sets = _weekly_series(df, "exercise_title", "count")
    weekly_reps = _weekly_series(df.assign(reps=df["reps"].fillna(0)), "reps", "sum")

    rpe_dist = (
        df.dropna(subset=["rpe"]).assign(bucket=lambda d: d["rpe"].round().clip(lower=1, upper=10).astype(int)).groupby("bucket").size().to_dict()
    )

    top_by_volume = (
        df.groupby("exercise_title", as_index=False)["volume_lbs"].sum().sort_values("volume_lbs", ascending=False).head(10)
    )
    top_by_sets = df.groupby("exercise_title", as_index=False).size().sort_values("size", ascending=False).head(10)

    e1rm_trend: dict[str, list[dict[str, Any]]] = {}
    major_exercises = top_by_volume["exercise_title"].tolist()[:5]
    for exercise in major_exercises:
        points = (
            df[(df["exercise_title"] == exercise) & df["estimated_1rm"].notna()]
            .dropna(subset=["start_time"])
            .sort_values("start_time")
        )
        if points.empty:
            continue
        daily = points.assign(day=points["start_time"].dt.date).groupby("day", as_index=False).agg(e1rm=("estimated_1rm", "max"))
        e1rm_trend[str(exercise)] = [{"date": str(row.day), "e1rm": round(float(row.e1rm), 2)} for row in daily.itertuples()]

    muscle_trend_raw = (
        df.dropna(subset=["week_start"]).groupby(["week_start", "muscle_group"], as_index=False).agg(sets=("exercise_title", "count"))
    )
    muscle_trend = [
        {"week": row.week_start.date().isoformat(), "muscle": str(row.muscle_group), "sets": int(row.sets)}
        for row in muscle_trend_raw.itertuples()
    ]

    return {
        "weekly_volume": weekly_volume,
        "weekly_sets": weekly_sets,
        "weekly_reps": weekly_reps,
        "muscle_trend": muscle_trend,
        "e1rm_trend": e1rm_trend,
        "rpe_dist": {str(k): int(v) for k, v in sorted(rpe_dist.items())},
        "top_exercises_by_volume": [
            {"exercise": str(row.exercise_title), "volume_lbs": round(float(row.volume_lbs), 2)} for row in top_by_volume.itertuples()
        ],
        "top_exercises_by_sets": [{"exercise": str(row.exercise_title), "sets": int(row.size)} for row in top_by_sets.itertuples()],
    }
