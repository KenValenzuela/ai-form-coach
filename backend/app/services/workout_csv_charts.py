from __future__ import annotations

from .workout_insights.routes import build_tracker_analytics_payload


def generate_workout_charts_payload(file_bytes: bytes) -> dict:
    return build_tracker_analytics_payload(file_bytes)
