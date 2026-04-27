from __future__ import annotations

from pathlib import Path
from typing import Optional

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def build_static_url(path: Path) -> str:
    """Build a /static/... URL for a file that lives under backend/app/data."""
    resolved = path.resolve()
    try:
        relative = resolved.relative_to(DATA_DIR.resolve())
    except ValueError as exc:
        raise ValueError(f"Path is outside DATA_DIR: {path}") from exc
    return f"/static/{relative.as_posix()}"


def select_processed_video_url(
    tracked_video_url: Optional[str],
    processed_video_url: Optional[str],
    overlay_video_url: Optional[str],
) -> Optional[str]:
    if tracked_video_url:
        return tracked_video_url
    if processed_video_url:
        return processed_video_url
    if overlay_video_url:
        return overlay_video_url
    return None
