from typing import Dict, Any
from .video_io import load_video_frames
from .pose_extractor import extract_pose_landmarks
from .smoothing import smooth_landmarks
from .rep_detector import detect_squat_reps
from .feature_engineering import compute_rep_features
from .fault_rules import evaluate_squat_faults
from .feedback_generator import attach_feedback

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
        }

    results = []
    all_issue_labels = []

    for rep in reps:
        features = compute_rep_features(smoothed_landmarks, rep, fps)
        issues = evaluate_squat_faults(features)
        issues_with_feedback = attach_feedback(issues)

        all_issue_labels.extend([i["label"] for i in issues_with_feedback])

        results.append({
            "rep_index": rep["rep_index"],
            "start_frame": rep["start_frame"],
            "bottom_frame": rep["bottom_frame"],
            "end_frame": rep["end_frame"],
            "metrics": features,
            "issues": issues_with_feedback,
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
    }