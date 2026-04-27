from __future__ import annotations

from pathlib import Path
from io import BytesIO
import asyncio

import numpy as np
from fastapi import UploadFile

from app.utils.data_paths import PROCESSED_DIR, ensure_data_dirs
from app.utils.json_sanitize import sanitize_for_json
from app.utils.video_result import select_result_video_url


def test_select_result_video_url_prefers_tracked_and_never_raw_fallback():
    ensure_data_dirs()
    tracked_path = PROCESSED_DIR / "unit_test_tracked.mp4"
    tracked_path.write_bytes(b"fake")
    try:
        selected = select_result_video_url(
            tracked_video_url="/static/processed/unit_test_tracked.mp4",
            processed_video_url="/static/processed/missing_processed.mp4",
            overlay_video_url="/static/overlays/missing_overlay.mp4",
        )
        assert selected == "/static/processed/unit_test_tracked.mp4"
        assert selected != "/static/uploads/raw.mp4"
    finally:
        tracked_path.unlink(missing_ok=True)


def test_select_result_video_url_returns_none_when_outputs_missing():
    selected = select_result_video_url(
        tracked_video_url="/static/processed/missing_tracked.mp4",
        processed_video_url="/static/processed/missing_processed.mp4",
        overlay_video_url="/static/overlays/missing_overlay.mp4",
    )
    assert selected is None


def test_sanitize_for_json_handles_numpy_bool_and_array():
    payload = {
        "ok": np.bool_(True),
        "items": np.array([1, 2, 3], dtype=np.int64),
        "score": np.float64(1.5),
    }
    sanitized = sanitize_for_json(payload)
    assert sanitized == {"ok": True, "items": [1, 2, 3], "score": 1.5}


def test_workout_charts_route_sanitizes_numpy_types(monkeypatch):
    from app.api.routes import workouts

    def fake_payload(_file_bytes: bytes):
        return {
            "summary": {"ready": np.bool_(True), "count": np.int64(5)},
            "charts": {"sample": np.array([1.0, 2.0], dtype=np.float64)},
            "path": Path("app/data/processed/file.mp4"),
        }

    monkeypatch.setattr(workouts, "generate_workout_charts_payload", fake_payload)
    upload = UploadFile(
        file=BytesIO(b"title,start_time\nA,2026-01-01 10:00:00\n"),
        filename="workouts.csv",
    )
    body = asyncio.run(workouts.build_workout_charts(upload))
    assert body["summary"]["ready"] is True
    assert body["summary"]["count"] == 5
    assert body["charts"]["sample"] == [1.0, 2.0]
    assert isinstance(body["path"], str)
