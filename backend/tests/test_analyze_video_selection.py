from pathlib import Path

from app.utils.data_paths import DATA_DIR as DATA_PATHS_DATA_DIR
from app.utils.video_urls import DATA_DIR as VIDEO_URLS_DATA_DIR
from app.utils.video_urls import build_static_url, select_processed_video_url


def test_select_processed_video_url_prefers_tracked_mp4() -> None:
    raw_video_url = "/uploads/source.mp4"
    tracked_video_url = "/processed/example_processed.mp4"
    selected_video_url = select_processed_video_url(
        tracked_video_url=tracked_video_url,
        processed_video_url="/processed/example_processed.mp4",
        overlay_video_url="/overlays/example_overlay.mp4",
    )

    assert selected_video_url is not None
    assert selected_video_url.endswith("_processed.mp4")
    assert "/processed/" in selected_video_url
    assert selected_video_url != raw_video_url


def test_build_static_url_maps_processed_files_under_data_dir() -> None:
    processed_path = VIDEO_URLS_DATA_DIR / "processed" / "sample_processed.mp4"
    static_url = build_static_url(processed_path)

    assert static_url == "/processed/sample_processed.mp4"


def test_data_dir_points_to_backend_app_data() -> None:
    expected = Path(__file__).resolve().parents[1] / "app" / "data"

    assert VIDEO_URLS_DATA_DIR.resolve() == expected.resolve()


def test_data_paths_and_video_urls_share_same_data_dir() -> None:
    assert DATA_PATHS_DATA_DIR.resolve() == VIDEO_URLS_DATA_DIR.resolve()
