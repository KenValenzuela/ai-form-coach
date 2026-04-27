from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from uuid import uuid4

TIMING_LOG_DIR = Path("app/data/timings")
TIMING_LOG_DIR.mkdir(parents=True, exist_ok=True)


def write_timing_log(payload: dict[str, Any], prefix: str = "analysis") -> str:
    filename = f"{prefix}_timings_{uuid4().hex}.json"
    out_path = TIMING_LOG_DIR / filename
    out_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return f"/static/timings/{filename}"
