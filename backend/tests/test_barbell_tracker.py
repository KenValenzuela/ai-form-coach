from app.services.barbell_tracker import (
    _calculate_metrics,
    _resolve_initial_roi,
    _should_reject_jump,
    _smooth_path_moving_average,
)


def test_resolve_initial_roi_scaling_with_manual_roi() -> None:
    x, y, w, h = _resolve_initial_roi(
        frame_w=640,
        frame_h=360,
        anchor_x=0.5,
        anchor_y=0.5,
        bbox_width=0.05,
        bbox_height=0.05,
        roi_x=0.25,
        roi_y=0.4,
        roi_w=0.1,
        roi_h=0.2,
    )
    assert (x, y, w, h) == (160, 144, 64, 72)


def test_path_smoothing_moving_average() -> None:
    points = [
        {"frame": 0, "time_sec": 0.0, "x": 10.0, "y": 100.0},
        {"frame": 1, "time_sec": 0.03, "x": 20.0, "y": 110.0},
        {"frame": 2, "time_sec": 0.06, "x": 30.0, "y": 120.0},
    ]
    smoothed = _smooth_path_moving_average(points, window=2)
    assert smoothed[-1]["x"] == 25.0
    assert smoothed[-1]["y"] == 115.0


def test_jump_rejection() -> None:
    assert _should_reject_jump((100.0, 100.0), (105.0, 108.0), max_jump_px=20.0) is False
    assert _should_reject_jump((100.0, 100.0), (250.0, 260.0), max_jump_px=20.0) is True


def test_metric_calculation() -> None:
    metrics = _calculate_metrics(
        [
            {"frame": 0, "time_sec": 0.0, "x": 100.0, "y": 250.0, "confidence": 0.9},
            {"frame": 1, "time_sec": 0.03, "x": 120.0, "y": 200.0, "confidence": 0.9},
            {"frame": 2, "time_sec": 0.06, "x": 110.0, "y": 210.0, "confidence": 0.9},
        ]
    )
    assert metrics["horizontal_deviation_px"] == 20.0
    assert metrics["vertical_range_px"] == 50.0
    assert metrics["tracking_quality_score"] > 0.0
