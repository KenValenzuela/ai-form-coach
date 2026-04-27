from math import ceil
from time import perf_counter
from typing import Any, List, Tuple
import cv2
import numpy as np

MAX_PROCESS_FPS = 30.0
MAX_FRAME_DIMENSION = 960
TARGET_MAX_PROCESSED_FRAMES = 600


def _resize_if_needed(frame: np.ndarray) -> np.ndarray:
    height, width = frame.shape[:2]
    largest_dim = max(height, width)
    if largest_dim <= MAX_FRAME_DIMENSION:
        return frame

    scale = MAX_FRAME_DIMENSION / float(largest_dim)
    return cv2.resize(frame, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)


def load_video_frames(
    video_path: str,
    frame_stride: int = 1,
    analysis_downscale: float = 1.0,
    fast_mode: bool = True,
) -> Tuple[List[np.ndarray], float, dict[str, Any]]:
    started = perf_counter()
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {video_path}")

    src_fps = cap.get(cv2.CAP_PROP_FPS)
    if not src_fps or src_fps <= 0:
        src_fps = 30.0

    sample_every = max(1, int(frame_stride))
    if fast_mode:
        sample_every = max(sample_every, int(round(src_fps / MAX_PROCESS_FPS)))

    total_frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if total_frame_count > 0:
        if fast_mode:
            sample_every = max(sample_every, int(ceil(total_frame_count / TARGET_MAX_PROCESSED_FRAMES)))

    effective_fps = src_fps / sample_every

    frames: List[np.ndarray] = []
    frame_idx = 0

    while True:
        success, frame = cap.read()
        if not success:
            break

        if frame_idx % sample_every == 0:
            resized = _resize_if_needed(frame) if fast_mode else frame
            if analysis_downscale < 1.0:
                h, w = resized.shape[:2]
                resized = cv2.resize(
                    resized,
                    (max(16, int(w * analysis_downscale)), max(16, int(h * analysis_downscale))),
                    interpolation=cv2.INTER_AREA,
                )
            frames.append(resized)
        frame_idx += 1

    cap.release()

    if not frames:
        raise ValueError("No frames could be read from the uploaded video.")

    metadata = {
        "source_fps": float(src_fps),
        "sample_every": int(sample_every),
        "source_total_frames": int(total_frame_count),
        "processed_frames": len(frames),
        "load_seconds": round(perf_counter() - started, 4),
    }
    return frames, float(effective_fps), metadata
