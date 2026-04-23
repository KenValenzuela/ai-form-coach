# AI-Powered Weightlifting Form Correction — ALIGN

### CIS 515 – Team 2 (Arizona State University)

---

## Overview

ALIGN is a **computer vision–based system** that analyzes recorded weightlifting videos and provides **automated feedback on exercise form**, starting with squat analysis.

The goal is to provide an **accessible, low-cost alternative to personal coaching** for students at ASU's Sun Devil Fitness Complex (SDFC).

### For a non-technical audience

1. Upload a squat video filmed from the side.
2. The app tracks your body's key points frame by frame.
3. It checks for common form issues (depth, forward lean, heel lift, tempo).
4. You get plain-language coaching feedback, a form score, and a pose overlay image.

---

## Project Structure

```
ai-form-coach/
├── backend/               # FastAPI + MediaPipe analysis pipeline
│   ├── app/
│   │   ├── api/routes/    # POST /api/analyze
│   │   ├── services/      # pose extraction, rep detection, fault rules
│   │   ├── schemas/       # Pydantic response models
│   │   ├── main.py
│   │   └── database.py
│   ├── requirements.txt
│   └── run.py
├── app/                   # Next.js App Router (pages & global CSS)
├── components/            # React components (Nav, Hero, AnalyzeSection, Tracker, Routines)
├── lib/                   # Shared TypeScript types & data
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+

### 1. Clone & configure

```bash
git clone https://github.com/KenValenzuela/ai-form-coach.git
cd ai-form-coach
cp .env.example .env.local
```

### 2. Start the backend (port 8000)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

API docs: `http://localhost:8000/docs`

### 3. Start the frontend (port 3000)

```bash
# from repo root
npm install
npm run dev
```

Open `http://localhost:3000`.

---

## Using the App

1. **Analyze** — Upload a side-view squat video, click "Analyze My Form". The backend runs pose extraction and returns a form score, per-rep metrics, and coaching feedback.
2. **Tracker** — Log training sessions with sets × reps × weight. Volume stats update live.
3. **Routines** — Browse preset SDFC programs or build a custom routine.

---

## System Architecture

```
Browser (Next.js)
   │  POST /api/analyze  (multipart video)
   ▼
FastAPI Backend
   ├── Pose Extraction   (MediaPipe)
   ├── Rep Detection     (knee-angle state machine)
   ├── Feature Engineering (joint angles, torso lean, heel lift)
   ├── Fault Rules       (threshold-based)
   ├── Feedback Generator
   └── Overlay Renderer  (annotated frame image)
   │  JSON response
   ▼
Browser renders:
   ├── Form score (0–100)
   ├── AI Coach tab (cues + drills per issue)
   ├── Overview tab (per-metric table)
   ├── Issues tab
   └── Video tab (pose overlay image)
```

---

## Fault Detection Rules

| Fault | Condition | Severity |
|---|---|---|
| Insufficient depth | Hip not below knee OR knee angle > 100° | medium |
| Excessive forward lean | Torso angle < 145° | medium |
| Poor control | Rep duration < 1.2 s | low |
| Heel lift | Heel rise from baseline > 0.03 (normalized) | medium |

Each fault maps to a coaching message, a cue, and a corrective drill displayed in the AI Coach tab.

---

## Key Backend Modules

| File | Purpose |
|---|---|
| `pose_extractor.py` | MediaPipe Pose — extracts landmarks per frame |
| `rep_detector.py` | Segments reps via knee-angle state machine |
| `feature_engineering.py` | Computes knee/hip angles, torso lean, depth, rep duration, heel lift |
| `fault_rules.py` | Threshold-based rule evaluation |
| `feedback_generator.py` | Maps fault labels → coaching text |
| `overlay_renderer.py` | Renders annotated pose overlay image |

---

## MVP Scope

- Exercise: **Squat only**
- Camera: **Side view**
- Faults: insufficient depth, excessive forward lean, poor control, heel lift
- Rep detection: multi-rep segmentation
- Visual output: pose overlay image for first rep

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React 19, TypeScript |
| Backend | FastAPI, Python 3.10+ |
| Pose estimation | MediaPipe Pose |
| Video processing | OpenCV |
| Database | SQLite (via SQLAlchemy) |

---

## Limitations

- Side-view only; angled cameras degrade accuracy
- Rule-based thresholds are not personalized
- Tracker and Routines are client-side only (no persistence across sessions yet)

---

## Future Work

- Additional exercises (bench press, deadlift)
- ML-based classification to replace hard-coded thresholds
- Real-time webcam analysis
- User accounts and persistent session history

---

## Disclaimer

This system is a basic form analysis tool and is **not a substitute for professional coaching or medical advice**.
