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


class RepResultOut(BaseModel):
    rep_index: int
    start_frame: int
    bottom_frame: int
    end_frame: int
    metrics: RepMetricsOut
    issues: List[IssueOut]
    overlay_image_url: Optional[str] = None


class AnalysisResponse(BaseModel):
    video_id: int
    exercise: str
    camera_view: str
    rep_count: int
    summary_status: str
    results: List[RepResultOut]
    disclaimer: str
    overlay_image_url: Optional[str] = None
