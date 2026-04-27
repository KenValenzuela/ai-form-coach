from __future__ import annotations

from typing import Any

from .workout_insights.routes import build_tracker_analytics_payload


COMPAT_CHART_ALIASES = {
    "volume_by_exercise": "total_volume_by_muscle_bar",
    "volume_over_time": "weekly_total_volume_lineplot",
    "rpe_distribution": "volume_vs_rpe_scatter",
    "set_type_distribution": "total_sets_by_muscle_bar",
    "duration_by_workout": "recent_vs_previous_8_weeks",
}


def generate_workout_charts_payload(file_bytes: bytes) -> dict[str, Any]:
    payload = build_tracker_analytics_payload(file_bytes)
    charts = payload.get("charts", {})
    for legacy_key, new_key in COMPAT_CHART_ALIASES.items():
        if legacy_key not in charts and new_key in charts:
            charts[legacy_key] = charts[new_key]
    payload["charts"] = charts
    return payload
