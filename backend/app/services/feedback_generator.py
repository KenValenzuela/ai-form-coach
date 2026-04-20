from typing import List, Dict

FEEDBACK_MAP = {
    "insufficient_depth": "Try lowering your hips until they reach at least knee level.",
    "excessive_forward_lean": "Keep your chest more upright during the squat.",
    "poor_control": "Slow the movement slightly and keep the descent and ascent controlled.",
}


def attach_feedback(issues: List[Dict[str, str]]) -> List[Dict[str, str]]:
    output: List[Dict[str, str]] = []
    for issue in issues:
        label = issue["label"]
        output.append({
            "label": label,
            "severity": issue["severity"],
            "feedback": FEEDBACK_MAP.get(label, "Focus on maintaining stable squat mechanics."),
        })
    return output