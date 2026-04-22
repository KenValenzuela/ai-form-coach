from typing import Dict, Any, List


def evaluate_squat_faults(features: Dict[str, Any]) -> List[Dict[str, str]]:
    issues: List[Dict[str, str]] = []

    min_knee_angle = features.get("min_knee_angle")
    max_torso_lean = features.get("max_torso_lean")
    bottom_hip_to_knee_delta = features.get("bottom_hip_to_knee_delta")
    rep_duration_sec = features.get("rep_duration_sec")
    max_heel_lift_from_baseline = features.get("max_heel_lift_from_baseline")

    # Insufficient depth
    if bottom_hip_to_knee_delta is not None and bottom_hip_to_knee_delta < 0.0:
        issues.append({
            "label": "insufficient_depth",
            "severity": "medium",
        })
    elif min_knee_angle is not None and min_knee_angle > 100:
        issues.append({
            "label": "insufficient_depth",
            "severity": "medium",
        })

    # Excessive forward lean
    if max_torso_lean is not None and max_torso_lean < 145:
        issues.append({
            "label": "excessive_forward_lean",
            "severity": "medium",
        })

    # Poor control / rushed tempo
    if rep_duration_sec is not None and rep_duration_sec < 1.2:
        issues.append({
            "label": "poor_control",
            "severity": "low",
        })

    # Heel lift / reduced foot stability
    if max_heel_lift_from_baseline is not None and max_heel_lift_from_baseline > 0.03:
        issues.append({
            "label": "heel_lift",
            "severity": "medium",
        })

    return issues
