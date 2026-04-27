from __future__ import annotations

import csv
import hashlib
import io
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from statistics import mean
from typing import Any

PERFORMANCE_FIELDS = ["weight_lbs", "reps", "distance_miles", "duration_seconds"]
COMMON_WORKOUT_NAMES = ["arms", "shoulders", "legs", "push", "pull", "squat", "bench", "deadlift"]
EXERCISE_CATEGORY_MAP = {
    "squat": "strength",
    "deadlift": "strength",
    "bench": "strength",
    "press": "hypertrophy",
    "row": "hypertrophy",
    "curl": "accessory",
    "raise": "accessory",
    "run": "cardio",
    "bike": "cardio",
    "walk": "cardio",
    "mobility": "mobility",
    "stretch": "mobility",
}
WORKOUT_CSV_COLUMNS = [
    "title",
    "start_time",
    "end_time",
    "description",
    "exercise_title",
    "superset_id",
    "exercise_notes",
    "set_index",
    "set_type",
    "weight_lbs",
    "reps",
    "distance_miles",
    "duration_seconds",
    "rpe",
]


def calculateVolume(weight_lbs: float | None, reps: int | None) -> float:
    if not weight_lbs or not reps:
        return 0.0
    return round(weight_lbs * reps, 2)


def estimateOneRepMax(weight_lbs: float | None, reps: int | None) -> float:
    if not weight_lbs or not reps:
        return 0.0
    return round(weight_lbs * (1 + reps / 30), 2)


def normalize_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    raw = value.strip()
    formats = [
        "%b %d, %Y, %I:%M %p",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%m/%d/%Y %H:%M",
        "%m/%d/%Y %I:%M %p",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def _to_int(v: str | None) -> int | None:
    if v in (None, ""):
        return None
    try:
        return int(float(v))
    except ValueError:
        return None


def _to_float(v: str | None) -> float | None:
    if v in (None, ""):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def classify_lift_category(exercise_title: str) -> str:
    name = exercise_title.lower()
    for token, category in EXERCISE_CATEGORY_MAP.items():
        if token in name:
            return category
    return "accessory"


def compute_dedupe_hash(row: dict[str, Any]) -> str:
    payload = "|".join(
        [
            str(row.get("title") or ""),
            str(row.get("start_time") or ""),
            str(row.get("exercise_title") or ""),
            str(row.get("set_index") or ""),
            str(row.get("weight_lbs") or ""),
            str(row.get("reps") or ""),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def validate_csv_rows(rows: list[dict[str, str]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    valid_rows = []
    invalid_rows = []
    for i, row in enumerate(rows, start=2):
        errors = []
        if not row.get("exercise_title"):
            errors.append("exercise_title is required")
        start_time = normalize_datetime(row.get("start_time"))
        if not start_time:
            errors.append("start_time is required and must be parseable")

        set_index = _to_int(row.get("set_index"))
        if set_index is None:
            errors.append("set_index is required and must be numeric")

        perf_values = [_to_float(row.get(field)) for field in PERFORMANCE_FIELDS]
        if not any(v is not None and v > 0 for v in perf_values):
            errors.append("at least one performance field is required")

        parsed = {
            "title": (row.get("title") or "Untitled Session").strip() or "Untitled Session",
            "start_time": start_time,
            "end_time": normalize_datetime(row.get("end_time")),
            "description": row.get("description") or "",
            "exercise_title": (row.get("exercise_title") or "").strip(),
            "superset_id": row.get("superset_id") or None,
            "exercise_notes": row.get("exercise_notes") or None,
            "set_index": set_index,
            "set_type": row.get("set_type") or None,
            "weight_lbs": _to_float(row.get("weight_lbs")),
            "reps": _to_int(row.get("reps")),
            "distance_miles": _to_float(row.get("distance_miles")),
            "duration_seconds": _to_int(row.get("duration_seconds")),
            "rpe": _to_float(row.get("rpe")),
            "row_number": i,
        }
        parsed["volume_lbs"] = calculateVolume(parsed["weight_lbs"], parsed["reps"])
        parsed["estimated_1rm"] = estimateOneRepMax(parsed["weight_lbs"], parsed["reps"])
        parsed["lift_category"] = classify_lift_category(parsed["exercise_title"])
        parsed["muscle_group"] = None

        if errors:
            invalid_rows.append({"row_number": i, "errors": errors, "raw": row})
        else:
            valid_rows.append(parsed)

    return valid_rows, invalid_rows


def groupSessionsFromCsv(rows: list[dict[str, Any]]) -> dict[tuple[str, datetime, datetime | None], list[dict[str, Any]]]:
    grouped: dict[tuple[str, datetime, datetime | None], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        key = (row["title"], row["start_time"], row.get("end_time"))
        grouped[key].append(row)
    return grouped


def summarizeExerciseHistory(exercise_sets: list[dict[str, Any]]) -> dict[str, Any]:
    if not exercise_sets:
        return {}
    sorted_sets = sorted(exercise_sets, key=lambda r: r["session_start"])
    volumes = [calculateVolume(r.get("weight_lbs"), r.get("reps")) for r in sorted_sets]
    est_1rms = [estimateOneRepMax(r.get("weight_lbs"), r.get("reps")) for r in sorted_sets]
    rpes = [r.get("rpe") for r in sorted_sets if r.get("rpe") is not None]
    session_dates = sorted(set(r["session_start"].date() for r in sorted_sets))
    span_days = max((session_dates[-1] - session_dates[0]).days, 1)
    return {
        "total_volume": round(sum(volumes), 2),
        "best_weight": max((r.get("weight_lbs") or 0) for r in sorted_sets),
        "best_reps": max((r.get("reps") or 0) for r in sorted_sets),
        "estimated_1rm_trend": est_1rms,
        "average_rpe": round(mean(rpes), 2) if rpes else None,
        "frequency_per_week": round(len(session_dates) / (span_days / 7), 2) if span_days else len(session_dates),
        "last_performed_date": session_dates[-1].isoformat(),
        "progression_rate": round((est_1rms[-1] - est_1rms[0]) / max(len(est_1rms), 1), 2),
    }


def detectPlateau(volumes: list[float]) -> bool:
    return len(volumes) >= 3 and volumes[-1] <= volumes[-2] <= volumes[-3]


def suggestNextLoad(weight_lbs: float | None, rpe: float | None, exercise_title: str) -> float | None:
    if weight_lbs is None:
        return None
    inc = 2.5 if any(k in exercise_title.lower() for k in ["press", "curl", "raise"]) else 5
    if rpe is not None and rpe >= 9:
        return weight_lbs
    return round(weight_lbs + inc, 2)


def build_suggestions(exercise_name: str, history: list[dict[str, Any]], now: datetime) -> list[str]:
    suggestions = []
    volumes = [calculateVolume(h.get("weight_lbs"), h.get("reps")) for h in history]
    est_1rms = [estimateOneRepMax(h.get("weight_lbs"), h.get("reps")) for h in history if h.get("weight_lbs") and h.get("reps")]
    rpes = [h.get("rpe") for h in history if h.get("rpe") is not None]

    if len(est_1rms) >= 2 and est_1rms[-1] > est_1rms[-2]:
        suggestions.append(f"{exercise_name}: estimated 1RM is increasing — progression looks good.")
    if len(volumes) >= 3 and volumes[-1] < volumes[-2] < volumes[-3]:
        suggestions.append(f"{exercise_name}: volume has dropped for 2+ sessions, consider deload or recovery check.")
    if len(rpes) >= 2 and all(r >= 9 for r in rpes[-2:]):
        suggestions.append(f"{exercise_name}: recent RPE is 9-10, consider reducing load or reps.")

    if len(history) >= 2:
        prev, cur = history[-2], history[-1]
        if prev.get("weight_lbs") == cur.get("weight_lbs") and prev.get("reps") == cur.get("reps") and (prev.get("rpe") or 99) <= 8 and (cur.get("rpe") or 99) <= 8:
            next_load = suggestNextLoad(cur.get("weight_lbs"), cur.get("rpe"), exercise_name)
            if next_load:
                suggestions.append(f"{exercise_name}: stable performance at low RPE, try {next_load} lbs next session.")

    last_date = history[-1]["session_start"].date() if history else now.date()
    days_since = (now.date() - last_date).days
    if days_since >= 7:
        suggestions.append(f"{exercise_name}: not trained for {days_since} days, consider adding it back.")

    if len(history) >= 2:
        cur_week = history[-1]["session_start"].isocalendar().week
        weekly_volume: dict[int, float] = defaultdict(float)
        for h in history:
            weekly_volume[h["session_start"].isocalendar().week] += calculateVolume(h.get("weight_lbs"), h.get("reps"))
        weeks = sorted(weekly_volume)
        if len(weeks) >= 2:
            prev_wk, last_wk = weekly_volume[weeks[-2]], weekly_volume[weeks[-1]]
            if prev_wk > 0 and ((last_wk - prev_wk) / prev_wk) > 0.2:
                suggestions.append(f"{exercise_name}: week-over-week volume jumped >20%, monitor fatigue/injury risk.")

    return suggestions


def parse_csv_bytes(file_bytes: bytes) -> list[dict[str, str]]:
    decoded = file_bytes.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(decoded))
    return [dict(r) for r in reader]


def parse_csv_payload(file_bytes: bytes) -> tuple[list[str], list[dict[str, str]]]:
    decoded = file_bytes.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(decoded))
    fieldnames = [f.strip() for f in (reader.fieldnames or [])]
    rows = [dict(r) for r in reader]
    return fieldnames, rows


def validate_csv_columns(
    columns: list[str],
    allowed_columns: list[str] | None = None,
) -> list[str]:
    expected = allowed_columns or WORKOUT_CSV_COLUMNS
    expected_set = set(expected)
    supplied_set = set(columns)
    missing = [c for c in expected if c not in supplied_set]
    unknown = [c for c in columns if c not in expected_set]
    errors: list[str] = []
    if missing:
        errors.append(f"Missing required columns: {', '.join(missing)}")
    if unknown:
        errors.append(f"Unknown columns present: {', '.join(unknown)}")
    if not columns:
        errors.append("CSV header row is missing.")
    return errors


def build_routine_templates(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped = groupSessionsFromCsv(rows)
    signatures = Counter()
    for (title, _, _), sets in grouped.items():
        sig = tuple(sorted(set(s["exercise_title"] for s in sets)))
        signatures[(title, sig)] += 1

    templates = []
    for (title, sig), count in signatures.items():
        if count < 1:
            continue
        entries = []
        for ex in sig:
            ex_rows = [r for r in rows if r["exercise_title"] == ex]
            last = sorted(ex_rows, key=lambda r: r["start_time"])[-1]
            reps = [r["reps"] for r in ex_rows if r.get("reps")]
            rpes = [r["rpe"] for r in ex_rows if r.get("rpe")]
            weights = [r["weight_lbs"] for r in ex_rows if r.get("weight_lbs")]
            entries.append(
                {
                    "exercise_name": ex,
                    "recent_working_weight": last.get("weight_lbs"),
                    "typical_reps": round(mean(reps), 1) if reps else None,
                    "typical_sets": len([r for r in ex_rows if r["title"] == title]),
                    "average_rpe": round(mean(rpes), 2) if rpes else None,
                    "last_used_weight": last.get("weight_lbs"),
                    "suggested_next_weight": suggestNextLoad(last.get("weight_lbs"), last.get("rpe"), ex),
                }
            )
        match_tags = [n for n in COMMON_WORKOUT_NAMES if n in title.lower()]
        templates.append({"template_name": title, "occurrences": count, "tags": match_tags, "exercises": entries})
    return templates
