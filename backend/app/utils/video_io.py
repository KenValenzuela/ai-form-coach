from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path


def transcode_to_browser_mp4(input_path: Path, output_path: Path) -> None:
    input_path = Path(input_path).resolve()
    output_path = Path(output_path).resolve()

    if not input_path.exists():
        raise RuntimeError(f"Cannot transcode missing input: {input_path}")

    input_size = input_path.stat().st_size
    if input_size < 10_000:
        raise RuntimeError(f"Cannot transcode tiny input: {input_path}, size={input_size}")

    ffmpeg_bin = shutil.which("ffmpeg")
    if ffmpeg_bin is None and Path("/opt/homebrew/bin/ffmpeg").exists():
        ffmpeg_bin = "/opt/homebrew/bin/ffmpeg"
    if ffmpeg_bin is None:
        raise RuntimeError(f"ffmpeg not found in backend PATH. PATH={os.environ.get('PATH')}")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    if output_path.exists():
        output_path.unlink()

    cmd = [
        ffmpeg_bin,
        "-y",
        "-i", str(input_path),
        "-vcodec", "libx264",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        str(output_path),
    ]

    print("[ffmpeg] cmd:", " ".join(cmd))

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=120,
    )

    print("[ffmpeg] returncode:", result.returncode)
    print("[ffmpeg] stdout:", result.stdout[-2000:])
    print("[ffmpeg] stderr:", result.stderr[-4000:])

    if result.returncode != 0:
        raise RuntimeError(
            "ffmpeg transcode failed\n"
            f"cmd={' '.join(cmd)}\n"
            f"returncode={result.returncode}\n"
            f"stdout={result.stdout}\n"
            f"stderr={result.stderr}"
        )

    if not output_path.exists():
        raise RuntimeError(f"ffmpeg completed but output does not exist: {output_path}")

    output_size = output_path.stat().st_size
    if output_size < 10_000:
        raise RuntimeError(f"ffmpeg output too small: {output_path}, size={output_size}")


def validate_video_file(path: Path) -> dict:
    import cv2

    path = Path(path).resolve()

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
        raise RuntimeError(f"Invalid video file: {info}")

    return info
