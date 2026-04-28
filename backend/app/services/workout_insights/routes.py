from __future__ import annotations

from .data_cleaning import load_and_prepare_csv
from .insights import build_coach_recommendations
from .metrics import (
    build_hypertrophy_balance,
    build_recovery_metrics,
    build_strength_progression,
    build_training_overview,
    detect_junk_volume,
)
from .visualizations import build_visualizations


def build_tracker_analytics_payload(file_bytes: bytes) -> dict:
    df = load_and_prepare_csv(file_bytes)

    overview = build_training_overview(df)
    strength = build_strength_progression(df)
    balance = build_hypertrophy_balance(df)
    recovery = build_recovery_metrics(df)
    junk_flags = detect_junk_volume(df)
    charts = build_visualizations(df, strength)

    analytics = {
        "training_overview": overview,
        "strength_progression": strength,
        "hypertrophy_balance": balance,
        "recovery": recovery,
        "junk_volume_flags": junk_flags,
    }
    analytics["coach_recommendations"] = build_coach_recommendations(analytics, charts)

    return {
        "summary": {
            "rows": int(len(df)),
            "sessions": int(df["session_key"].nunique()),
            "exercises": int(df["exercise_title"].nunique()),
            "total_sets": int(len(df)),
            "total_reps": int(df["reps"].fillna(0).sum()),
            "total_volume_lbs": round(float(df["volume_lbs"].fillna(0).sum()), 2),
            "total_duration_minutes": round(float(overview["total_duration_minutes"]), 2),
            "average_rpe": round(float(df["rpe"].dropna().mean()), 2) if df["rpe"].notna().any() else None,
        },
        "analytics": analytics,
        "charts": charts,
    }
