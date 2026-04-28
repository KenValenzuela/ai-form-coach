from __future__ import annotations

import json
import logging
import os
import re
import shutil
import traceback
from pathlib import Path
from time import perf_counter
from uuid import uuid4

import cv2
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Literal, Optional

from ...database import SessionLocal
from ...models_db import AnalysisResultRecord, VideoRecord
from ...schemas.analysis import AnalysisResponse
from ...services.analysis_pipeline import analyze_squat_video
from ...services.barbell_tracker import track_barbell_from_time, track_barbell_path
from ...services.timing_log import write_timing_log
from ...utils.data_paths import OVERLAYS_DIR, PROCESSED_DIR, TRACKING_DIR, UPLOADS_DIR, build_data_url
from ...utils.json_sanitize import sanitize_for_json

UPLOAD_DIR = str(UPLOADS_DIR)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

MAX_RECOMMENDED_DURATION_SECONDS = 45.0
HARD_MAX_DURATION_SECONDS = 120.0

router = APIRouter(tags=["analysis"])
logger = logging.getLogger(__name__)


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
    tracked_boxes: Optional[list[dict]] = None
    fps_by_frame: list[dict[str, float]] = []
    tracking_records: list[dict] = []
    average_fps: float
    average_processing_fps: Optional[float] = None
    video_fps: Optional[float] = None
    tracking_success_rate: float
    tracking_method_used: Optional[str] = None
    tracking_quality_score: Optional[float] = None
    tracking_failures: Optional[int] = None
    path_metrics: dict[str, float | None]
    bar_path_raw: list[dict] = []
    bar_path_smooth: list[dict] = []
    horizontal_deviation_px: Optional[float] = None
    vertical_range_px: Optional[float] = None
    lost_frames: list[int]
    tracker_type: str
    start_frame: int
    end_frame: int
    tracking_csv_url: Optional[str] = None
    annotated_video_url: Optional[str] = None
    stage_timings: dict[str, float] = {}
    timing_log_url: Optional[str] = None
    warnings: list[str] = []
    debug: Optional[dict] = None


class PreviewFrameResponse(BaseModel):
    frame_number: int
    width: int
    height: int
    scale_factor: float
    preview_image_url: str


class TrackerUploadResponse(BaseModel):
    video_id: int
    video_url: str
    frame_number: int
    width: int
    height: int
    scale_factor: float
    preview_image_url: str
    metadata: dict[str, float | int]


class VideoFrameResponse(BaseModel):
    video_id: int
    time: float
    frame_index: int
    width: int
    height: int
    preview_image_url: str


class RoiPayload(BaseModel):
    x: float
    y: float
    width: float
    height: float


class BarbellTrackRequest(BaseModel):
    video_id: int
    start_time: Optional[float] = Field(default=None, ge=0.0)
    startTimeSeconds: Optional[float] = Field(default=None, ge=0.0)
    startFrameIndex: Optional[int] = Field(default=None, ge=0)
    roi: RoiPayload
    tracker_type: str = "CSRT"


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _read_video_metadata(video_path: str) -> tuple[float, int, int, int]:
    resolved_path = _resolve_video_path(video_path)

    if not os.path.exists(resolved_path):
        raise FileNotFoundError(f"Video not found: {video_path}")

    cap = cv2.VideoCapture(resolved_path)

    if not cap.isOpened():
        raise ValueError(f"Unable to open video: {video_path}")

    fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)

    ok, frame = cap.read()
    cap.release()

    if not ok or frame is None or frame.size == 0:
        raise ValueError("Could not read first frame from uploaded video")

    logger.info(
        "video_metadata path=%s fps=%.3f frame_count=%s width=%s height=%s",
        resolved_path,
        fps,
        frame_count,
        width,
        height,
    )

    return fps, frame_count, width, height


def is_valid_frame(frame):
    return frame is not None and hasattr(frame, "size") and frame.size > 0


def _resolve_video_path(video_path: str) -> str:
    if not video_path:
        return video_path

    cleaned = str(video_path).strip()

    if cleaned.startswith("/uploads/"):
        candidate = str(UPLOADS_DIR / os.path.basename(cleaned))
        return candidate

    return cleaned


def _build_upload_filename(original_name: str) -> str:
    ext = os.path.splitext(original_name)[1].lower()
    stem = Path(original_name).stem
    safe_stem = re.sub(r"[^a-zA-Z0-9._-]+", "_", stem).strip("._-") or "upload"
    candidate = f"{safe_stem}{ext}"

    if not os.path.exists(os.path.join(UPLOAD_DIR, candidate)):
        return candidate

    return f"{safe_stem}_{uuid4().hex[:8]}{ext}"


def _normalize_roi(
    roi_x: Optional[float],
    roi_y: Optional[float],
    roi_w: Optional[float],
    roi_h: Optional[float],
    src_width: int,
    src_height: int,
    target_scale_factor: float,
) -> tuple[Optional[float], Optional[float], Optional[float], Optional[float]]:
    if None in {roi_x, roi_y, roi_w, roi_h}:
        return roi_x, roi_y, roi_w, roi_h

    rx, ry, rw, rh = float(roi_x), float(roi_y), float(roi_w), float(roi_h)

    if rw <= 0 or rh <= 0:
        raise HTTPException(status_code=400, detail="Invalid ROI: width/height must be positive.")

    if any(v > 1.0 for v in (rx, ry, rw, rh)):
        scale = max(1e-6, float(target_scale_factor or 1.0))
        display_w = max(1.0, src_width * scale)
        display_h = max(1.0, src_height * scale)

        rx = rx / display_w
        ry = ry / display_h
        rw = rw / display_w
        rh = rh / display_h

    rx = max(0.0, min(1.0, rx))
    ry = max(0.0, min(1.0, ry))
    rw = max(0.0, min(1.0 - rx, rw))
    rh = max(0.0, min(1.0 - ry, rh))

    if rw <= 0.0 or rh <= 0.0:
        raise HTTPException(status_code=400, detail="Invalid ROI: ROI must remain in frame bounds with non-zero size.")

    return rx, ry, rw, rh


def url_if_valid_processed_file(path: Path | None) -> str | None:
    if not path or not path.exists() or not path.is_file():
        return None
    if path.stat().st_size < 10_000:
        return None
    return build_data_url(path)


@router.post("/analyze", response_model=AnalysisResponse)
@router.post("/analyze-video", response_model=AnalysisResponse)
def analyze_video(
    exercise_type: str = Form(...),
    camera_view: str = Form("side"),
    video: UploadFile = File(...),
    roi_x: Optional[float] = Form(None),
    roi_y: Optional[float] = Form(None),
    roi_w: Optional[float] = Form(None),
    roi_h: Optional[float] = Form(None),
    tracker_type: Literal["kcf", "csrt"] = Form("csrt"),
    frame_stride: int = Form(1),
    analysis_downscale: float = Form(1.0),
    fast_mode: bool = Form(True),
    target_center_x: Optional[float] = Form(None),
    target_center_y: Optional[float] = Form(None),
    target_frame_number: int = Form(0),
    target_start_time_seconds: Optional[float] = Form(None),
    roi_frame_index: Optional[int] = Form(None),
    roi_timestamp: Optional[float] = Form(None),
    target_scale_factor: float = Form(1.0),
    include_tracking_summary: bool = Form(True),
    db: Session = Depends(get_db),
):
    """Primary MVP endpoint: upload squat video, run pose analysis, optionally append tracking summary."""
    upload_started = perf_counter()

    if exercise_type.lower() != "squat":
        raise HTTPException(status_code=400, detail="MVP currently supports only squat.")

    ext = os.path.splitext(video.filename)[1].lower()

    if ext not in {".mp4", ".mov", ".avi", ".mkv"}:
        raise HTTPException(status_code=400, detail="Unsupported video format.")

    original_name = os.path.basename(video.filename)
    safe_name = _build_upload_filename(original_name)
    stored_path = os.path.join(UPLOAD_DIR, safe_name)

    with open(stored_path, "wb") as buffer:
        shutil.copyfileobj(video.file, buffer)

    upload_seconds = perf_counter() - upload_started
    source_video_path = _resolve_video_path(stored_path)

    try:
        detected_fps, total_frames, src_width, src_height = _read_video_metadata(source_video_path)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    cap_probe = cv2.VideoCapture(source_video_path)

    if not cap_probe.isOpened():
        raise HTTPException(status_code=400, detail="Invalid video path or unable to open uploaded video.")

    cap_probe.release()

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

        roi_x, roi_y, roi_w, roi_h = _normalize_roi(
            roi_x,
            roi_y,
            roi_w,
            roi_h,
            src_width=src_width,
            src_height=src_height,
            target_scale_factor=target_scale_factor,
        )

        if None not in {roi_x, roi_y, roi_w, roi_h}:
            roi_frame_to_read = int(max(0, roi_frame_index if roi_frame_index is not None else target_frame_number))
            roi_frame_to_read = min(roi_frame_to_read, max(0, total_frames - 1))

            roi_cap = cv2.VideoCapture(source_video_path)
            roi_cap.set(cv2.CAP_PROP_POS_FRAMES, roi_frame_to_read)
            ret, roi_frame = roi_cap.read()
            roi_cap.release()

            if not ret or not is_valid_frame(roi_frame):
                raise HTTPException(status_code=422, detail="ROI validation failed: selected frame cannot be read.")

        pipeline_result = analyze_squat_video(
            source_video_path,
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

        requested_start_frame = max(0, int(roi_frame_index if roi_frame_index is not None else target_frame_number))
        requested_start_time = roi_timestamp if roi_timestamp is not None else target_start_time_seconds

        if requested_start_time is not None and detected_fps > 0:
            requested_start_frame = max(0, int(round(float(requested_start_time) * detected_fps)))

        requested_start_frame = min(requested_start_frame, max(0, total_frames - 1))
        requested_start_time_seconds = requested_start_frame / detected_fps if detected_fps > 0 else 0.0

        response_payload = {
            "video_id": video_record.id,
            "exercise": pipeline_result["exercise"],
            "camera_view": pipeline_result["camera_view"],
            "rep_count": pipeline_result["rep_count"],
            "summary_status": pipeline_result["summary_status"],
            "fps": pipeline_result["fps"],
            "results": pipeline_result["results"],
            "disclaimer": pipeline_result["disclaimer"],
            "video_url": build_data_url(UPLOADS_DIR / safe_name),
            "raw_video_url": build_data_url(UPLOADS_DIR / safe_name),
            "processed_video_url": None,
            "tracked_video_url": None,
            "display_video_url": None,
            "overlay_image_url": pipeline_result.get("overlay_image_url"),
            "stage_timings": full_stage_timings,
            "frame_processing": pipeline_result.get("frame_processing"),
            "timing_log_url": timing_log_url,
            "warnings": runtime_warnings,
            "initial_target": {
                "x": target_center_x
                if target_center_x is not None
                else ((roi_x + (roi_w / 2.0)) if None not in {roi_x, roi_w} else 0.5),
                "y": target_center_y
                if target_center_y is not None
                else ((roi_y + (roi_h / 2.0)) if None not in {roi_y, roi_h} else 0.5),
                "width": roi_w if roi_w is not None else 0.08,
                "height": roi_h if roi_h is not None else 0.08,
                "frame_number": requested_start_frame,
                "start_time_seconds": requested_start_time_seconds,
                "scale_factor": target_scale_factor,
            },
            "upload_timing_seconds": round(upload_seconds, 4),
            "artifact_paths": {
                "upload_path": str(Path(stored_path).resolve()),
                "processed_path": None,
                "tracked_path": None,
            },
        }

        tracking_requested = bool(include_tracking_summary and None not in {roi_x, roi_y, roi_w, roi_h})
        print("[analyze] raw_video_url:", response_payload.get("raw_video_url"))
        print("[analyze] roi:", {"x": roi_x, "y": roi_y, "w": roi_w, "h": roi_h})
        print("[analyze] tracking requested:", tracking_requested)

        if include_tracking_summary:
            tracking_started = perf_counter()

            try:
                tracking_result = track_barbell_path(
                    video_path=source_video_path,
                    anchor_x=target_center_x
                    if target_center_x is not None
                    else ((roi_x + (roi_w / 2.0)) if None not in {roi_x, roi_w} else 0.5),
                    anchor_y=target_center_y
                    if target_center_y is not None
                    else ((roi_y + (roi_h / 2.0)) if None not in {roi_y, roi_h} else 0.5),
                    start_frame=requested_start_frame,
                    roi_x=roi_x,
                    roi_y=roi_y,
                    roi_w=roi_w,
                    roi_h=roi_h,
                    tracker_type=tracker_type,
                    frame_stride=frame_stride,
                    analysis_downscale=analysis_downscale,
                    output_kind="processed",
                )

                tracked_result = None
                if tracking_requested:
                    tracked_result = track_barbell_path(
                        video_path=source_video_path,
                        anchor_x=target_center_x
                        if target_center_x is not None
                        else ((roi_x + (roi_w / 2.0)) if None not in {roi_x, roi_w} else 0.5),
                        anchor_y=target_center_y
                        if target_center_y is not None
                        else ((roi_y + (roi_h / 2.0)) if None not in {roi_y, roi_h} else 0.5),
                        start_frame=requested_start_frame,
                        roi_x=roi_x,
                        roi_y=roi_y,
                        roi_w=roi_w,
                        roi_h=roi_h,
                        tracker_type=tracker_type,
                        frame_stride=frame_stride,
                        analysis_downscale=analysis_downscale,
                        output_kind="tracked",
                    )

                tracking_total = perf_counter() - tracking_started

                response_payload["tracking_summary"] = {
                    "tracker_type": tracking_result["tracker_type"],
                    "tracking_method_used": tracking_result.get("tracking_method_used"),
                    "average_fps": tracking_result["average_fps"],
                    "average_processing_fps": tracking_result.get("average_processing_fps"),
                    "video_fps": tracking_result.get("video_fps"),
                    "tracking_success_rate": tracking_result["tracking_success_rate"],
                    "tracking_quality_score": tracking_result.get("tracking_quality_score"),
                    "tracking_failures": tracking_result.get("tracking_failures"),
                    "tracking_start_frame": tracking_result.get("start_frame"),
                    "tracking_start_time_seconds": tracking_result.get("start_time_seconds"),
                    "lost_frames": tracking_result["lost_frames"],
                    "path_metrics": tracking_result["path_metrics"],
                    "horizontal_deviation_px": tracking_result.get("horizontal_deviation_px"),
                    "vertical_range_px": tracking_result.get("vertical_range_px"),
                    "bar_path_raw": tracking_result.get("bar_path_raw", []),
                    "bar_path_smooth": tracking_result.get("bar_path_smooth", []),
                    "stage_timings": tracking_result.get("stage_timings", {}),
                    "request_tracking_total_seconds": round(tracking_total, 4),
                    "timing_log_url": tracking_result.get("timing_log_url"),
                }

                response_payload["tracking_csv_url"] = tracking_result.get("tracking_csv_url")
                response_payload["annotated_video_url"] = tracking_result.get("annotated_video_url")
                response_payload["processed_video_url"] = tracking_result.get("processed_video_url")
                response_payload["tracked_video_url"] = (
                    tracked_result.get("tracked_video_url")
                    if tracked_result is not None
                    else tracking_result.get("tracked_video_url")
                )

                smoothed_points = tracking_result.get("bar_path_smooth", []) or []

                response_payload["tracking"] = {
                    "points": smoothed_points,
                    "points_count": len(smoothed_points),
                    "frames_written": tracking_result.get("frames_written", 0),
                    "tracking_lost": tracking_result.get("tracking_lost", False),
                }

            except ValueError as tracking_exc:
                runtime_warnings.append(f"Tracking skipped: {tracking_exc}")
            except Exception as e:
                logger.exception("Video processing/tracking failed")
                raise RuntimeError(f"Video processing/tracking failed: {e}") from e

        raw_video_url = response_payload.get("raw_video_url")
        tracked_video_url = response_payload.get("tracked_video_url")
        processed_video_url = response_payload.get("processed_video_url")
        stem = Path(safe_name).stem
        temp_path = PROCESSED_DIR / f"{stem}_opencv_tmp.mp4"
        processed_path = PROCESSED_DIR / f"{stem}_processed.mp4"
        tracked_path = PROCESSED_DIR / f"{stem}_tracked.mp4"
        if not tracked_path.exists():
            tracked_tracking_dir = TRACKING_DIR / f"{stem}_tracked.mp4"
            if tracked_tracking_dir.exists():
                tracked_path = tracked_tracking_dir

        processed_video_url = url_if_valid_processed_file(processed_path)
        tracked_video_url = url_if_valid_processed_file(tracked_path)
        final_video_url = tracked_video_url or processed_video_url

        print("[analyze] temp output exists:", temp_path.exists(), temp_path)
        print("[analyze] processed target:", processed_path)
        print("[analyze] processed exists:", processed_path.exists())
        print("[analyze] processed size:", processed_path.stat().st_size if processed_path.exists() else None)
        print("[analyze] tracked target:", tracked_path if "tracked_path" in locals() else None)
        print("[analyze] tracked exists:", tracked_path.exists() if "tracked_path" in locals() else None)
        print("[analyze] processed_video_url:", processed_video_url)
        print("[analyze] tracked_video_url:", tracked_video_url)
        print("[analyze] final_video_url:", final_video_url)

        if not final_video_url:
            response_payload["status"] = "failed"
            response_payload["error"] = "Processed/tracked video was not generated"
            response_payload["processed_video_url"] = None
            response_payload["tracked_video_url"] = None
            response_payload["final_video_url"] = None
            response_payload["display_video_url"] = None
            response_payload["selected_video_url"] = None
            response_payload["video_url"] = None
            return sanitize_for_json(response_payload)

        response_payload["status"] = "success"
        response_payload["error"] = None
        response_payload["processed_video_url"] = processed_video_url
        response_payload["tracked_video_url"] = tracked_video_url
        response_payload["display_video_url"] = final_video_url
        response_payload["final_video_url"] = final_video_url
        response_payload["selected_video_url"] = final_video_url
        response_payload["video_url"] = final_video_url
        response_payload["artifact_paths"]["processed_path"] = str(processed_path.resolve()) if processed_path.exists() else None
        response_payload["artifact_paths"]["tracked_path"] = str(tracked_path.resolve()) if tracked_path.exists() else None

        logger.info(
            "analyze_video_artifacts upload_path=%s processed_path=%s tracked_path=%s selected_display_path=%s selected_display_url=%s",
            response_payload["artifact_paths"].get("upload_path"),
            response_payload["artifact_paths"].get("processed_path"),
            response_payload["artifact_paths"].get("tracked_path"),
            response_payload["artifact_paths"].get("tracked_path") or response_payload["artifact_paths"].get("processed_path"),
            final_video_url,
        )

        return sanitize_for_json(response_payload)

    except HTTPException:
        video_record.status = "failed"
        db.commit()
        raise
    except Exception as exc:
        video_record.status = "failed"
        db.commit()

        logger.exception(
            "analyze_video_failed path=%s output=%s roi=%s frame_index=%s roi_timestamp=%s width=%s height=%s fps=%.3f total_frames=%s traceback=%s",
            source_video_path,
            build_data_url(UPLOADS_DIR / safe_name),
            {"x": roi_x, "y": roi_y, "w": roi_w, "h": roi_h},
            roi_frame_index if roi_frame_index is not None else target_frame_number,
            roi_timestamp if roi_timestamp is not None else target_start_time_seconds,
            src_width if "src_width" in locals() else None,
            src_height if "src_height" in locals() else None,
            detected_fps if "detected_fps" in locals() else 0.0,
            total_frames if "total_frames" in locals() else None,
            traceback.format_exc(),
        )

        raise HTTPException(status_code=500, detail="Unexpected server error during video analysis.") from exc


@router.post("/analyze/{video_id}/track-path", response_model=TrackPathResponse)
def track_path(video_id: int, payload: TrackPathRequest, db: Session = Depends(get_db)):
    """Track a user-selected barbell ROI for a previously uploaded video."""
    video_record = db.query(VideoRecord).filter(VideoRecord.id == video_id).first()

    if not video_record:
        raise HTTPException(status_code=404, detail="Video not found.")

    if not os.path.exists(video_record.stored_path):
        raise HTTPException(status_code=404, detail="Stored video file missing.")

    if None in {payload.roi_x, payload.roi_y, payload.roi_w, payload.roi_h}:
        raise HTTPException(
            status_code=400,
            detail="ROI selection is required. Please select a barbell sleeve/endcap region before tracking.",
        )

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
            output_kind="tracked",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return sanitize_for_json(tracked_path)


@router.post("/analyze/preview-frame", response_model=PreviewFrameResponse)
def preview_frame(video: UploadFile = File(...), analysis_downscale: float = Form(1.0)):
    ext = os.path.splitext(video.filename)[1].lower()

    if ext not in {".mp4", ".mov", ".avi", ".mkv", ".webm"}:
        raise HTTPException(status_code=400, detail="Unsupported video format.")

    safe_name = f"preview_{uuid4().hex}{ext}"
    stored_path = os.path.join(UPLOAD_DIR, safe_name)

    with open(stored_path, "wb") as buffer:
        shutil.copyfileobj(video.file, buffer)

    try:
        _read_video_metadata(stored_path)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    cap = cv2.VideoCapture(stored_path)
    ok, frame = cap.read()
    cap.release()

    if not ok or frame is None or frame.size == 0:
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
    preview_path = OVERLAYS_DIR / preview_name

    cv2.imwrite(preview_path, frame)

    return sanitize_for_json(
        {
            "frame_number": 0,
            "width": frame_w,
            "height": frame_h,
            "scale_factor": analysis_downscale,
            "preview_image_url": build_data_url(preview_path),
        }
    )


@router.post("/analyze/upload-tracker-video", response_model=TrackerUploadResponse)
def upload_tracker_video(
    video: UploadFile = File(...),
    exercise_type: str = Form("squat"),
    camera_view: str = Form("side"),
    analysis_downscale: float = Form(1.0),
    db: Session = Depends(get_db),
):
    ext = os.path.splitext(video.filename)[1].lower()

    if ext not in {".mp4", ".mov", ".avi", ".mkv", ".webm"}:
        raise HTTPException(status_code=400, detail="Unsupported video format.")

    original_name = os.path.basename(video.filename)
    safe_name = _build_upload_filename(original_name)
    stored_path = os.path.join(UPLOAD_DIR, safe_name)

    with open(stored_path, "wb") as buffer:
        shutil.copyfileobj(video.file, buffer)

    try:
        fps, frame_count, width, height = _read_video_metadata(stored_path)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    cap = cv2.VideoCapture(stored_path)
    ok, frame = cap.read()
    cap.release()

    if not ok or frame is None or frame.size == 0:
        raise HTTPException(status_code=400, detail="Unable to decode first frame from uploaded video.")

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
    preview_path = OVERLAYS_DIR / preview_name

    cv2.imwrite(preview_path, frame)

    video_record = VideoRecord(
        filename=original_name,
        stored_path=stored_path,
        exercise_type=exercise_type.lower(),
        camera_view=camera_view,
        status="uploaded",
    )

    db.add(video_record)
    db.commit()
    db.refresh(video_record)

    return sanitize_for_json(
        {
            "video_id": video_record.id,
            "video_url": build_data_url(UPLOADS_DIR / safe_name),
            "frame_number": 0,
            "width": frame_w,
            "height": frame_h,
            "scale_factor": analysis_downscale,
            "preview_image_url": build_data_url(preview_path),
            "metadata": {
                "fps": fps,
                "duration": (frame_count / fps) if fps > 0 else 0.0,
                "frame_count": frame_count,
                "width": width,
                "height": height,
            },
        }
    )


@router.get("/video/frame", response_model=VideoFrameResponse)
def get_video_frame(video_id: int = Query(...), time: float = Query(0.0, ge=0.0), db: Session = Depends(get_db)):
    video_record = db.query(VideoRecord).filter(VideoRecord.id == video_id).first()

    if not video_record:
        raise HTTPException(status_code=404, detail="Video not found.")

    if not os.path.exists(video_record.stored_path):
        raise HTTPException(status_code=404, detail=f"Video not found: {video_record.stored_path}")

    try:
        fps, frame_count, width, height = _read_video_metadata(video_record.stored_path)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    frame_index = min(max(0, int(round(time * fps))), max(0, frame_count - 1))

    cap = cv2.VideoCapture(video_record.stored_path)
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
    ok, frame = cap.read()
    cap.release()

    if not ok or frame is None or frame.size == 0:
        raise HTTPException(status_code=400, detail="Unable to decode requested preview frame.")

    preview_name = f"preview_frame_{uuid4().hex}.jpg"
    preview_path = OVERLAYS_DIR / preview_name

    if not cv2.imwrite(preview_path, frame):
        raise HTTPException(status_code=500, detail="Failed to save preview frame.")

    logger.info(
        "video_frame_preview video_id=%s time=%.3f frame_index=%s width=%s height=%s",
        video_id,
        time,
        frame_index,
        width,
        height,
    )

    return sanitize_for_json(
        {
            "video_id": video_id,
            "time": time,
            "frame_index": frame_index,
            "width": width,
            "height": height,
            "preview_image_url": build_data_url(preview_path),
        }
    )


@router.post("/track/barbell")
def track_barbell(payload: BarbellTrackRequest, db: Session = Depends(get_db)):
    video_record = db.query(VideoRecord).filter(VideoRecord.id == payload.video_id).first()

    if not video_record:
        raise HTTPException(status_code=404, detail="Video not found.")

    if not os.path.exists(video_record.stored_path):
        raise HTTPException(status_code=404, detail=f"Video not found: {video_record.stored_path}")

    try:
        requested_start_time = payload.startTimeSeconds

        if requested_start_time is None:
            requested_start_time = payload.start_time if payload.start_time is not None else 0.0

        result = track_barbell_from_time(
            video_path=video_record.stored_path,
            start_time=float(requested_start_time),
            start_frame=payload.startFrameIndex,
            roi=payload.roi.model_dump(),
            tracker_type=payload.tracker_type,
        )

        processed_video_url = result.get("annotated_video_url")
        bar_path_points = result.get("smoothed_tracked_path", [])
        tracking_start_frame = result.get("start_frame")
        tracking_start_time_seconds = result.get("start_time_seconds")
        tracker_type = result.get("tracking_method_used") or result.get("tracker_type")

        return sanitize_for_json(
            {
                "processedVideoUrl": processed_video_url,
                "barPathPoints": bar_path_points,
                "trackingStartFrame": tracking_start_frame,
                "trackingStartTimeSeconds": tracking_start_time_seconds,
                "roi": payload.roi.model_dump(),
                "trackerType": tracker_type,
                "warnings": result.get("warnings", []),
                "processed_video_url": result.get("annotated_video_url"),
                "path_points": result.get("smoothed_tracked_path", []),
                "tracking_start_frame": result.get("start_frame"),
                "tracking_start_time_seconds": result.get("start_time_seconds"),
                "tracking_success_rate": result.get("tracking_success_rate", 0.0),
                "frames_processed": len(result.get("raw_tracked_path", [])),
                "tracking_failures": result.get("tracking_failures", 0),
                "lost_frames": result.get("lost_frames", []),
                "debug": result.get("debug", {}),
            }
        )

    except (FileNotFoundError, ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected tracking error for video_id=%s", payload.video_id)
        raise HTTPException(status_code=500, detail="Unexpected error while tracking barbell.") from exc
