from typing import Dict, Any, List
import cv2
import mediapipe as mp

POSE_LANDMARK_NAMES = {
    11: "left_shoulder",
    12: "right_shoulder",
    23: "left_hip",
    24: "right_hip",
    25: "left_knee",
    26: "right_knee",
    27: "left_ankle",
    28: "right_ankle",
    29: "left_heel",
    30: "right_heel",
    31: "left_foot_index",
    32: "right_foot_index",
}

mp_pose = mp.solutions.pose


def extract_pose_landmarks(frames: List[Any]) -> List[Dict[str, Any]]:
    """
    Returns one entry per frame:
    {
      "frame_index": int,
      "landmarks": {
         "left_hip": {"x":..., "y":..., "z":..., "visibility":...},
         ...
      }
    }
    """
    results_out: List[Dict[str, Any]] = []

    # MediaPipe Pose runs on RGB images. We process frame-by-frame and store only
    # the landmark subset needed for squat heuristics to keep payloads lightweight.
    with mp_pose.Pose(
        static_image_mode=False,
        model_complexity=1,
        enable_segmentation=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    ) as pose:
        for idx, frame in enumerate(frames):
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = pose.process(rgb)

            frame_data: Dict[str, Any] = {
                "frame_index": idx,
                "landmarks": {},
            }

            if result.pose_landmarks:
                landmarks = result.pose_landmarks.landmark
                for lm_idx, name in POSE_LANDMARK_NAMES.items():
                    lm = landmarks[lm_idx]
                    frame_data["landmarks"][name] = {
                        "x": float(lm.x),
                        "y": float(lm.y),
                        "z": float(lm.z),
                        "visibility": float(lm.visibility),
                    }

            results_out.append(frame_data)

    return results_out
