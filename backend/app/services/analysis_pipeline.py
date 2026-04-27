from typing import Dict, Any
from time import perf_counter
from .video_io import load_video_frames
from .pose_extractor import extract_pose_landmarks
from .smoothing import smooth_landmarks
from .rep_detector import detect_squat_reps
from .feature_engineering import compute_rep_features
from .fault_rules import evaluate_squat_faults
from .feedback_generator import attach_feedback
from .overlay_renderer import render_overlay_image



def _hip_midpoint_path(
    smoothed_landmarks: list[dict[str, Any]],
    start_frame: int,
    end_frame: int,
) -> list[dict[str, float]]:
    path: list[dict[str, float]] = []
    for frame_idx in range(start_frame, end_frame + 1):
        frame = smoothed_landmarks[frame_idx]
        landmarks = frame.get("landmarks", {})
        left_hip = landmarks.get("left_hip")
        right_hip = landmarks.get("right_hip")
        if not left_hip or not right_hip:
            continue

        path.append({
            "x": (left_hip["x"] + right_hip["x"]) / 2.0,
            "y": (left_hip["y"] + right_hip["y"]) / 2.0,
        })
    return path


def _barbell_proxy_path(
    smoothed_landmarks: list[dict[str, Any]],
    start_frame: int,
    end_frame: int,
) -> list[dict[str, float]]:
    """
    Approximate bar path using shoulder midpoint (best proxy for back squat),
    with hip midpoint fallback when shoulders are not visible.
    """
    path: list[dict[str, float]] = []

    for frame_idx in range(start_frame, end_frame + 1):
        frame = smoothed_landmarks[frame_idx]
        landmarks = frame.get("landmarks", {})

        left_shoulder = landmarks.get("left_shoulder")
        right_shoulder = landmarks.get("right_shoulder")
        if left_shoulder and right_shoulder:
            path.append({
                "x": (left_shoulder["x"] + right_shoulder["x"]) / 2.0,
                "y": (left_shoulder["y"] + right_shoulder["y"]) / 2.0,
            })
            continue

        left_hip = landmarks.get("left_hip")
        right_hip = landmarks.get("right_hip")
        if left_hip and right_hip:
            path.append({
                "x": (left_hip["x"] + right_hip["x"]) / 2.0,
                "y": (left_hip["y"] + right_hip["y"]) / 2.0,
            })

    return path

DISCLAIMER = (
    "This tool provides basic exercise-form feedback and is not a substitute "
    "for certified coaching or medical advice."
)


def analyze_squat_video(
    video_path: str,
    camera_view: str = "side",
    frame_stride: int = 1,
    analysis_downscale: float = 1.0,
    fast_mode: bool = True,
) -> Dict[str, Any]:
    if camera_view != "side":
        raise ValueError("MVP supports side-view squat videos only.")
    stage_timings: dict[str, float] = {}
    total_start = perf_counter()

    t0 = perf_counter()
    frames, fps, frame_meta = load_video_frames(
        video_path,
        frame_stride=frame_stride,
        analysis_downscale=analysis_downscale,
        fast_mode=fast_mode,
    )
    stage_timings["frame_decode_seconds"] = round(perf_counter() - t0, 4)

    t0 = perf_counter()
    raw_landmarks = extract_pose_landmarks(frames)
    stage_timings["mediapipe_inference_seconds"] = round(perf_counter() - t0, 4)
    visible_frames = [f for f in raw_landmarks if f.get("landmarks")]
    if not visible_frames:
        raise ValueError("Pose landmarks were not detected. Check camera angle/visibility and retry.")
    visibility_ratio = len(visible_frames) / len(raw_landmarks) if raw_landmarks else 0.0
    if visibility_ratio < 0.5:
        raise ValueError("Low landmark visibility detected. Ensure full side-view body is visible.")
    t0 = perf_counter()
    smoothed_landmarks = smooth_landmarks(raw_landmarks)
    stage_timings["landmark_smoothing_seconds"] = round(perf_counter() - t0, 4)

    t0 = perf_counter()
    reps = detect_squat_reps(smoothed_landmarks, fps)
    stage_timings["rep_detection_seconds"] = round(perf_counter() - t0, 4)

    if not reps:
        stage_timings["total_seconds"] = round(perf_counter() - total_start, 4)
        print(f"[analyze_squat_video] timings={stage_timings} meta={frame_meta}")
        return {
            "exercise": "squat",
            "camera_view": camera_view,
            "rep_count": 0,
            "summary_status": "no_reps_detected",
            "fps": fps,
            "results": [],
            "disclaimer": DISCLAIMER,
            "raw_landmarks": raw_landmarks,
            "overlay_image_url": None,
            "stage_timings": stage_timings,
            "frame_processing": frame_meta,
        }

    results = []
    all_issue_labels = []

    for rep in reps:
        features = compute_rep_features(smoothed_landmarks, rep, fps)
        issues = evaluate_squat_faults(features)
        issues_with_feedback = attach_feedback(issues)
        bar_path = _barbell_proxy_path(smoothed_landmarks, rep["start_frame"], rep["end_frame"])

        all_issue_labels.extend([i["label"] for i in issues_with_feedback])

        overlay_image_url = render_overlay_image(
            frames[rep["bottom_frame"]],
            smoothed_landmarks[rep["bottom_frame"]]["landmarks"],
            issues_with_feedback,
            rep["rep_index"],
            path_points=bar_path,
        )

        results.append({
            "rep_index": rep["rep_index"],
            "start_frame": rep["start_frame"],
            "bottom_frame": rep["bottom_frame"],
            "end_frame": rep["end_frame"],
            "metrics": features,
            "issues": issues_with_feedback,
            "proxy_bar_path": bar_path,
            "bar_path": bar_path,
            "overlay_image_url": overlay_image_url,
        })

    summary_status = "acceptable_form" if not all_issue_labels else "issues_detected"

    stage_timings["total_seconds"] = round(perf_counter() - total_start, 4)
    print(f"[analyze_squat_video] timings={stage_timings} meta={frame_meta}")
    return {
        "exercise": "squat",
        "camera_view": camera_view,
        "rep_count": len(reps),
        "summary_status": summary_status,
        "fps": fps,
        "results": results,
        "disclaimer": DISCLAIMER,
        "raw_landmarks": raw_landmarks,
        "overlay_image_url": results[0]["overlay_image_url"] if results else None,
        "stage_timings": stage_timings,
        "frame_processing": frame_meta,
    }
