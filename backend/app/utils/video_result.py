from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException

from .data_paths import DATA_DIR


def url_to_data_path(url: str | None) -> Path | None:
    if not url:
        return None
    cleaned = str(url).strip()
    if not cleaned.startswith("/static/"):
        return None
    rel_path = cleaned.replace("/static/", "", 1)
    return DATA_DIR / rel_path


def select_result_video_url(
    tracked_video_url: str | None,
    processed_video_url: str | None,
    overlay_video_url: str | None,
) -> str | None:
    for candidate in (tracked_video_url, processed_video_url, overlay_video_url):
        candidate_path = url_to_data_path(candidate)
        if candidate and candidate_path and candidate_path.exists():
            return candidate
    return None


def _is_valid_output_file(path: Path | None) -> bool:
    return bool(path and path.exists() and path.is_file() and path.stat().st_size > 0)


def validate_and_select_display_artifact(
    *,
    raw_video_url: str | None,
    processed_video_url: str | None,
    tracked_video_url: str | None,
) -> tuple[str, Path]:
    tracked_path = url_to_data_path(tracked_video_url)
    processed_path = url_to_data_path(processed_video_url)

    selected_url: str | None = None
    selected_path: Path | None = None

    if tracked_video_url and _is_valid_output_file(tracked_path):
        selected_url = tracked_video_url
        selected_path = tracked_path
    elif processed_video_url and _is_valid_output_file(processed_path):
        selected_url = processed_video_url
        selected_path = processed_path

    if not selected_url or not selected_path:
        raise HTTPException(
            status_code=500,
            detail=(
                "Processing completed but no valid tracked/processed output was found. "
                f"raw_video_url={raw_video_url}, processed_video_url={processed_video_url}, tracked_video_url={tracked_video_url}"
            ),
        )

    return selected_url, selected_path
