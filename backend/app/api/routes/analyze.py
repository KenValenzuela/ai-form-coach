import json
import os
import shutil
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Literal, Optional
from sqlalchemy.orm import Session

from ...database import SessionLocal
from ...models_db import VideoRecord, AnalysisResultRecord
from ...schemas.analysis import AnalysisResponse
from ...services.analysis_pipeline import analyze_squat_video
from ...services.barbell_tracker import track_barbell_path

UPLOAD_DIR = "app/data/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(tags=["analysis"])
ANALYSIS_EXECUTOR = ThreadPoolExecutor(max_workers=2)


class TrackPathRequest(BaseModel):
    anchor_x: float = Field(ge=0.0, le=1.0)
    anchor_y: float = Field(ge=0.0, le=1.0)
    start_frame: int = Field(default=0, ge=0)
    end_frame: Optional[int] = Field(default=None, ge=0)
    bbox_width: float = Field(default=0.05, gt=0.0, le=0.3)
    bbox_height: float = Field(default=0.05, gt=0.0, le=0.3)
    roi_x: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    roi_y: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    roi_w: Optional[float] = Field(default=None, gt=0.0, le=1.0)
    roi_h: Optional[float] = Field(default=None, gt=0.0, le=1.0)
    tracker_type: Literal["optical_flow", "kcf", "csrt"] = "optical_flow"


class TrackPathResponse(BaseModel):
    tracked_path: list[dict]
    raw_tracked_path: list[dict]
    smoothed_tracked_path: list[dict]
    tracked_boxes: list[dict]
    fps_by_frame: list[dict[str, float]]
    tracking_records: list[dict]
    average_fps: float
    tracking_success_rate: float
    path_metrics: dict[str, float | None]
    lost_frames: list[int]
    tracker_type: str
    start_frame: int
    end_frame: int


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
    roi_x: float = Form(...),
    roi_y: float = Form(...),
    roi_w: float = Form(...),
    roi_h: float = Form(...),
    tracker_type: Literal["kcf", "csrt"] = Form("csrt"),
    db: Session = Depends(get_db),
):
    if exercise_type.lower() != "squat":
        raise HTTPException(status_code=400, detail="MVP currently supports only squat.")

    ext = os.path.splitext(video.filename)[1].lower()
    if ext not in {".mp4", ".mov", ".avi", ".mkv"}:
        raise HTTPException(status_code=400, detail="Unsupported video format.")

    original_name = os.path.basename(video.filename)
    safe_name = f"{uuid4().hex}{ext}"
    stored_path = os.path.join(UPLOAD_DIR, safe_name)

    with open(stored_path, "wb") as buffer:
        shutil.copyfileobj(video.file, buffer)

    video_record = VideoRecord(
        filename=original_name,
        stored_path=stored_path,
        exercise_type=exercise_type.lower(),
        camera_view=camera_view,
        status="processing",
    )
    db.add(video_record)
    db.commit()
    db.refresh(video_record)

    try:
        pipeline_future = ANALYSIS_EXECUTOR.submit(
            analyze_squat_video,
            stored_path,
            camera_view=camera_view,
        )
        tracking_future = ANALYSIS_EXECUTOR.submit(
            track_barbell_path,
            video_path=stored_path,
            anchor_x=roi_x + (roi_w / 2.0),
            anchor_y=roi_y + (roi_h / 2.0),
            roi_x=roi_x,
            roi_y=roi_y,
            roi_w=roi_w,
            roi_h=roi_h,
            tracker_type=tracker_type,
        )

        pipeline_result = pipeline_future.result()
        tracking_result = tracking_future.result()

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
            "fps": pipeline_result["fps"],
            "results": pipeline_result["results"],
            "disclaimer": pipeline_result["disclaimer"],
            "video_url": f"/static/uploads/{safe_name}",
            "overlay_image_url": pipeline_result.get("overlay_image_url"),
            "tracking_summary": {
                "tracker_type": tracking_result["tracker_type"],
                "average_fps": tracking_result["average_fps"],
                "tracking_success_rate": tracking_result["tracking_success_rate"],
                "lost_frames": tracking_result["lost_frames"],
                "path_metrics": tracking_result["path_metrics"],
            },
        }

    except Exception as exc:
        video_record.status = "failed"
        db.commit()
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/analyze/{video_id}/track-path", response_model=TrackPathResponse)
def track_path(video_id: int, payload: TrackPathRequest, db: Session = Depends(get_db)):
    video_record = db.query(VideoRecord).filter(VideoRecord.id == video_id).first()
    if not video_record:
        raise HTTPException(status_code=404, detail="Video not found.")

    if not os.path.exists(video_record.stored_path):
        raise HTTPException(status_code=404, detail="Stored video file missing.")

    try:
        tracked_path = track_barbell_path(
            video_path=video_record.stored_path,
            anchor_x=payload.anchor_x,
            anchor_y=payload.anchor_y,
            start_frame=payload.start_frame,
            end_frame=payload.end_frame,
            bbox_width=payload.bbox_width,
            bbox_height=payload.bbox_height,
            roi_x=payload.roi_x,
            roi_y=payload.roi_y,
            roi_w=payload.roi_w,
            roi_h=payload.roi_h,
            tracker_type=payload.tracker_type,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return tracked_path
