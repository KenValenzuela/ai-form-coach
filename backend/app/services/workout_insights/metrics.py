from __future__ import annotations

from typing import Any

import pandas as pd

from .muscle_mapping import MUSCLE_GROUPS


def _safe_ratio(a: float, b: float) -> float | None:
    if b == 0:
        return None
    return round(float(a / b), 3)


def build_training_overview(df: pd.DataFrame) -> dict[str, Any]:
    sessions = df.dropna(subset=["start_time"])[["title", "start_time", "end_time"]].drop_duplicates()
    duration_minutes = (sessions["end_time"] - sessions["start_time"]).dt.total_seconds().div(60)
    duration_minutes = duration_minutes.where(duration_minutes >= 0)

    return {
        "total_sessions": int(df["session_key"].nunique()),
        "total_sets": int(len(df)),
        "total_volume_lbs": float(df["volume_lbs"].fillna(0).sum()),
        "total_duration_minutes": float(duration_minutes.fillna(0).sum()),
        "average_session_duration_minutes": float(duration_minutes.dropna().mean() or 0),
        "average_sets_per_session": round(float(len(df) / max(df["session_key"].nunique(), 1)), 1),
    }


def build_strength_progression(df: pd.DataFrame) -> dict[str, Any]:
    ranked = (
        df.groupby("exercise_title", as_index=False)
        .agg(best_estimated_1rm=("estimated_1rm", "max"), sets_logged=("exercise_title", "count"), volume_lbs=("volume_lbs", "sum"))
        .fillna(0)
        .sort_values("best_estimated_1rm", ascending=False)
    )
    pr_table = [
        {
            "exercise": str(row.exercise_title),
            "best_estimated_1rm": round(float(row.best_estimated_1rm), 2),
            "sets_logged": int(row.sets_logged),
            "total_volume_lbs": round(float(row.volume_lbs), 2),
        }
        for row in ranked.head(12).itertuples()
        if row.best_estimated_1rm > 0
    ]

    return {"pr_table": pr_table}


def build_hypertrophy_balance(df: pd.DataFrame) -> dict[str, Any]:
    sets = df.groupby("muscle_group").size().reindex(MUSCLE_GROUPS, fill_value=0)
    total_sets = max(int(sets.sum()), 1)
    mean_sets = float(sets.mean() or 0)

    ratios = {k: round(float(v / total_sets), 3) for k, v in sets.items()}
    undertrained = [muscle for muscle, value in sets.items() if value < mean_sets * 0.6]
    overloaded = [muscle for muscle, value in sets.items() if value > mean_sets * 1.6 and value >= 8]

    return {
        "sets_by_muscle": {k: int(v) for k, v in sets.items()},
        "ratios": ratios,
        "undertrained": undertrained,
        "overloaded": overloaded,
    }


def _longest_consecutive_days(dates: list[pd.Timestamp]) -> int:
    if not dates:
        return 0
    streak = best = 1
    for idx in range(1, len(dates)):
        if (dates[idx] - dates[idx - 1]).days == 1:
            streak += 1
            best = max(best, streak)
        else:
            streak = 1
    return best


def build_recovery_metrics(df: pd.DataFrame) -> dict[str, Any]:
    weekly = df.groupby("week_start", as_index=False).agg(volume_lbs=("volume_lbs", "sum"), sets=("exercise_title", "count"))
    weekly = weekly.sort_values("week_start")
    weekly["volume_change_pct"] = weekly["volume_lbs"].pct_change().replace([float("inf"), float("-inf")], pd.NA).fillna(0)
    spike_weeks = weekly[weekly["volume_change_pct"] > 0.25]

    rpe_mask = df["rpe"].notna()
    rpe_logged = int(rpe_mask.sum())
    high_effort = int(((df["rpe"] >= 9) & rpe_mask).sum())
    high_effort_pct = round(float(high_effort / max(rpe_logged, 1) * 100), 1) if rpe_logged else 0.0
    avg_rpe = float(df["rpe"].dropna().mean()) if rpe_logged else None

    session_days = sorted(pd.to_datetime(df["session_date"].dropna().unique()).tolist())
    longest_streak = _longest_consecutive_days(session_days)

    fatigue_risk = "low"
    if high_effort_pct >= 30 or len(spike_weeks) >= 2 or longest_streak >= 6:
        fatigue_risk = "high"
    elif high_effort_pct >= 18 or len(spike_weeks) >= 1 or longest_streak >= 4:
        fatigue_risk = "moderate"

    return {
        "average_rpe": round(avg_rpe, 2) if avg_rpe is not None else None,
        "rpe_quality_score": round(float(rpe_logged / max(len(df), 1) * 100), 1),
        "fatigue_risk": fatigue_risk,
        "deload_needed": fatigue_risk == "high",
        "high_effort_frequency": {
            "count": high_effort,
            "total_rpe_sets": rpe_logged,
            "percent": high_effort_pct,
        },
        "consecutive_training_days": longest_streak,
        "volume_spike_weeks": [week.date().isoformat() for week in spike_weeks["week_start"].dropna().tolist()],
    }


def detect_junk_volume(df: pd.DataFrame) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for exercise, ex_df in df.groupby("exercise_title"):
        if len(ex_df) < 10:
            continue
        ex_df = ex_df.sort_values("start_time")
        first = ex_df.head(max(3, len(ex_df) // 3))
        last = ex_df.tail(max(3, len(ex_df) // 3))
        if (last["volume_lbs"].mean() > first["volume_lbs"].mean()) and (last["estimated_1rm"].mean() <= first["estimated_1rm"].mean() + 1):
            out.append({"exercise": str(exercise), "set_count": int(len(ex_df)), "flag": "possible_junk_volume"})
    return out[:12]
