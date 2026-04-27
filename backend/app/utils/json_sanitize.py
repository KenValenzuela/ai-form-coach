"""Helpers for converting backend objects into JSON-safe values."""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any


def sanitize_for_json(value: Any) -> Any:
    """Recursively convert Python objects into JSON-serializable structures.

    Handles standard Python values plus common scientific stack objects that can
    appear in analysis output (NumPy, Pandas, OpenCV-backed arrays, pathlib).
    """
    try:
        import numpy as np  # type: ignore
    except Exception:  # pragma: no cover - optional dependency
        np = None

    try:
        import pandas as pd  # type: ignore
    except Exception:  # pragma: no cover - optional dependency
        pd = None

    if value is None or isinstance(value, (str, bool, int)):
        return value

    if isinstance(value, float):
        return value if math.isfinite(value) else None

    if np is not None:
        if isinstance(value, np.bool_):
            return bool(value)
        if isinstance(value, np.integer):
            return int(value)
        if isinstance(value, np.floating):
            as_float = float(value)
            return as_float if math.isfinite(as_float) else None
        if isinstance(value, np.ndarray):
            return [sanitize_for_json(item) for item in value.tolist()]

    if pd is not None:
        if isinstance(value, pd.DataFrame):
            return sanitize_for_json(value.to_dict(orient="records"))
        if isinstance(value, pd.Series):
            return sanitize_for_json(value.tolist())

    if isinstance(value, Path):
        return str(value)

    if isinstance(value, dict):
        return {str(key): sanitize_for_json(item) for key, item in value.items()}

    if isinstance(value, (list, tuple, set)):
        return [sanitize_for_json(item) for item in value]

    if hasattr(value, "item"):
        try:
            return sanitize_for_json(value.item())
        except Exception:
            pass

    if hasattr(value, "__dict__"):
        return sanitize_for_json(vars(value))

    return str(value)
