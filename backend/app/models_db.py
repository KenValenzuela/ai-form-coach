from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, Float
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

class WorkoutSessionRecord(Base):
    __tablename__ = "workout_sessions"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    start_time = Column(DateTime(timezone=True), nullable=False, index=True)
    end_time = Column(DateTime(timezone=True), nullable=True)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ExerciseSetRecord(Base):
    __tablename__ = "exercise_sets"

    id = Column(Integer, primary_key=True, index=True)
    workout_session_id = Column(Integer, ForeignKey("workout_sessions.id"), nullable=False, index=True)
    exercise_title = Column(String, nullable=False, index=True)
    superset_id = Column(String, nullable=True)
    exercise_notes = Column(Text, nullable=True)
    set_index = Column(Integer, nullable=False)
    set_type = Column(String, nullable=True)
    weight_lbs = Column(Integer, nullable=True)
    reps = Column(Integer, nullable=True)
    distance_miles = Column(Float, nullable=True)
    duration_seconds = Column(Integer, nullable=True)
    rpe = Column(Float, nullable=True)
    dedupe_hash = Column(String, nullable=False, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
