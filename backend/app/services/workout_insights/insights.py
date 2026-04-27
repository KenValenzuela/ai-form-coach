from __future__ import annotations

from typing import Any


def build_coach_recommendations(analytics: dict[str, Any]) -> list[str]:
    recs: list[str] = []
    balance = analytics["hypertrophy_balance"]
    recovery = analytics["recovery"]
    junk = analytics["junk_volume_flags"]

    quad_ham = balance["ratios"].get("quad_hamstring")
    if quad_ham is not None and quad_ham > 1.8:
        recs.append("Hamstrings are underdosed versus quads. Add 6–8 hard hamstring sets per week.")

    calves_sets = balance["sets_by_muscle"].get("calves", 0)
    core_sets = balance["sets_by_muscle"].get("core", 0)
    if calves_sets < 60:
        recs.append("Calves are neglected. Hit calves 2-3 times weekly for 8-12 total sets.")
    if core_sets < 40:
        recs.append("Core exposure is inconsistent. Add direct core work at least 3 sessions each week.")

    if recovery["rpe_quality_score"] < 15:
        recs.append("RPE logging is too sparse. Log RPE on all top sets so fatigue calls are reliable.")

    if recovery["fatigue_risk"] == "high":
        recs.append("Fatigue risk is high. Run a 5-7 day deload now: keep intensity, cut volume by 35-50%.")

    if junk:
        top = junk[0]["exercise"]
        recs.append(f"{top} shows volume growth without matching strength gain. Tighten execution or reduce junk sets.")

    back_sets = balance["sets_by_muscle"].get("back", 0)
    if back_sets > 0:
        recs.append("Back work dropped recently in trend checks. Keep 12-16 quality sets/week to maintain momentum.")

    arm_ratio = balance["ratios"].get("upper_lower") or 0
    if arm_ratio > 2.0:
        recs.append("Upper volume dominates lower body. Keep pushing compounds and cap extra arm isolation if growth stalls.")

    recs.append("Next week: push progression on one key compound per day, keep 1-2 reps in reserve on backoff work.")
    return recs[:8]
