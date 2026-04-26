from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2

from app.services.analysis_pipeline import analyze_squat_video
from app.services.barbell_tracker import track_barbell_path


def draw_tracking_sample(video_path: str, tracked_path: list[dict], out_path: Path) -> None:
    cap = cv2.VideoCapture(video_path)
    ok, frame = cap.read()
    if not ok or frame is None:
        cap.release()
        return
    h, w = frame.shape[:2]
    pts = []
    for p in tracked_path:
        if not p.get("visible") or p.get("x") is None or p.get("y") is None:
            continue
        pts.append((int(float(p["x"]) * w), int(float(p["y"]) * h)))
    for idx in range(1, len(pts)):
        cv2.line(frame, pts[idx - 1], pts[idx], (90, 180, 255), 2)
    if pts:
        cv2.circle(frame, pts[0], 5, (0, 255, 0), -1)
        cv2.circle(frame, pts[-1], 5, (0, 0, 255), -1)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(out_path), frame)
    cap.release()


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate side-view squat MVP pipeline")
    parser.add_argument("--manifest", required=True, help="JSON manifest with video paths + ROI")
    parser.add_argument("--output", default="backend/metrics/mvp_validation_report.json")
    parser.add_argument("--samples-dir", default="backend/metrics/samples")
    args = parser.parse_args()

    manifest = json.loads(Path(args.manifest).read_text())
    videos = manifest.get("videos", [])
    if not videos:
        raise SystemExit("No videos provided.")

    per_video = []
    total_frames = 0
    total_success = 0
    all_fps = []
    sample_feedback = None

    for item in videos:
        video_path = item["path"]
        roi = item["roi"]
        analysis = analyze_squat_video(video_path, camera_view="side")
        tracking = track_barbell_path(
            video_path=video_path,
            anchor_x=roi["x"] + (roi["w"] / 2),
            anchor_y=roi["y"] + (roi["h"] / 2),
            roi_x=roi["x"],
            roi_y=roi["y"],
            roi_w=roi["w"],
            roi_h=roi["h"],
            tracker_type=item.get("tracker_type", "csrt"),
        )

        frames_processed = len(tracking["tracking_records"])
        success_frames = sum(1 for r in tracking["tracking_records"] if r["tracking_success"])
        total_frames += frames_processed
        total_success += success_frames
        all_fps.append(tracking["average_fps"])

        sample_path = Path(args.samples_dir) / f"{Path(video_path).stem}_tracking.jpg"
        draw_tracking_sample(video_path, tracking["smoothed_tracked_path"], sample_path)

        first_rep_issues = analysis["results"][0]["issues"] if analysis.get("results") else []
        feedback_text = first_rep_issues[0]["feedback"] if first_rep_issues else "No major issues detected."
        if sample_feedback is None:
            sample_feedback = feedback_text

        per_video.append(
            {
                "video": video_path,
                "rep_count": analysis["rep_count"],
                "frames_processed": frames_processed,
                "tracking_success_rate": tracking["tracking_success_rate"],
                "average_fps": tracking["average_fps"],
                "path_metrics": tracking["path_metrics"],
                "sample_output_frame": str(sample_path),
                "example_feedback": feedback_text,
            }
        )

    report = {
        "videos_tested": len(videos),
        "frames_processed": total_frames,
        "tracking_success_rate": (total_success / total_frames) if total_frames else 0.0,
        "average_fps": (sum(all_fps) / len(all_fps)) if all_fps else 0.0,
        "example_feedback": sample_feedback,
        "results": per_video,
        "note": "Screening-style feedback only; not a substitute for certified coaching.",
    }

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
