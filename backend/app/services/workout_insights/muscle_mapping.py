from __future__ import annotations

import re

MUSCLE_GROUPS = [
    "chest",
    "back",
    "shoulders",
    "biceps",
    "triceps",
    "quads",
    "hamstrings",
    "calves",
    "core",
]

MUSCLE_PATTERNS: dict[str, list[str]] = {
    "chest": [r"bench", r"incline", r"decline", r"fly", r"pec"],
    "back": [r"row", r"pulldown", r"pull ?up", r"deadlift", r"lat", r"chin"],
    "shoulders": [r"shoulder", r"overhead", r"lateral", r"rear delt", r"front raise", r"arnold"],
    "biceps": [r"bicep", r"curl", r"preacher", r"hammer"],
    "triceps": [r"tricep", r"pushdown", r"skull", r"dip", r"extension"],
    "quads": [r"squat", r"leg press", r"leg extension", r"lunge", r"hack squat"],
    "hamstrings": [r"rdl", r"romanian", r"leg curl", r"hamstring", r"good morning"],
    "calves": [r"calf"],
    "core": [r"ab", r"core", r"crunch", r"plank", r"hanging leg raise", r"sit[- ]?up"],
}


def map_exercise_to_muscle_group(exercise_title: str) -> str:
    name = (exercise_title or "").lower()
    for group, patterns in MUSCLE_PATTERNS.items():
        if any(re.search(p, name) for p in patterns):
            return group
    return "back" if "pull" in name else "chest" if "push" in name else "core"


def add_muscle_groups(df):
    df = df.copy()
    df["muscle_group"] = df["exercise_title"].map(map_exercise_to_muscle_group)
    df["is_upper"] = df["muscle_group"].isin(["chest", "back", "shoulders", "biceps", "triceps"])
    return df
