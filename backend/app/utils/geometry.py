from typing import Optional, Dict, Any
import numpy as np


def point_to_array(point: Dict[str, Any]) -> np.ndarray:
    return np.array([float(point["x"]), float(point["y"])], dtype=float)


def calculate_angle(a: Dict[str, Any], b: Dict[str, Any], c: Dict[str, Any]) -> Optional[float]:
    """
    Returns the angle ABC in degrees.
    """
    try:
        a_arr = point_to_array(a)
        b_arr = point_to_array(b)
        c_arr = point_to_array(c)

        ba = a_arr - b_arr
        bc = c_arr - b_arr

        denom = np.linalg.norm(ba) * np.linalg.norm(bc)
        if denom == 0:
            return None

        cosine_angle = np.dot(ba, bc) / denom
        cosine_angle = np.clip(cosine_angle, -1.0, 1.0)
        angle = np.degrees(np.arccos(cosine_angle))

        if not np.isfinite(angle):
            return None
        return float(angle)
    except Exception:
        return None


def safe_average(values: list[Optional[float]]) -> Optional[float]:
    valid = [float(v) for v in values if v is not None and np.isfinite(v)]
    if not valid:
        return None
    return float(sum(valid) / len(valid))
