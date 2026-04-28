from __future__ import annotations

from typing import Any


def build_coach_recommendations(analytics: dict[str, Any], charts: dict[str, Any] | None = None) -> list[str]:
    charts = charts or {}
    recs: list[str] = []

    balance = analytics.get("hypertrophy_balance", {})
    recovery = analytics.get("recovery", {})

    undertrained = balance.get("undertrained", [])
    overloaded = balance.get("overloaded", [])
    if undertrained:
        recs.append(f"Undertrained muscle groups: {', '.join(undertrained[:4])}. Add 4-8 quality sets weekly for each lagging area.")
    if overloaded:
        recs.append(f"Overloaded muscle groups: {', '.join(overloaded[:4])}. Hold volume flat for 1-2 weeks and prioritize quality reps.")

    high_effort = (recovery.get("high_effort_frequency") or {}).get("percent", 0)
    avg_rpe = recovery.get("average_rpe")
    if avg_rpe is not None and (avg_rpe >= 8.5 or high_effort >= 25):
        recs.append("High-intensity exposure is elevated. Keep most sets around RPE 6-8 and reserve RPE 9+ for planned top sets.")

    spike_weeks = recovery.get("volume_spike_weeks", [])
    if spike_weeks:
        recs.append(f"Volume spikes detected ({', '.join(spike_weeks[:3])}). Cap weekly increases near 10-15% to manage fatigue.")

    top_exercises = charts.get("top_exercises_by_volume", [])
    if top_exercises:
        top = top_exercises[0]
        recs.append(
            f"{top.get('exercise', 'Top compound')} leads total workload. Keep it as a primary progression lift and support it with complementary accessories."
        )

    if recovery.get("deload_needed"):
        recs.append("Fatigue risk is high. Plan a deload: reduce set volume by ~40% for 5-7 days while maintaining movement quality.")

    recs.append("Progress one key compound per session and log RPE consistently so recovery signals stay actionable.")
    return recs[:8]
