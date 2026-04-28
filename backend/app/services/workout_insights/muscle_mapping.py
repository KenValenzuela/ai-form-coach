from __future__ import annotations

import re

MUSCLE_GROUPS = [
    "chest",
    "quads_glutes",
    "hamstrings_posterior_chain",
    "back",
    "shoulders_rear_delts",
    "biceps",
    "triceps",
    "calves",
    "core",
    "other",
]

MUSCLE_PATTERNS: dict[str, list[str]] = {
    "chest": [r"bench", r"chest", r"pec", r"fly", r"incline", r"decline"],
    "quads_glutes": [r"squat", r"leg press", r"lunge", r"split squat", r"hack squat"],
    "hamstrings_posterior_chain": [r"deadlift", r"rdl", r"romanian", r"leg curl", r"hamstring", r"good morning"],
    "biceps": [r"bicep", r"\bcurl\b", r"preacher", r"hammer"],
    "triceps": [r"tricep", r"pushdown", r"extension", r"skull", r"dip"],
    "back": [r"row", r"pulldown", r"lat", r"pull\s*up", r"chin"],
    "shoulders_rear_delts": [r"shoulder", r"lateral raise", r"face pull", r"rear delt", r"overhead press"],
    "calves": [r"calf"],
    "core": [r"abs", r"ab\b", r"crunch", r"plank", r"sit[- ]?up", r"hanging leg raise"],
}


def map_exercise_to_muscle_group(exercise_title: str) -> str:
    name = (exercise_title or "").lower()
    for group, patterns in MUSCLE_PATTERNS.items():
        if any(re.search(pattern, name) for pattern in patterns):
            return group
    return "other"


def add_muscle_groups(df):
    df = df.copy()
    df["muscle_group"] = df["exercise_title"].map(map_exercise_to_muscle_group)
    df["is_upper"] = df["muscle_group"].isin(["chest", "back", "shoulders_rear_delts", "biceps", "triceps"])
    return df
