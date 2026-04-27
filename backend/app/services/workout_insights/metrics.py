from __future__ import annotations

from typing import Any

import pandas as pd

from .muscle_mapping import MUSCLE_GROUPS

KEY_LIFTS = [
    "Bench Press",
    "Squat",
    "Leg Press",
    "Leg Extension",
    "Romanian Deadlift",
    "Lat Pulldown",
    "Shoulder Press",
    "Bicep Curl",
]


def _safe_ratio(a: float, b: float) -> float | None:
    if b == 0:
        return None
    return round(a / b, 2)


def build_training_overview(df: pd.DataFrame) -> dict[str, Any]:
    sessions = df.dropna(subset=["start_time"])[["title", "start_time", "end_time"]].drop_duplicates()
    date_min = df["start_time"].min()
    date_max = df["start_time"].max()
    span_weeks = max(((date_max - date_min).days / 7), 1) if pd.notna(date_min) and pd.notna(date_max) else 1
    duration_minutes = (sessions["end_time"] - sessions["start_time"]).dt.total_seconds().div(60)

    return {
        "total_sessions": int(len(sessions)),
        "total_sets": int(len(df)),
        "total_volume_lbs": float(df["volume_lbs"].sum()),
        "average_session_duration_minutes": float(duration_minutes.dropna().mean() or 0),
        "workouts_per_week": round(len(sessions) / span_weeks, 2),
        "average_sets_per_session": round(len(df) / max(len(sessions), 1), 1),
        "average_volume_per_session": round(float(df["volume_lbs"].sum()) / max(len(sessions), 1), 1),
        "date_range": {
            "start": date_min.date().isoformat() if pd.notna(date_min) else None,
            "end": date_max.date().isoformat() if pd.notna(date_max) else None,
        },
    }


def build_strength_progression(df: pd.DataFrame) -> dict[str, Any]:
    key_lift_rows = []
    progression_series: dict[str, list[dict[str, Any]]] = {}

    for lift in KEY_LIFTS:
        mask = df["exercise_title"].str.contains(lift, case=False, na=False)
        lift_df = df[mask].dropna(subset=["estimated_1rm", "start_time"]).sort_values("start_time")
        if lift_df.empty:
            continue
        best = float(lift_df["estimated_1rm"].max())
        last = float(lift_df["estimated_1rm"].iloc[-1])
        first = float(lift_df["estimated_1rm"].iloc[0])
        key_lift_rows.append(
            {
                "exercise": lift,
                "best_estimated_1rm": round(best, 2),
                "last_estimated_1rm": round(last, 2),
                "change_from_first": round(last - first, 2),
                "sessions_logged": int(lift_df["session_date"].nunique()),
                "sets_logged": int(len(lift_df)),
            }
        )
        progression_series[lift] = [
            {"date": row.start_time.date().isoformat(), "estimated_1rm": float(row.estimated_1rm)}
            for row in lift_df.itertuples()
        ]

    return {"pr_table": key_lift_rows, "estimated_1rm_series": progression_series}


def build_hypertrophy_balance(df: pd.DataFrame) -> dict[str, Any]:
    sets = df.groupby("muscle_group").size().reindex(MUSCLE_GROUPS, fill_value=0)
    volume = df.groupby("muscle_group")["volume_lbs"].sum().reindex(MUSCLE_GROUPS, fill_value=0)

    push_sets = int(sets["chest"] + sets["shoulders"] + sets["triceps"])
    pull_sets = int(sets["back"] + sets["biceps"])
    upper_sets = int(df[df["is_upper"]].shape[0])
    lower_sets = int(df[~df["is_upper"]].shape[0])

    return {
        "sets_by_muscle": {k: int(v) for k, v in sets.items()},
        "volume_by_muscle": {k: round(float(v), 2) for k, v in volume.items()},
        "ratios": {
            "push_pull": _safe_ratio(push_sets, pull_sets),
            "quad_hamstring": _safe_ratio(int(sets["quads"]), int(sets["hamstrings"])),
            "chest_back": _safe_ratio(int(sets["chest"]), int(sets["back"])),
            "biceps_triceps": _safe_ratio(int(sets["biceps"]), int(sets["triceps"])),
            "upper_lower": _safe_ratio(upper_sets, lower_sets),
        },
        "undertrained": [k for k, v in sets.items() if v < 0.4 * sets.mean()],
        "overloaded": [k for k, v in sets.items() if v > 1.7 * sets.mean()],
    }


def build_recovery_metrics(df: pd.DataFrame) -> dict[str, Any]:
    sessions = df.dropna(subset=["start_time"])[["start_time", "session_date"]].drop_duplicates().sort_values("start_time")
    weekly = df.groupby("week_start").agg(sets=("exercise_title", "count"), volume_lbs=("volume_lbs", "sum")).reset_index()
    weekly["volume_change_pct"] = weekly["volume_lbs"].pct_change().fillna(0)
    spike_weeks = weekly[weekly["volume_change_pct"] > 0.25]

    session_dates = pd.to_datetime(sessions["session_date"])
    day_gaps = session_dates.diff().dt.days.fillna(2)
    consecutive_days = int((day_gaps == 1).sum())

    rpe_logged = df["rpe"].notna().sum()
    high_effort = ((df["rpe"] >= 9) & df["rpe"].notna()).sum()
    fatigue = "low"
    if len(spike_weeks) >= 2 or consecutive_days >= 8:
        fatigue = "high"
    elif len(spike_weeks) >= 1 or consecutive_days >= 4:
        fatigue = "moderate"

    return {
        "weekly": weekly.to_dict(orient="records"),
        "rpe_quality_score": round(float(rpe_logged / max(len(df), 1) * 100), 1),
        "high_effort_frequency": round(float(high_effort / max(rpe_logged, 1) * 100), 1) if rpe_logged else 0.0,
        "consecutive_training_days": consecutive_days,
        "volume_spike_weeks": [str(x) for x in spike_weeks["week_start"].tolist()],
        "fatigue_risk": fatigue,
        "deload_needed": fatigue == "high" or (high_effort >= 8 and rpe_logged > 0),
        "undertraining": weekly["sets"].tail(4).mean() < 45 if not weekly.empty else True,
    }


def detect_junk_volume(df: pd.DataFrame) -> list[dict[str, Any]]:
    out = []
    for ex, ex_df in df.groupby("exercise_title"):
        if len(ex_df) < 8:
            continue
        ex_df = ex_df.sort_values("start_time")
        first_slice = ex_df.head(max(3, len(ex_df) // 4))
        last_slice = ex_df.tail(max(3, len(ex_df) // 4))
        vol_delta = last_slice["volume_lbs"].mean() - first_slice["volume_lbs"].mean()
        orm_delta = last_slice["estimated_1rm"].mean() - first_slice["estimated_1rm"].mean()
        if vol_delta > 0 and orm_delta <= 1:
            out.append(
                {
                    "exercise": ex,
                    "set_count": int(len(ex_df)),
                    "volume_change": round(float(vol_delta), 2),
                    "estimated_1rm_change": round(float(orm_delta), 2),
                    "flag": "possible_junk_volume_or_recovery_issue",
                }
            )
    return sorted(out, key=lambda x: x["set_count"], reverse=True)[:12]
