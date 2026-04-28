from app.services.workout_csv_charts import generate_workout_charts_payload


def test_generate_workout_charts_payload_returns_summary_and_expected_shape():
    csv_text = """title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_lbs,reps,distance_miles,duration_seconds,rpe
Leg Day,"Mar 19, 2026, 5:15 PM","Mar 19, 2026, 6:25 PM",Heavy lower,Back Squat,,Felt strong,1,normal,225,5,,,8
Leg Day,"Mar 19, 2026, 5:15 PM","Mar 19, 2026, 6:25 PM",Heavy lower,Back Squat,,Felt strong,2,normal,235,3,,,8.5
Upper Day,"Mar 21, 2026, 9:00 AM","Mar 21, 2026, 10:00 AM",Upper push,Bench Press,,Paused reps,1,normal,185,5,,,9
Upper Day,"Mar 21, 2026, 9:00 AM","Mar 21, 2026, 10:00 AM",Upper push,Lat Pulldown,,Strict,2,normal,140,10,,,7.5
"""

    payload = generate_workout_charts_payload(csv_text.encode("utf-8"))

    assert payload["summary"]["rows"] == 4
    assert payload["summary"]["sessions"] == 2
    assert payload["summary"]["total_volume_lbs"] == 4155.0
    assert payload["analytics"]["recovery"]["fatigue_risk"] in {"low", "moderate", "high"}
    assert "weekly_volume" in payload["charts"]
    assert "top_exercises_by_volume" in payload["charts"]


def test_generate_workout_charts_payload_reports_missing_required_columns():
    csv_text = """title,start_time,exercise_title,reps
A,"Mar 19, 2026, 5:15 PM",Squat,5
"""

    try:
        generate_workout_charts_payload(csv_text.encode("utf-8"))
        assert False, "Expected ValueError for missing required columns"
    except ValueError as exc:
        assert "weight_lbs" in str(exc)
