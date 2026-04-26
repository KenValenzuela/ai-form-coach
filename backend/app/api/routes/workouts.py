from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from ...database import SessionLocal
from ...models_db import ExerciseSetRecord, WorkoutSessionRecord
from ...services.workout_analytics import (
    build_routine_templates,
    build_suggestions,
    classify_lift_category,
    compute_dedupe_hash,
    groupSessionsFromCsv,
    parse_csv_bytes,
    summarizeExerciseHistory,
    validate_csv_rows,
)

router = APIRouter(tags=["workouts"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/workouts/import/preview")
async def preview_workout_import(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")
    rows = parse_csv_bytes(await file.read())
    valid_rows, invalid_rows = validate_csv_rows(rows)
    return {
        "total_rows": len(rows),
        "valid_rows": len(valid_rows),
        "invalid_rows": invalid_rows,
        "preview": valid_rows[:25],
        "can_import": len(valid_rows) > 0 and len(invalid_rows) == 0,
    }


@router.post("/workouts/import")
async def import_workout_csv(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")
    rows = parse_csv_bytes(await file.read())
    valid_rows, invalid_rows = validate_csv_rows(rows)
    if invalid_rows:
        return {
            "imported_row_count": 0,
            "skipped_duplicates": 0,
            "validation_errors": invalid_rows,
            "session_count": 0,
            "exercise_count": 0,
        }

    grouped = groupSessionsFromCsv(valid_rows)
    sessions_created = 0
    imported_count = 0
    duplicates = 0
    exercise_titles = set()

    for (title, start_time, end_time), sets in grouped.items():
        session = (
            db.query(WorkoutSessionRecord)
            .filter(WorkoutSessionRecord.title == title, WorkoutSessionRecord.start_time == start_time)
            .first()
        )
        if not session:
            session = WorkoutSessionRecord(
                title=title,
                start_time=start_time,
                end_time=end_time,
                description=sets[0].get("description") or "",
            )
            db.add(session)
            db.flush()
            sessions_created += 1

        for row in sets:
            dedupe_hash = compute_dedupe_hash(row)
            exists = db.query(ExerciseSetRecord).filter(ExerciseSetRecord.dedupe_hash == dedupe_hash).first()
            if exists:
                duplicates += 1
                continue
            db.add(
                ExerciseSetRecord(
                    workout_session_id=session.id,
                    exercise_title=row["exercise_title"],
                    superset_id=row.get("superset_id"),
                    exercise_notes=row.get("exercise_notes"),
                    set_index=row["set_index"],
                    set_type=row.get("set_type"),
                    weight_lbs=row.get("weight_lbs"),
                    reps=row.get("reps"),
                    distance_miles=row.get("distance_miles"),
                    duration_seconds=row.get("duration_seconds"),
                    rpe=row.get("rpe"),
                    dedupe_hash=dedupe_hash,
                )
            )
            exercise_titles.add(row["exercise_title"])
            imported_count += 1

    db.commit()
    return {
        "imported_row_count": imported_count,
        "skipped_duplicates": duplicates,
        "validation_errors": invalid_rows,
        "session_count": sessions_created,
        "exercise_count": len(exercise_titles),
    }


@router.get("/workouts/analytics")
def get_workout_analytics(db: Session = Depends(get_db)):
    rows = (
        db.query(ExerciseSetRecord, WorkoutSessionRecord)
        .join(WorkoutSessionRecord, WorkoutSessionRecord.id == ExerciseSetRecord.workout_session_id)
        .all()
    )
    now = datetime.utcnow()
    by_exercise = defaultdict(list)
    by_session = defaultdict(list)

    for set_row, session in rows:
        item = {
            "exercise_title": set_row.exercise_title,
            "weight_lbs": set_row.weight_lbs,
            "reps": set_row.reps,
            "rpe": set_row.rpe,
            "duration_seconds": set_row.duration_seconds,
            "distance_miles": set_row.distance_miles,
            "session_start": session.start_time,
            "session_end": session.end_time,
            "session_title": session.title,
        }
        by_exercise[set_row.exercise_title].append(item)
        by_session[session.id].append(item)

    exercise_analytics = {}
    lift_analytics = defaultdict(
        lambda: {
            "total_volume": 0.0,
            "set_count": 0,
            "exercise_count": 0,
            "average_rpe_values": [],
            "last_performed_date": None,
        }
    )
    suggestions = []
    for ex, history in by_exercise.items():
        sorted_hist = sorted(history, key=lambda r: r["session_start"])
        summary = summarizeExerciseHistory(sorted_hist)
        lift_category = classify_lift_category(ex)
        exercise_analytics[ex] = {**summary, "lift_category": lift_category}
        suggestions.extend(build_suggestions(ex, sorted_hist, now))
        lift_analytics[lift_category]["total_volume"] += summary.get("total_volume", 0.0)
        lift_analytics[lift_category]["set_count"] += len(sorted_hist)
        lift_analytics[lift_category]["exercise_count"] += 1
        avg_rpe = summary.get("average_rpe")
        if avg_rpe is not None:
            lift_analytics[lift_category]["average_rpe_values"].append(avg_rpe)
        last_performed = summary.get("last_performed_date")
        if (
            last_performed
            and (
                lift_analytics[lift_category]["last_performed_date"] is None
                or last_performed > lift_analytics[lift_category]["last_performed_date"]
            )
        ):
            lift_analytics[lift_category]["last_performed_date"] = last_performed

    session_analytics = []
    for session_id, history in by_session.items():
        s = history[0]
        total_volume = sum((h.get("weight_lbs") or 0) * (h.get("reps") or 0) for h in history)
        avg_rpe_vals = [h.get("rpe") for h in history if h.get("rpe") is not None]
        duration = None
        if s.get("session_end") and s.get("session_start"):
            duration = round((s["session_end"] - s["session_start"]).total_seconds() / 60, 2)
        session_analytics.append(
            {
                "session_id": session_id,
                "title": s["session_title"],
                "date": s["session_start"].isoformat(),
                "total_volume": round(total_volume, 2),
                "number_of_sets": len(history),
                "number_of_exercises": len(set(h["exercise_title"] for h in history)),
                "duration": duration,
                "average_rpe": round(sum(avg_rpe_vals) / len(avg_rpe_vals), 2) if avg_rpe_vals else None,
            }
        )

    parsed_rows = [
        {
            "title": s["session_title"],
            "start_time": s["session_start"],
            "exercise_title": s["exercise_title"],
            "weight_lbs": s["weight_lbs"],
            "reps": s["reps"],
            "rpe": s["rpe"],
        }
        for hist in by_exercise.values()
        for s in hist
    ]
    routines = build_routine_templates(parsed_rows)

    lift_analytics_payload = {
        category: {
            "total_volume": round(payload["total_volume"], 2),
            "set_count": payload["set_count"],
            "exercise_count": payload["exercise_count"],
            "average_rpe": round(sum(payload["average_rpe_values"]) / len(payload["average_rpe_values"]), 2)
            if payload["average_rpe_values"]
            else None,
            "last_performed_date": payload["last_performed_date"],
        }
        for category, payload in lift_analytics.items()
    }

    return {
        "exercise_analytics": exercise_analytics,
        "lift_analytics": lift_analytics_payload,
        "session_analytics": sorted(session_analytics, key=lambda x: x["date"], reverse=True),
        "suggestions": suggestions,
        "routine_templates": routines,
    }
