from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


def transcode_to_browser_mp4(input_path: Path, output_path: Path) -> None:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError(
            "ffmpeg is required to create browser-playable MP4 files. Install it with: brew install ffmpeg"
        )

    if not input_path.exists():
        raise RuntimeError(f"Cannot transcode missing input: {input_path}")

    if input_path.stat().st_size < 10_000:
        raise RuntimeError(f"Cannot transcode tiny/invalid input: {input_path}, size={input_path.stat().st_size}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_path),
        "-vcodec",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(output_path),
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        raise RuntimeError(
            "ffmpeg transcode failed\n"
            f"Command: {' '.join(cmd)}\n"
            f"STDOUT:\n{result.stdout}\n"
            f"STDERR:\n{result.stderr}"
        )

    if not output_path.exists() or output_path.stat().st_size < 10_000:
        raise RuntimeError(f"Transcoded MP4 output is invalid: {output_path}")


def validate_video_file(path: Path) -> dict:
    import cv2

    if not path.exists():
        raise RuntimeError(f"Video file does not exist: {path}")

    cap = cv2.VideoCapture(str(path))
    opened = cap.isOpened()
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) if opened else 0
    fps = cap.get(cv2.CAP_PROP_FPS) if opened else 0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) if opened else 0
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) if opened else 0
    cap.release()

    info = {
        "path": str(path),
        "opened": opened,
        "frame_count": frame_count,
        "fps": fps,
        "width": width,
        "height": height,
        "size_bytes": path.stat().st_size if path.exists() else 0,
    }

    if not opened or frame_count <= 0 or fps <= 0 or width <= 0 or height <= 0 or info["size_bytes"] < 10_000:
        raise RuntimeError(f"Invalid video file: {info}")

    return info
