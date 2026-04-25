from typing import List, Tuple
import cv2
import numpy as np

MAX_PROCESS_FPS = 30.0
MAX_FRAME_DIMENSION = 960


def _resize_if_needed(frame: np.ndarray) -> np.ndarray:
    height, width = frame.shape[:2]
    largest_dim = max(height, width)
    if largest_dim <= MAX_FRAME_DIMENSION:
        return frame

    scale = MAX_FRAME_DIMENSION / float(largest_dim)
    return cv2.resize(frame, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)


def load_video_frames(video_path: str) -> Tuple[List[np.ndarray], float]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {video_path}")

    src_fps = cap.get(cv2.CAP_PROP_FPS)
    if not src_fps or src_fps <= 0:
        src_fps = 30.0

    sample_every = max(1, int(round(src_fps / MAX_PROCESS_FPS)))
    effective_fps = src_fps / sample_every

    frames: List[np.ndarray] = []
    frame_idx = 0

    while True:
        success, frame = cap.read()
        if not success:
            break

        if frame_idx % sample_every == 0:
            frames.append(_resize_if_needed(frame))
        frame_idx += 1

    cap.release()

    if not frames:
        raise ValueError("No frames could be read from the uploaded video.")

    return frames, float(effective_fps)
