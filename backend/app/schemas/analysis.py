from typing import List, Optional
from pydantic import BaseModel


class IssueOut(BaseModel):
    label: str
    severity: str
    feedback: str


class RepMetricsOut(BaseModel):
    min_knee_angle: Optional[float] = None
    min_hip_angle: Optional[float] = None
    max_torso_lean: Optional[float] = None
    bottom_hip_to_knee_delta: Optional[float] = None
    rep_duration_sec: Optional[float] = None
    max_heel_lift_from_baseline: Optional[float] = None
    knee_travel_estimate: Optional[float] = None


class RepResultOut(BaseModel):
    rep_index: int
    start_frame: int
    bottom_frame: int
    end_frame: int
    metrics: RepMetricsOut
    issues: List[IssueOut]
    proxy_bar_path: List[dict[str, float]] = []
    bar_path: List[dict[str, float]] = []
    overlay_image_url: Optional[str] = None


class AnalysisResponse(BaseModel):
    video_id: int
    exercise: str
    camera_view: str
    rep_count: int
    summary_status: str
    fps: float
    results: List[RepResultOut]
    disclaimer: str
    video_url: Optional[str] = None
    overlay_image_url: Optional[str] = None
    tracking_summary: Optional[dict] = None
    stage_timings: Optional[dict] = None
    frame_processing: Optional[dict] = None
    tracking_csv_url: Optional[str] = None
    annotated_video_url: Optional[str] = None
    initial_target: Optional[dict] = None
    upload_timing_seconds: Optional[float] = None
