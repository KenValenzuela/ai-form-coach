from __future__ import annotations

from typing import Any

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


def build_tracker_analytics_payload(file_bytes: bytes) -> dict[str, Any]:
    df = load_and_prepare_csv(file_bytes)

    overview = build_training_overview(df)
    strength = build_strength_progression(df)
    balance = build_hypertrophy_balance(df)
    recovery = build_recovery_metrics(df)
    junk_flags = detect_junk_volume(df)

    analytics = {
        "training_overview": overview,
        "strength_progression": strength,
        "hypertrophy_balance": balance,
        "recovery": recovery,
        "junk_volume_flags": junk_flags,
    }
    analytics["coach_recommendations"] = build_coach_recommendations(analytics)

    charts = build_visualizations(df, strength)

    return {
        "summary": {
            "rows": int(len(df)),
            "sessions": overview["total_sessions"],
            "exercises": int(df["exercise_title"].nunique()),
            "total_sets": overview["total_sets"],
            "total_reps": int(df["reps"].fillna(0).sum()),
            "total_volume_lbs": overview["total_volume_lbs"],
            "total_distance_miles": float(df["distance_miles"].fillna(0).sum()),
            "total_duration_minutes": float(df["duration_seconds"].fillna(0).sum() / 60),
            "average_rpe": float(df["rpe"].dropna().mean()) if df["rpe"].notna().any() else None,
        },
        "invalid_rows": [],
        "charts": charts,
        "preview": df.head(15).fillna("").to_dict(orient="records"),
        "required_columns": list(df.columns),
        "analytics": analytics,
    }
