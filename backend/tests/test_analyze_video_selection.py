from pathlib import Path

from app.utils.video_urls import DATA_DIR as VIDEO_URLS_DATA_DIR
from app.utils.video_urls import build_static_url, select_processed_video_url


def test_select_processed_video_url_prefers_tracked_mp4() -> None:
    raw_video_url = "/static/uploads/source.mp4"
    tracked_video_url = "/static/processed/example_tracked.mp4"
    selected_video_url = select_processed_video_url(
        tracked_video_url=tracked_video_url,
        processed_video_url="/static/processed/example_processed.mp4",
        overlay_video_url="/static/overlays/example_overlay.mp4",
    )

    assert selected_video_url is not None
    assert selected_video_url.endswith("_tracked.mp4")
    assert "/processed/" in selected_video_url
    assert selected_video_url != raw_video_url


def test_build_static_url_maps_processed_files_under_data_dir() -> None:
    processed_path = VIDEO_URLS_DATA_DIR / "processed" / "sample_tracked.mp4"
    static_url = build_static_url(processed_path)

    assert static_url == "/static/processed/sample_tracked.mp4"


def test_data_dir_points_to_backend_app_data() -> None:
    expected = Path(__file__).resolve().parents[1] / "app" / "data"

    assert VIDEO_URLS_DATA_DIR.resolve() == expected.resolve()
