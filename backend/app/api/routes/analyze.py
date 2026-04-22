import json
import os
import shutil
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from sqlalchemy.orm import Session

from ...database import SessionLocal
from ...models_db import VideoRecord, AnalysisResultRecord
from ...schemas.analysis import AnalysisResponse
from ...services.analysis_pipeline import analyze_squat_video

UPLOAD_DIR = "app/data/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(tags=["analysis"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/analyze", response_model=AnalysisResponse)
def analyze_video(
    exercise_type: str = Form(...),
    camera_view: str = Form("side"),
    video: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if exercise_type.lower() != "squat":
        raise HTTPException(status_code=400, detail="MVP currently supports only squat.")

    ext = os.path.splitext(video.filename)[1].lower()
    if ext not in {".mp4", ".mov", ".avi", ".mkv"}:
        raise HTTPException(status_code=400, detail="Unsupported video format.")

    safe_name = os.path.basename(video.filename)
    stored_path = os.path.join(UPLOAD_DIR, safe_name)

    with open(stored_path, "wb") as buffer:
        shutil.copyfileobj(video.file, buffer)

    video_record = VideoRecord(
        filename=safe_name,
        stored_path=stored_path,
        exercise_type=exercise_type.lower(),
        camera_view=camera_view,
        status="processing",
    )
    db.add(video_record)
    db.commit()
    db.refresh(video_record)

    try:
        pipeline_result = analyze_squat_video(stored_path, camera_view=camera_view)

        flattened_issues = []
        flattened_metrics = []

        for rep_result in pipeline_result["results"]:
            flattened_issues.extend(rep_result["issues"])
            flattened_metrics.append(rep_result["metrics"])

        analysis_record = AnalysisResultRecord(
            video_id=video_record.id,
            rep_count=pipeline_result["rep_count"],
            summary_status=pipeline_result["summary_status"],
            issues_json=json.dumps(flattened_issues),
            metrics_json=json.dumps(flattened_metrics),
        )
        db.add(analysis_record)

        video_record.status = "completed"
        db.commit()

        return {
            "video_id": video_record.id,
            "exercise": pipeline_result["exercise"],
            "camera_view": pipeline_result["camera_view"],
            "rep_count": pipeline_result["rep_count"],
            "summary_status": pipeline_result["summary_status"],
            "results": pipeline_result["results"],
            "disclaimer": pipeline_result["disclaimer"],
            "overlay_image_url": pipeline_result.get("overlay_image_url"),
        }

    except Exception as exc:
        video_record.status = "failed"
        db.commit()
        raise HTTPException(status_code=500, detail=str(exc))