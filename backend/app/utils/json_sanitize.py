from __future__ import annotations

from typing import Any


def sanitize_for_json(value: Any) -> Any:
    try:
        import numpy as np  # type: ignore

        if isinstance(value, np.generic):
            return value.item()
    except Exception:
        pass

    if isinstance(value, dict):
        return {str(key): sanitize_for_json(val) for key, val in value.items()}
    if isinstance(value, (list, tuple)):
        return [sanitize_for_json(item) for item in value]
    if isinstance(value, set):
        return [sanitize_for_json(item) for item in sorted(value, key=str)]
    return value
