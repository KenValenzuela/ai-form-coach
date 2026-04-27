from __future__ import annotations

from pathlib import Path

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
