from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


def transcode_to_browser_mp4(input_path: Path, output_path: Path) -> None:
    if not input_path.exists():
        raise RuntimeError(f"Cannot transcode missing input: {input_path}")

    if input_path.stat().st_size < 10_000:
        raise RuntimeError(f"Cannot transcode tiny/invalid input: {input_path}, size={input_path.stat().st_size}")

    if shutil.which("ffmpeg") is None:
        raise RuntimeError(
            "ffmpeg is required to create browser-playable MP4 files. Install with: brew install ffmpeg"
        )

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
            f"input_path={input_path}\n"
            f"output_path={output_path}\n"
            f"cmd={' '.join(cmd)}\n"
            f"stdout={result.stdout}\n"
            f"stderr={result.stderr}"
        )

    if not output_path.exists():
        raise RuntimeError(f"ffmpeg completed but output does not exist: {output_path}")

    if output_path.stat().st_size < 10_000:
        raise RuntimeError(f"ffmpeg output is too small: {output_path}, size={output_path.stat().st_size}")


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
        "size_bytes": path.stat().st_size,
    }

    if not opened or frame_count <= 0 or fps <= 0 or width <= 0 or height <= 0:
        raise RuntimeError(f"Invalid video output: {info}")

    return info
