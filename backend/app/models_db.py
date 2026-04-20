from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from .database import Base


class VideoRecord(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, nullable=False)
    stored_path = Column(String, nullable=False)
    exercise_type = Column(String, nullable=False)
    camera_view = Column(String, nullable=False)
    upload_time = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String, nullable=False, default="uploaded")


class AnalysisResultRecord(Base):
    __tablename__ = "analysis_results"

    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(Integer, ForeignKey("videos.id"), nullable=False)
    rep_count = Column(Integer, nullable=False)
    summary_status = Column(String, nullable=False)
    issues_json = Column(Text, nullable=False)
    metrics_json = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())