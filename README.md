#  AI-Powered Weightlifting Form Correction

### CIS 515 – Team 2 (Arizona State University)

---

##  Overview

This project is a **computer vision–based system** that analyzes recorded weightlifting videos and provides **automated feedback on exercise form**, starting with **squat analysis**.

The goal is to provide an **accessible, low-cost alternative to personal coaching** for students at ASU’s Sun Devil Fitness Complex (SDFC).

### For a non-technical audience

Think of this as a "video form coach":

1. You upload a squat video.
2. The app watches your movement and tracks key body points.
3. It checks for common form issues.
4. It gives plain-language feedback and a visual overlay image.

This MVP currently focuses on side-view squats and provides simple, understandable coaching suggestions.

---

##  Problem Statement

Many students:

* Lack access to certified coaching
* Rely on mirrors or social media
* Receive inconsistent feedback

This leads to:

* Increased injury risk
* Poor lifting technique
* Inefficient workouts

---

##  Solution

We built an end-to-end pipeline that:

1. Accepts a recorded workout video
2. Extracts body keypoints using **MediaPipe Pose**
3. Converts motion into biomechanical features
4. Detects form issues using rule-based logic
5. Returns **actionable feedback**

---

##  System Architecture

```
Video Upload
   ↓
Pose Extraction (MediaPipe)
   ↓
Rep Detection
   ↓
Feature Engineering (Angles + Motion)
   ↓
Fault Detection (Rules)
   ↓
Feedback Generation
```

---

##  How Feedback is Generated

### Current MVP Approach: Rule-Based Model

We use a **lightweight rule-based system** instead of a trained ML model.

### Why:

* Small dataset
* Easier debugging
* Interpretable outputs
* Faster development for MVP

---

### 🔍 Example Rules

| Fault                  | Condition                                    |
| ---------------------- | -------------------------------------------- |
| Insufficient depth     | Knee angle too large OR hips not below knees |
| Excessive forward lean | Torso angle too low                          |
| Poor control           | Rep too fast                                 |
| Heel lift              | Heel rises from baseline during the rep      |

---

###  Feedback Mapping

Each detected fault maps to a coaching message:

* **Insufficient depth** → “Lower your hips to at least knee level.”
* **Forward lean** → “Keep your chest more upright.”
* **Poor control** → “Slow down your movement for better control.”
* **Heel lift** → “Keep your heels planted and pressure through mid-foot.”

---

## How MediaPipe → Feedback Works

### Step-by-step

1. **Pose Extraction**

   * Extract joint coordinates (hips, knees, ankles, shoulders)

2. **Geometric Transformation**

   * Convert coordinates → joint angles

3. **Feature Engineering**

   * Knee angle
   * Hip angle
   * Torso lean
   * Depth metric
   * Rep duration

4. **Rule Evaluation**

   * Compare features against thresholds

5. **Feedback Output**

   * Return labeled issues + suggestions

---

##  MVP Scope

Supported:

* Exercise: **Squat**
* Camera: **Side view only**
* Faults detected:

  * Insufficient depth
  * Excessive forward lean
  * Poor control
  * Heel lift
* Rep detection: **basic multi-rep segmentation**
* Visual output: **pose overlay preview images**

---

##  Backend Setup

```bash
cd backend
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

API Docs:

```
http://localhost:8000/docs
```

---

##  Frontend (Streamlit)

```bash
streamlit run frontend/app.py
```

### Usage:

1. Select **squat**
2. Upload a video
3. Click **Analyze**
4. View feedback + metrics

---

##  Technical Deep Dive (for contributors)

### Request/Response flow

1. Streamlit uploads the video as multipart form-data to `POST /api/analyze`.
2. FastAPI validates exercise type and file extension, stores the file, then runs the analysis pipeline.
3. The pipeline returns per-rep metrics/issues and overlay image URLs.
4. Results are persisted in SQLite and returned to the frontend.

### Key backend modules

* `pose_extractor.py`  
  Uses MediaPipe Pose and extracts tracked landmarks per frame.

* `rep_detector.py`  
  Segments squat reps with a knee-angle state machine (`down` vs `up` with hysteresis).

* `feature_engineering.py`  
  Computes biomechanical features (knee/hip angles, torso lean, depth, rep duration, heel-lift metric).

* `fault_rules.py`  
  Applies threshold-based rules to classify issues.

* `feedback_generator.py`  
  Maps issue labels to coaching messages.

* `overlay_renderer.py`  
  Renders a visual overlay image and highlights relevant joints for detected issues.

### Heel-lift detection design in this MVP

To support heel-lift feedback, the pipeline now tracks heel/toe landmarks and computes:

* frame-level `heel_lift_from_floor` = `avg_foot_index_y - avg_heel_y`
* rep-level `max_heel_lift_from_baseline` relative to the start of the rep

If `max_heel_lift_from_baseline > 0.03` (normalized image coordinates), we flag `heel_lift`.

This is intentionally simple and interpretable; future versions can add camera calibration and more robust floor estimation.

### How to contribute

Good first contribution ideas:

1. Add a calibration step for floor baseline (reduce false positives for heel lift).
2. Add support for additional exercises (bench/deadlift).
3. Improve rep segmentation robustness for noisy videos.
4. Add tests for each rule in `fault_rules.py`.
5. Add confidence/quality metrics for landmark visibility.

General contribution workflow:

1. Create a branch and run backend + frontend locally.
2. Add/modify one feature in the services pipeline.
3. Validate with a few sample squat videos.
4. Update README docs for user + contributor impact.

---

##  Validation Strategy

We evaluate using:

* Manually labeled squat videos
* Comparing expected vs detected faults

Metrics:

* Fault detection accuracy
* Feedback quality

---

##  Limitations

* Small dataset (limited generalization)
* Sensitive to camera angle
* Pose estimation noise in crowded gyms

---

##  Future Work

* Bench press + more exercises
* ML-based classification models
* Real-time feedback

---

##  Tech Stack

* FastAPI
* Streamlit
* MediaPipe Pose
* OpenCV
* NumPy / Pandas
* SQLite

---

##  Disclaimer

This system is a **basic form analysis tool** and is **not a substitute for professional coaching or medical advice**.

---

##  Key Insight

This project demonstrates how:

**pose estimation + geometric reasoning → actionable coaching feedback**

without requiring large-scale deep learning.
