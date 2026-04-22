import ast
import unittest
from pathlib import Path

from app.services.feature_engineering import compute_frame_metrics


def _point(x, y, z=0.0, visibility=0.99):
    return {"x": x, "y": y, "z": z, "visibility": visibility}


class MetricsAndSmoothingTests(unittest.TestCase):
    def test_smoothing_tracked_keys_include_foot_landmarks(self):
        source = Path("app/services/smoothing.py").read_text(encoding="utf-8")
        module = ast.parse(source)

        tracked_keys = None
        for node in module.body:
            if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "TRACKED_KEYS" for t in node.targets):
                tracked_keys = ast.literal_eval(node.value)
                break

        self.assertIsNotNone(tracked_keys)
        self.assertIn("left_heel", tracked_keys)
        self.assertIn("right_heel", tracked_keys)
        self.assertIn("left_foot_index", tracked_keys)
        self.assertIn("right_foot_index", tracked_keys)

    def test_compute_frame_metrics_still_returns_core_metrics_when_heel_toe_missing(self):
        frame = {
            "frame_index": 0,
            "landmarks": {
                "left_shoulder": _point(0.4, 0.2),
                "right_shoulder": _point(0.6, 0.2),
                "left_hip": _point(0.45, 0.4),
                "right_hip": _point(0.55, 0.4),
                "left_knee": _point(0.45, 0.6),
                "right_knee": _point(0.55, 0.6),
                "left_ankle": _point(0.45, 0.8),
                "right_ankle": _point(0.55, 0.8),
            },
        }

        metrics = compute_frame_metrics(frame)
        self.assertIsNotNone(metrics["knee_angle"])
        self.assertIsNotNone(metrics["hip_angle"])
        self.assertIsNotNone(metrics["torso_lean"])
        self.assertIsNone(metrics["heel_lift_from_floor"])


if __name__ == "__main__":
    unittest.main()
