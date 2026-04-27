from __future__ import annotations

import json
from typing import Any
from uuid import uuid4

from ..utils.data_paths import TIMINGS_DIR, build_data_url

TIMING_LOG_DIR = TIMINGS_DIR
TIMING_LOG_DIR.mkdir(parents=True, exist_ok=True)


def write_timing_log(payload: dict[str, Any], prefix: str = "analysis") -> str:
    filename = f"{prefix}_timings_{uuid4().hex}.json"
    out_path = TIMING_LOG_DIR / filename
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return build_data_url(out_path)
