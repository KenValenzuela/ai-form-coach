from typing import Dict, Any
from .video_io import load_video_frames
from .pose_extractor import extract_pose_landmarks
from .smoothing import smooth_landmarks
from .rep_detector import detect_squat_reps
from .feature_engineering import compute_rep_features
from .fault_rules import evaluate_squat_faults
from .feedback_generator import attach_feedback
from .overlay_renderer import render_overlay_image

DISCLAIMER = (
    "This tool provides basic exercise-form feedback and is not a substitute "
    "for certified coaching or medical advice."
)


def analyze_squat_video(video_path: str, camera_view: str = "side") -> Dict[str, Any]:
    frames, fps = load_video_frames(video_path)
    raw_landmarks = extract_pose_landmarks(frames)
    smoothed_landmarks = smooth_landmarks(raw_landmarks)
    reps = detect_squat_reps(smoothed_landmarks, fps)

    if not reps:
        return {
            "exercise": "squat",
            "camera_view": camera_view,
            "rep_count": 0,
            "summary_status": "no_reps_detected",
            "results": [],
            "disclaimer": DISCLAIMER,
            "raw_landmarks": raw_landmarks,
            "overlay_image_url": None,
        }

    results = []
    all_issue_labels = []

    for rep in reps:
        features = compute_rep_features(smoothed_landmarks, rep, fps)
        issues = evaluate_squat_faults(features)
        issues_with_feedback = attach_feedback(issues)

        all_issue_labels.extend([i["label"] for i in issues_with_feedback])

        overlay_image_url = render_overlay_image(
            frames[rep["bottom_frame"]],
            smoothed_landmarks[rep["bottom_frame"]]["landmarks"],
            issues_with_feedback,
            rep["rep_index"],
        )

        results.append({
            "rep_index": rep["rep_index"],
            "start_frame": rep["start_frame"],
            "bottom_frame": rep["bottom_frame"],
            "end_frame": rep["end_frame"],
            "metrics": features,
            "issues": issues_with_feedback,
            "overlay_image_url": overlay_image_url,
        })

    summary_status = "acceptable_form" if not all_issue_labels else "issues_detected"

    return {
        "exercise": "squat",
        "camera_view": camera_view,
        "rep_count": len(reps),
        "summary_status": summary_status,
        "results": results,
        "disclaimer": DISCLAIMER,
        "raw_landmarks": raw_landmarks,
        "overlay_image_url": results[0]["overlay_image_url"] if results else None,
    }
