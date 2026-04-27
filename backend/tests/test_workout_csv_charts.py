from app.services.workout_csv_charts import generate_workout_charts_payload


def test_generate_workout_charts_payload_returns_summary_and_charts():
    csv_text = """title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_lbs,reps,distance_miles,duration_seconds,rpe
Leg Day,2026-04-20 10:00:00,2026-04-20 11:00:00,Heavy lower,Back Squat,,Felt strong,1,normal,225,5,,90,8
Leg Day,2026-04-20 10:00:00,2026-04-20 11:00:00,Heavy lower,Back Squat,,Felt strong,2,normal,225,5,,95,8.5
Conditioning,2026-04-22 08:00:00,2026-04-22 08:45:00,Cardio block,Treadmill Run,,,1,cardio,,,3.1,1800,6
"""

    payload = generate_workout_charts_payload(csv_text.encode("utf-8"))

    assert payload["summary"]["sessions"] == 2
    assert payload["summary"]["total_volume_lbs"] == 2250.0
    assert payload["summary"]["total_distance_miles"] == 3.1
    assert payload["charts"]
    assert "volume_by_exercise" in payload["charts"]
    assert payload["preview"]
