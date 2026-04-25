# Task 4 — MediaPipe-to-Feedback Mapping

This document traces how squat feedback is produced from frame-level landmarks.

## Pipeline mapping

1. **Pose extraction (`pose_extractor.py`)**
   - MediaPipe Pose landmarks are extracted frame-by-frame.
2. **Rep segmentation (`rep_detector.py`)**
   - Knee-angle state transitions identify squat reps and output `start_frame`, `bottom_frame`, and `end_frame`.
3. **Feature engineering (`feature_engineering.py`)**
   - Computes rep-level metrics used by rules:
     - `min_knee_angle`
     - `min_hip_angle`
     - `max_torso_lean`
     - `bottom_hip_to_knee_delta`
     - `rep_duration_sec`
     - `max_heel_lift_from_baseline`
4. **Fault rules (`fault_rules.py`)**
   - Converts metrics into issue labels + severities.
5. **Feedback generation (`feedback_generator.py`)**
   - Maps issue labels to user-facing coaching messages.
6. **Frontend rendering (`AnalyzeSection.tsx`)**
   - Displays score, issue cards, metrics table, and key-frame walkthrough for presentation (Task 5).

## Current fault thresholds

- `insufficient_depth`: hip not below knee OR knee angle > 100°
- `excessive_forward_lean`: torso angle < 145°
- `poor_control`: rep duration < 1.2 s
- `heel_lift`: heel rise from baseline > 0.03

## API fields useful for frame explanation

Each rep in `results` includes:
- `start_frame`
- `bottom_frame`
- `end_frame`
- `issues`
- `metrics`

These frame indices are used in the frontend Video tab to narrate key squat moments during class demos.
