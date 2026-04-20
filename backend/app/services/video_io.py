from typing import List, Tuple
import cv2
import numpy as np


def load_video_frames(video_path: str) -> Tuple[List[np.ndarray], float]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Could not open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS)
    if not fps or fps <= 0:
        fps = 30.0

    frames: List[np.ndarray] = []

    while True:
        success, frame = cap.read()
        if not success:
            break
        frames.append(frame)

    cap.release()

    if not frames:
        raise ValueError("No frames could be read from the uploaded video.")

    return frames, float(fps)