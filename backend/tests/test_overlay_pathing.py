import unittest

from app.services.analysis_pipeline import _hip_midpoint_path, _barbell_proxy_path
from app.services.overlay_renderer import _compute_midpoint_path_pixels


class OverlayPathingTests(unittest.TestCase):
    def test_hip_midpoint_path_uses_rep_frame_window(self):
        frames = [
            {
                "frame_index": 0,
                "landmarks": {
                    "left_hip": {"x": 0.4, "y": 0.4},
                    "right_hip": {"x": 0.6, "y": 0.4},
                },
            },
            {
                "frame_index": 1,
                "landmarks": {
                    "left_hip": {"x": 0.42, "y": 0.5},
                    "right_hip": {"x": 0.58, "y": 0.5},
                },
            },
            {
                "frame_index": 2,
                "landmarks": {
                    "left_hip": {"x": 0.45, "y": 0.45},
                    "right_hip": {"x": 0.55, "y": 0.45},
                },
            },
        ]

        path = _hip_midpoint_path(frames, start_frame=0, end_frame=2)
        self.assertEqual(path, [{"x": 0.5, "y": 0.4}, {"x": 0.5, "y": 0.5}, {"x": 0.5, "y": 0.45}])

    def test_barbell_proxy_path_prefers_shoulders_and_falls_back_to_hips(self):
        frames = [
            {
                "frame_index": 0,
                "landmarks": {
                    "left_shoulder": {"x": 0.45, "y": 0.25},
                    "right_shoulder": {"x": 0.55, "y": 0.25},
                    "left_hip": {"x": 0.41, "y": 0.45},
                    "right_hip": {"x": 0.59, "y": 0.45},
                },
            },
            {
                "frame_index": 1,
                "landmarks": {
                    "left_hip": {"x": 0.42, "y": 0.52},
                    "right_hip": {"x": 0.58, "y": 0.52},
                },
            },
        ]

        path = _barbell_proxy_path(frames, start_frame=0, end_frame=1)
        self.assertEqual(path, [{"x": 0.5, "y": 0.25}, {"x": 0.5, "y": 0.52}])

    def test_compute_midpoint_path_pixels_converts_normalized_points(self):
        pixels = _compute_midpoint_path_pixels(
            [{"x": 0.5, "y": 0.5}, {"x": 0.25, "y": 0.75}], width=1000, height=800
        )
        self.assertEqual(pixels, [(500, 400), (250, 600)])


if __name__ == "__main__":
    unittest.main()
