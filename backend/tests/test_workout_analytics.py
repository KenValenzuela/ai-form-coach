from datetime import datetime

from app.services.workout_analytics import (
    calculateVolume,
    compute_dedupe_hash,
    estimateOneRepMax,
    groupSessionsFromCsv,
    suggestNextLoad,
    validate_csv_rows,
    build_routine_templates,
    build_suggestions,
)


def test_csv_validation_required_fields():
    rows = [
        {"exercise_title": "", "start_time": "", "set_index": "", "weight_lbs": "", "reps": ""},
        {"exercise_title": "Back Squat", "start_time": "Mar 19, 2026, 5:15 PM", "set_index": "1", "weight_lbs": "225", "reps": "5"},
    ]
    valid, invalid = validate_csv_rows(rows)
    assert len(valid) == 1
    assert len(invalid) == 1


def test_duplicate_hash_detection_key_stability():
    row = {
        "title": "Leg Day",
        "start_time": "2026-03-19T17:15:00",
        "exercise_title": "Back Squat",
        "set_index": 1,
        "weight_lbs": 225,
        "reps": 5,
    }
    assert compute_dedupe_hash(row) == compute_dedupe_hash(dict(row))


def test_volume_and_1rm_calculations():
    assert calculateVolume(225, 5) == 1125
    assert estimateOneRepMax(225, 5) == 262.5


def test_group_sessions_from_csv():
    rows = [
        {"title": "Leg Day", "start_time": datetime(2026, 3, 19, 17, 15), "end_time": None},
        {"title": "Leg Day", "start_time": datetime(2026, 3, 19, 17, 15), "end_time": None},
    ]
    grouped = groupSessionsFromCsv(rows)
    assert len(grouped) == 1


def test_suggestion_rules_and_next_load():
    history = [
        {"weight_lbs": 185, "reps": 5, "rpe": 7, "session_start": datetime(2026, 4, 1)},
        {"weight_lbs": 185, "reps": 5, "rpe": 7.5, "session_start": datetime(2026, 4, 8)},
    ]
    suggestions = build_suggestions("Back Squat", history, datetime(2026, 4, 9))
    assert any("try" in s for s in suggestions)
    assert suggestNextLoad(185, 7.5, "Back Squat") == 190


def test_routine_auto_population():
    rows = [
        {"title": "Push Day", "start_time": datetime(2026, 4, 1), "exercise_title": "Bench Press", "weight_lbs": 185, "reps": 5, "rpe": 8},
        {"title": "Push Day", "start_time": datetime(2026, 4, 1), "exercise_title": "Overhead Press", "weight_lbs": 95, "reps": 8, "rpe": 8},
    ]
    routines = build_routine_templates(rows)
    assert len(routines) == 1
    assert routines[0]["template_name"] == "Push Day"
