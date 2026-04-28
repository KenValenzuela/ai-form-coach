from __future__ import annotations

from pathlib import Path

import pytest
from fastapi import HTTPException

from app.utils.data_paths import FRAMES_DIR, OVERLAYS_DIR, PREVIEWS_DIR, PROCESSED_DIR, TRACKING_DIR, UPLOADS_DIR, ensure_data_dirs
from app.utils.video_result import resolve_final_video_url, validate_and_select_display_artifact
from app.utils.video_urls import build_static_url


def test_static_folders_are_created() -> None:
    ensure_data_dirs()

    expected_dirs = {UPLOADS_DIR, PROCESSED_DIR, TRACKING_DIR, OVERLAYS_DIR, PREVIEWS_DIR, FRAMES_DIR}

    for folder in expected_dirs:
        assert folder.exists() and folder.is_dir()


def test_main_has_expected_static_mounts() -> None:
    source = (Path(__file__).resolve().parents[1] / "app" / "main.py").read_text()
    for route in (
        "/uploads",
        "/processed",
        "/tracking",
        "/overlays",
        "/previews",
        "/frames",
    ):
        assert route in source


def test_display_video_prefers_tracked_over_processed() -> None:
    ensure_data_dirs()
    tracked_file = TRACKING_DIR / "tracked_output.mp4"
    processed_file = PROCESSED_DIR / "processed_output.mp4"
    tracked_file.write_bytes(b"tracked")
    processed_file.write_bytes(b"processed")
    try:
        display_url, display_path = validate_and_select_display_artifact(
            raw_video_url="/uploads/raw.mp4",
            processed_video_url="/processed/processed_output.mp4",
            tracked_video_url="/tracking/tracked_output.mp4",
        )
        assert display_url == "/tracking/tracked_output.mp4"
        assert display_path.resolve() == tracked_file.resolve()
    finally:
        tracked_file.unlink(missing_ok=True)
        processed_file.unlink(missing_ok=True)


def test_display_video_prefers_processed_over_raw() -> None:
    ensure_data_dirs()
    processed_file = PROCESSED_DIR / "processed_only.mp4"
    processed_file.write_bytes(b"processed")
    try:
        display_url, display_path = validate_and_select_display_artifact(
            raw_video_url="/uploads/raw.mp4",
            processed_video_url="/processed/processed_only.mp4",
            tracked_video_url="/tracking/missing.mp4",
        )
        assert display_url == "/processed/processed_only.mp4"
        assert display_path.resolve() == processed_file.resolve()
        assert display_url != "/uploads/raw.mp4"
    finally:
        processed_file.unlink(missing_ok=True)


def test_missing_outputs_raise_500() -> None:
    with pytest.raises(HTTPException) as exc:
        validate_and_select_display_artifact(
            raw_video_url="/uploads/raw.mp4",
            processed_video_url="/processed/missing.mp4",
            tracked_video_url="/tracking/missing.mp4",
        )

    assert exc.value.status_code == 500
    assert "no valid tracked/processed output" in str(exc.value.detail).lower()


def test_build_static_url_maps_processed_and_tracking_files() -> None:
    processed_url = build_static_url(PROCESSED_DIR / "example_processed.mp4")
    tracking_url = build_static_url(TRACKING_DIR / "example_tracked.mp4")

    assert processed_url == "/processed/example_processed.mp4"
    assert tracking_url == "/tracking/example_tracked.mp4"


def test_resolve_final_video_url_prefers_tracked_then_processed() -> None:
    ensure_data_dirs()
    tracked_file = TRACKING_DIR / "resolve_tracked.mp4"
    processed_file = PROCESSED_DIR / "resolve_processed.mp4"
    tracked_file.write_bytes(b"tracked")
    processed_file.write_bytes(b"processed")
    try:
        selected = resolve_final_video_url(
            tracked_video_url="/tracking/resolve_tracked.mp4",
            processed_video_url="/processed/resolve_processed.mp4",
            raw_video_url="/uploads/raw.mp4",
        )
        assert selected == "/tracking/resolve_tracked.mp4"

        tracked_file.unlink(missing_ok=True)
        selected_processed = resolve_final_video_url(
            tracked_video_url="/tracking/resolve_tracked.mp4",
            processed_video_url="/processed/resolve_processed.mp4",
            raw_video_url="/uploads/raw.mp4",
        )
        assert selected_processed == "/processed/resolve_processed.mp4"
    finally:
        tracked_file.unlink(missing_ok=True)
        processed_file.unlink(missing_ok=True)


def test_resolve_final_video_url_uses_raw_only_when_enabled() -> None:
    ensure_data_dirs()
    raw_file = UPLOADS_DIR / "resolve_raw.mp4"
    raw_file.write_bytes(b"raw")
    try:
        selected_without_fallback = resolve_final_video_url(
            tracked_video_url="/tracking/missing.mp4",
            processed_video_url="/processed/missing.mp4",
            raw_video_url="/uploads/resolve_raw.mp4",
            allow_raw_fallback=False,
        )
        assert selected_without_fallback is None

        selected_with_fallback = resolve_final_video_url(
            tracked_video_url="/tracking/missing.mp4",
            processed_video_url="/processed/missing.mp4",
            raw_video_url="/uploads/resolve_raw.mp4",
            allow_raw_fallback=True,
        )
        assert selected_with_fallback == "/uploads/resolve_raw.mp4"
    finally:
        raw_file.unlink(missing_ok=True)
