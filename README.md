# ALIGN — AI-Powered Weightlifting Form Correction

### CIS 515 – Team 2 (Arizona State University)

---

## Overview

ALIGN is a **computer vision–based system** that analyzes recorded weightlifting videos and provides **automated feedback on exercise form**, starting with squat analysis.

The goal is to provide an **accessible, low-cost alternative to personal coaching** for students at ASU's Sun Devil Fitness Complex (SDFC).

### What it does

1. Upload a side-view squat video.
2. The backend extracts body keypoints with MediaPipe and segments your reps.
3. It checks joint angles and motion against biomechanical thresholds.
4. You get a form score, plain-language coaching feedback, corrective drills, and a pose overlay image — all in a responsive web UI.

---

## Project Structure

```
ai-form-coach/
├── frontend/                      # Next.js application
│   ├── app/                       # App Router (layout, page, global CSS)
│   ├── components/                # React components
│   │   ├── Nav.tsx
│   │   ├── Hero.tsx
│   │   ├── AnalyzeSection.tsx     # video upload → analysis → results
│   │   ├── TrackerSection.tsx     # session / volume logger
│   │   ├── RoutinesSection.tsx    # preset & custom routines
│   │   ├── CoachBubble.tsx
│   │   └── Footer.tsx
│   ├── lib/
│   │   ├── data.ts                # static data + backend response types & mapping
│   │   └── utils.ts
│   ├── next.config.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── backend/                       # FastAPI application
│   ├── app/
│   │   ├── api/routes/analyze.py  # POST /api/analyze
│   │   ├── services/              # pipeline modules (see below)
│   │   ├── schemas/
│   │   ├── main.py
│   │   └── database.py
│   ├── requirements.txt
│   ├── pyproject.toml
│   └── run.py
└── README.md
```

---

## Quick Start

**Prerequisites:** Python 3.10+, Node.js 18+

```bash
# 1. Clone
git clone https://github.com/KenValenzuela/ai-form-coach.git
cd ai-form-coach

# 2. Backend (runs on port 8000)
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run.py

# 3. Frontend (new terminal, runs on port 3000)
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.\
API docs: `http://localhost:8000/docs`

---

## Using the App

| Section | What it does |
|---|---|
| **Analyze** | Upload a side-view squat video → get a form score, AI coach feedback, joint metrics, and a pose overlay image |
| **Tracker** | Log training sessions with sets × reps × weight; live volume totals |
| **Routines** | Browse preset SDFC programs or build a custom routine |

---

## How It Works

```
Browser (Next.js)
  │  POST /api/analyze  (multipart video upload)
  ▼
FastAPI Backend
  ├─ Pose Extraction      (MediaPipe Pose — landmarks per frame)
  ├─ Rep Detection        (knee-angle state machine)
  ├─ Feature Engineering  (joint angles, torso lean, depth, heel lift, rep duration)
  ├─ Fault Rules          (threshold-based classification)
  ├─ Feedback Generator   (label → coaching text)
  └─ Overlay Renderer     (annotated frame image)
  │  JSON response
  ▼
Browser renders
  ├─ Form score (0–100)
  ├─ AI Coach tab (cue + corrective drill per issue)
  ├─ Overview tab (per-metric table for rep 1)
  ├─ Issues tab
  └─ Video tab (pose overlay image)
```

---

## Fault Detection Rules

| Fault | Condition | Severity |
|---|---|---|
| `insufficient_depth` | Hip not below knee **or** knee angle > 100° | medium |
| `excessive_forward_lean` | Torso angle < 145° | medium |
| `poor_control` | Rep duration < 1.2 s | low |
| `heel_lift` | Heel rise from baseline > 0.03 (normalized coords) | medium |

Score formula: `100 − (20 × medium_issues) − (10 × low_issues)`, minimum 0.

---

## Backend Pipeline Modules

| File | Purpose |
|---|---|
| `pose_extractor.py` | Runs MediaPipe Pose; returns per-frame landmark dicts |
| `rep_detector.py` | Segments reps using a knee-angle `down`/`up` state machine |
| `feature_engineering.py` | Computes knee/hip angles, torso lean, depth delta, rep duration, heel-lift metric |
| `fault_rules.py` | Applies threshold rules; returns labeled issue list |
| `feedback_generator.py` | Maps fault labels → plain-language coaching text |
| `overlay_renderer.py` | Draws landmarks on the bottom frame; saves overlay image |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript |
| Backend | FastAPI, Python 3.10+ |
| Pose estimation | MediaPipe Pose |
| Video processing | OpenCV |
| Database | SQLite (SQLAlchemy) |

---

## MVP Scope & Limitations

- **Exercise:** Squat only
- **Camera:** Side view only — angled cameras reduce accuracy
- **Tracker / Routines:** Client-side state only; data resets on page refresh
- Rule thresholds are fixed, not personalized per user

---

## Future Work

- Additional exercises (bench press, deadlift)
- ML-based classification to replace fixed thresholds
- Real-time webcam analysis
- Persistent user accounts and session history

---

## Disclaimer

This is a basic form analysis tool and is **not a substitute for professional coaching or medical advice**.
