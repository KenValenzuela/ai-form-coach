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
| **Analyze** | Upload a side-view squat video → select barbell end-cap ROI on frame 1 → get form score, AI coach feedback, pose metrics, and bar-path metrics |
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
- Feedback is screening-style and **not** a substitute for certified coaching or medical advice

---

## Squat MVP Workflow (CIS 515 Demo Path)

1. Upload side-view squat video.
2. Mark barbell sleeve/end-cap with a bounding box on first frame.
3. Run analysis (pose analysis first, optional barbell tracking pass).
4. Review:
   - squat depth (hip below knee estimate),
   - torso lean,
   - knee travel estimate,
   - heel/foot stability (if visible),
   - rep count,
   - bar path vertical displacement,
   - bar path horizontal drift,
   - bar path smoothness,
   - tracking success rate,
   - FPS.
5. Export artifacts for the report package:
   - form-analysis JSON response (`/api/analyze`),
   - `bar_path_coordinates_*.csv`,
   - annotated bar-path MP4 (optional),
   - timing log JSON (`/static/timings/...`).

### Runtime safeguards (demo reliability)

- Very long uploads are rejected for MVP demo reliability (hard cap: 120 seconds).
- Clips longer than 45 seconds return a warning recommending short side-view clips.
- Missing/low-visibility landmarks return explicit actionable errors.
- Tracking failures are recorded frame-by-frame (`tracking_status`) instead of silently snapping to new objects.

---

## Future Work

- Additional exercises (bench press, deadlift)
- ML-based classification to replace fixed thresholds
- Real-time webcam analysis
- Persistent user accounts and session history

---

## Reducing Upload-to-Results Time (Practical Playbook)

If your main goal is to reduce the time from **video upload** to **first usable feedback**, prioritize these changes:

1. **Use the existing fast knobs by default**
   - Keep `fast_mode=true` for first-pass analysis.
   - Increase `frame_stride` (for example, from 1 to 2) to process fewer frames.
   - Reduce `analysis_downscale` (for example, `1.0` → `0.5`) to speed per-frame inference.
   - These controls already exist in `POST /api/analyze`.

2. **Avoid expensive optional work in the synchronous path**
   - Keep `include_tracking_summary=false` unless the user explicitly requests bar-path details.
   - Tracking can be done afterward with `POST /api/analyze/{video_id}/track-path`, so users see core coaching sooner.

3. **Return a quick result first, then refine**
   - First pass: fast settings + core squat feedback.
   - Second pass (optional): full-resolution rerun + barbell tracking + annotated video.
   - This staged approach improves perceived speed without removing high-fidelity outputs.

4. **Use timing telemetry to tune, not guess**
   - Read `stage_timings` from analysis/tracking responses to identify the slowest stage.
   - Optimize the dominant stage first (usually frame processing / pose extraction).

5. **Move long-running work to background jobs**
   - For larger videos, run heavy tracking/annotation asynchronously and stream progress status.
   - Keep the upload request short and return a job id immediately.

### Recommended default profile (balanced speed + quality)

- `fast_mode=true`
- `frame_stride=2`
- `analysis_downscale=0.5`
- `include_tracking_summary=false`

Then offer a **"Run detailed analysis"** button for users who need full tracking metrics.

### Stage timings now logged

The backend now instruments:
- upload handling
- frame decode
- MediaPipe inference
- smoothing
- rep detection
- feature engineering
- fault rules
- overlay rendering
- CSV/video export

Each run writes a timing JSON log under `/static/timings/` for report reproducibility.

---

## Course Final Focus (Current Team Direction)

For the final course deliverable, we are intentionally focusing on **squats only**.

- We recorded our own squat clips as realistic ASU-student-style gym data.
- We are treating this as a proof-of-concept computer vision form-coaching system, not a production medical tool.
- Scope control is deliberate so we can show end-to-end quality (data → analysis → evidence) on one exercise.

---

## Validation Plan & Evidence (Task 3)

To satisfy the final-project rubric, we evaluate the current squat pipeline on held-out recorded clips.

### Recommended evaluation outputs

1. **Rep detection quality**
   - Compare predicted rep count vs manually labeled rep count per video.
   - Report Mean Absolute Error (MAE) and exact-match rate.
2. **Fault classification quality**
   - For each fault label (`insufficient_depth`, `excessive_forward_lean`, `poor_control`, `heel_lift`), compute precision/recall/F1.
   - Include a confusion matrix for fault/no-fault per label.
3. **Score consistency**
   - Compare predicted form score to a human rubric score (if available) using correlation (Spearman/Pearson).
4. **Qualitative examples**
   - Include 3–5 clips with screenshot evidence of correct detection and failure cases.

### Minimum report-ready table template

| Metric Group | Metric | Value |
|---|---|---|
| Rep detection | Rep count MAE | _fill_ |
| Rep detection | Exact rep-count match (%) | _fill_ |
| Fault: depth | Precision / Recall / F1 | _fill_ |
| Fault: lean | Precision / Recall / F1 | _fill_ |
| Fault: control | Precision / Recall / F1 | _fill_ |
| Fault: heel lift | Precision / Recall / F1 | _fill_ |

### Included helper script (new)

You can now compute the Task 3 table directly from labeled clip metadata:

```bash
cd backend
python scripts/evaluate_task3.py --input <path-to-eval-json>

# end-to-end MVP validation (manifest contains video path + ROI)
python scripts/validate_mvp.py --manifest metrics/mvp_validation_manifest.example.json
```

### Five-clip validation run (recommended for final report appendix)

1. Create `backend/metrics/mvp_validation_manifest.json` with 5 side-view clips.
2. Run:

```bash
cd backend
PYTHONPATH=. python scripts/validate_mvp.py --manifest metrics/mvp_validation_manifest.json
```

This command produces reproducible rep/fault metrics from the same pipeline used by the app.

The script prints a markdown table for rep-count and per-fault metrics, plus optional score correlation if `human_score` + `predicted_score` are present.

---

## How Feedback Is Generated (Task 4)

This directly answers the instructor question about MediaPipe-to-feedback mapping.

### End-to-end feedback logic

1. **Pose extraction**
   - `pose_extractor.py` runs MediaPipe and returns landmarks per frame.
2. **Rep segmentation**
   - `rep_detector.py` identifies squat cycles (`start_frame`, `bottom_frame`, `end_frame`) from knee-angle motion.
3. **Feature engineering**
   - `feature_engineering.py` computes:
     - min knee angle
     - min hip angle
     - max torso lean
     - bottom hip-to-knee delta
     - rep duration
     - heel-lift baseline deviation
4. **Rule evaluation**
   - `fault_rules.py` compares features against thresholds and emits issue labels + severities.
5. **User-facing coaching text**
   - `feedback_generator.py` maps labels to plain-language corrective cues/drills.
6. **Frontend presentation**
   - Analyze results show score, issues, overview metrics, and overlay image.

### Fault rule summary currently used

- `insufficient_depth`: hip not below knee OR knee angle > 100°
- `excessive_forward_lean`: torso angle < 145°
- `poor_control`: rep duration < 1.2 s
- `heel_lift`: heel rise from baseline > 0.03

---

## Frame-by-Frame Demo Plan for Presentation (Task 5)

Current UI returns a bottom-position overlay image. For class demo, we can still provide an explanatory frame-by-frame walkthrough with minimal new code.

### Option A (fastest, no backend changes)

1. Pre-open the uploaded squat clip in a video player that supports frame stepping (e.g., VLC or browser + scrub).
2. Use API output fields (`start_frame`, `bottom_frame`, `end_frame`) to jump to key moments.
3. Narrate what is happening at each key frame:
   - descent setup
   - bottom depth
   - ascent control
4. Show the generated issue labels and coaching cues alongside those frames.

### Option B (small extension after presentation prep)

- Add a frame-stepper in the frontend Video tab:
  - slider + previous/next frame buttons
  - key-frame markers
  - synchronized issue explanation panel

✅ Implemented lightweight version: the Video tab now includes a rep selector and a key-frame walkthrough panel using `start_frame`, `bottom_frame`, and `end_frame`.

This would make the “explanation per frame” explicit while preserving the existing architecture.

---

## Reproducibility Package Checklist (Task 6)

To make grading frictionless, submit the project with this structure:

1. **Code**
   - Keep frontend + backend as in repo.
   - Include inline comments where logic is non-obvious.
2. **Data description**
   - Add data source notes (how clips were recorded/organized) and label definitions.
3. **Execution instructions**
   - Keep the Quick Start commands in this README as the canonical run path.
4. **Results artifacts**
   - Include evaluation tables/plots/screenshots used in slides/report.
5. **LLM log**
   - Export a log of prompts/responses used in development and include in submission package.

### Suggested final submission folders

```text
submission/
├── report/
├── slides/
├── demo_assets/
├── metrics/
├── llm_log/
└── repo_snapshot/  (this project)
```

---

## Disclaimer

This is a basic form analysis tool and is **not a substitute for professional coaching or medical advice**.
