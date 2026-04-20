#  AI-Powered Weightlifting Form Correction

### CIS 515 – Team 2 (Arizona State University)

---

##  Overview

This project is a **computer vision–based system** that analyzes recorded weightlifting videos and provides **automated feedback on exercise form**, starting with **squat analysis**.

The goal is to provide an **accessible, low-cost alternative to personal coaching** for students at ASU’s Sun Devil Fitness Complex (SDFC).

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

## ⚙️ System Architecture

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

---

###  Feedback Mapping

Each detected fault maps to a coaching message:

* **Insufficient depth** → “Lower your hips to at least knee level.”
* **Forward lean** → “Keep your chest more upright.”
* **Poor control** → “Slow down your movement for better control.”

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

* Multi-rep detection
* Bench press + more exercises
* ML-based classification models
* Real-time feedback
* Pose overlay visualization

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
