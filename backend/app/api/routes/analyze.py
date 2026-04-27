from __future__ import annotations

import json
import os
import shutil
from time import perf_counter
from uuid import uuid4
import cv2
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Literal, Optional
from sqlalchemy.orm import Session

from ...database import SessionLocal
from ...models_db import VideoRecord, AnalysisResultRecord
from ...schemas.analysis import AnalysisResponse
from ...services.analysis_pipeline import analyze_squat_video
from ...services.barbell_tracker import track_barbell_path
from ...services.timing_log import write_timing_log

UPLOAD_DIR = "app/data/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
MAX_RECOMMENDED_DURATION_SECONDS = 45.0
HARD_MAX_DURATION_SECONDS = 120.0

router = APIRouter(tags=["analysis"])


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
    tracker_type: Literal["optical_flow", "kcf", "csrt"] = "csrt"
    frame_stride: int = Field(default=1, ge=1, le=6)
    analysis_downscale: float = Field(default=1.0, ge=0.25, le=1.0)
    export_downscale: float = Field(default=0.75, ge=0.35, le=1.0)
    render_annotated_video: bool = True


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
    tracking_csv_url: Optional[str] = None
    annotated_video_url: Optional[str] = None
    stage_timings: dict[str, float] = {}
    timing_log_url: Optional[str] = None


class PreviewFrameResponse(BaseModel):
    frame_number: int
    width: int
    height: int
    scale_factor: float
    preview_image_url: str


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
    frame_stride: int = Form(1),
    analysis_downscale: float = Form(1.0),
    fast_mode: bool = Form(True),
    target_center_x: Optional[float] = Form(None),
    target_center_y: Optional[float] = Form(None),
    target_frame_number: int = Form(0),
    target_scale_factor: float = Form(1.0),
    include_tracking_summary: bool = Form(False),
    db: Session = Depends(get_db),
):
    upload_started = perf_counter()
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
    upload_seconds = perf_counter() - upload_started
    cap = cv2.VideoCapture(stored_path)
    detected_fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    cap.release()
    estimated_duration_seconds = (total_frames / detected_fps) if detected_fps > 0 else 0.0
    if estimated_duration_seconds > HARD_MAX_DURATION_SECONDS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Video is {estimated_duration_seconds:.1f}s. "
                f"For the MVP demo, upload a short side-view clip under {HARD_MAX_DURATION_SECONDS:.0f}s."
            ),
        )

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
        runtime_warnings: list[str] = []
        if estimated_duration_seconds > MAX_RECOMMENDED_DURATION_SECONDS:
            runtime_warnings.append(
                f"Long clip detected ({estimated_duration_seconds:.1f}s). "
                "Use short side-view clips for faster and more reliable demo runs."
            )
        pipeline_result = analyze_squat_video(
            stored_path,
            camera_view=camera_view,
            frame_stride=frame_stride,
            analysis_downscale=analysis_downscale,
            fast_mode=fast_mode,
        )

        full_stage_timings = dict(pipeline_result.get("stage_timings", {}))
        full_stage_timings["upload_handling_seconds"] = round(upload_seconds, 4)
        timing_log_url = write_timing_log(
            {
                "video_id": video_record.id,
                "filename": original_name,
                "camera_view": camera_view,
                "frame_stride": frame_stride,
                "analysis_downscale": analysis_downscale,
                "stage_timings": full_stage_timings,
                "frame_processing": pipeline_result.get("frame_processing", {}),
            },
            prefix="analysis",
        )
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

        response_payload = {
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
            "stage_timings": full_stage_timings,
            "frame_processing": pipeline_result.get("frame_processing"),
            "timing_log_url": timing_log_url,
            "warnings": runtime_warnings,
            "initial_target": {
                "x": target_center_x if target_center_x is not None else (roi_x + (roi_w / 2.0)),
                "y": target_center_y if target_center_y is not None else (roi_y + (roi_h / 2.0)),
                "width": roi_w,
                "height": roi_h,
                "frame_number": target_frame_number,
                "scale_factor": target_scale_factor,
            },
            "upload_timing_seconds": round(upload_seconds, 4),
        }

        if include_tracking_summary:
            tracking_started = perf_counter()
            tracking_result = track_barbell_path(
                video_path=stored_path,
                anchor_x=target_center_x if target_center_x is not None else (roi_x + (roi_w / 2.0)),
                anchor_y=target_center_y if target_center_y is not None else (roi_y + (roi_h / 2.0)),
                roi_x=roi_x,
                roi_y=roi_y,
                roi_w=roi_w,
                roi_h=roi_h,
                tracker_type=tracker_type,
                frame_stride=frame_stride,
                analysis_downscale=analysis_downscale,
            )
            tracking_total = perf_counter() - tracking_started
            response_payload["tracking_summary"] = {
                "tracker_type": tracking_result["tracker_type"],
                "average_fps": tracking_result["average_fps"],
                "tracking_success_rate": tracking_result["tracking_success_rate"],
                "lost_frames": tracking_result["lost_frames"],
                "path_metrics": tracking_result["path_metrics"],
                "stage_timings": tracking_result.get("stage_timings", {}),
                "request_tracking_total_seconds": round(tracking_total, 4),
                "timing_log_url": tracking_result.get("timing_log_url"),
            }
            response_payload["tracking_csv_url"] = tracking_result.get("tracking_csv_url")
            response_payload["annotated_video_url"] = tracking_result.get("annotated_video_url")

        return response_payload

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
            frame_stride=payload.frame_stride,
            analysis_downscale=payload.analysis_downscale,
            export_downscale=payload.export_downscale,
            render_annotated_video=payload.render_annotated_video,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return tracked_path


@router.post("/analyze/preview-frame", response_model=PreviewFrameResponse)
def preview_frame(video: UploadFile = File(...), analysis_downscale: float = Form(1.0)):
    ext = os.path.splitext(video.filename)[1].lower()
    if ext not in {".mp4", ".mov", ".avi", ".mkv", ".webm"}:
        raise HTTPException(status_code=400, detail="Unsupported video format.")

    safe_name = f"preview_{uuid4().hex}{ext}"
    stored_path = os.path.join(UPLOAD_DIR, safe_name)
    with open(stored_path, "wb") as buffer:
        shutil.copyfileobj(video.file, buffer)

    cap = cv2.VideoCapture(stored_path)
    if not cap.isOpened():
        raise HTTPException(status_code=400, detail="Unable to open video for preview.")

    ok, frame = cap.read()
    cap.release()
    if not ok or frame is None:
        raise HTTPException(status_code=400, detail="Unable to decode preview frame from uploaded video.")

    analysis_downscale = float(max(0.25, min(1.0, analysis_downscale)))
    if analysis_downscale < 1.0:
        h, w = frame.shape[:2]
        frame = cv2.resize(
            frame,
            (max(16, int(w * analysis_downscale)), max(16, int(h * analysis_downscale))),
            interpolation=cv2.INTER_AREA,
        )
    frame_h, frame_w = frame.shape[:2]
    preview_name = f"preview_frame_{uuid4().hex}.jpg"
    preview_path = os.path.join("app/data/overlays", preview_name)
    cv2.imwrite(preview_path, frame)

    return {
        "frame_number": 0,
        "width": frame_w,
        "height": frame_h,
        "scale_factor": analysis_downscale,
        "preview_image_url": f"/static/overlays/{preview_name}",
    }
