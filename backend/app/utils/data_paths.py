from __future__ import annotations

from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = APP_DIR / "data"
UPLOADS_DIR = DATA_DIR / "uploads"
PROCESSED_DIR = DATA_DIR / "processed"
OVERLAYS_DIR = DATA_DIR / "overlays"
TRACKING_DIR = DATA_DIR / "tracking"
TIMINGS_DIR = DATA_DIR / "timings"


def ensure_data_dirs() -> None:
    for folder in (DATA_DIR, UPLOADS_DIR, PROCESSED_DIR, OVERLAYS_DIR, TRACKING_DIR, TIMINGS_DIR):
        folder.mkdir(parents=True, exist_ok=True)


def build_data_url(path: Path) -> str:
    resolved = path.resolve()
    data_root = DATA_DIR.resolve()
    rel_path = resolved.relative_to(data_root)
    return f"/static/{rel_path.as_posix()}"
