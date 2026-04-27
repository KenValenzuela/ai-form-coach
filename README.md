# AI-Powered Weightlifting Form Correction at ASU SDFC

CIS 515 MVP project for side-view squat form analysis using computer vision.

## Problem and Motivation
ASU students using the Sun Devil Fitness Complex (SDFC) often do not have access to affordable 1:1 coaching. Poor lifting technique can increase injury risk. This MVP provides educational, automated squat-form feedback from recorded videos.

## Stakeholders
- ASU students (primary users)
- SDFC staff and trainers (potential operational stakeholders)
- ASU wellness / fitness programs (possible future adopters)

## MVP Scope
- **In scope:** recorded **side-view squat** video analysis
- **Out of scope (for this MVP):** real-time coaching, personalized medical recommendations, full multi-exercise support
- **Enhancements currently present in repo:** ROI selection, barbell/path tracking, timing overlays, results dashboard

## System Pipeline
```text
Video upload (frontend)
→ FastAPI endpoint (/api/analyze)
→ frame decoding
→ MediaPipe Pose keypoint extraction
→ landmark smoothing
→ rep detection
→ feature engineering (angles/depth/tempo/etc.)
→ rule-based fault evaluation
→ feedback generation
→ optional ROI/barbell path tracking
→ UI results + downloadable artifacts
```

## Tech Stack
- **Frontend:** Next.js + React + TypeScript
- **Backend:** FastAPI + Python
- **CV/ML tooling:** MediaPipe Pose, OpenCV, NumPy
- **Storage:** SQLite (analysis metadata), local file exports

## Repository Layout
- `frontend/` – web app UI and stateful analysis workflow
- `backend/` – API, analysis pipeline, bar-path tracker, tests, scripts
- `docs/` – CIS 515 rubric-aligned deliverable documentation
- `data/` – dataset placement guidance (no large videos checked in)

## Setup Instructions
### Prerequisites
- Python 3.10+
- Node.js 18+

### 1) Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```
Backend runs at `http://localhost:8000`.

### 2) Frontend
```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```
Frontend runs at `http://localhost:3000`.

### 3) Analysis / Demo Run
1. Open the frontend Analyze section.
2. Upload a side-view squat video (`.mp4`, `.mov`, `.avi`, `.webm`).
3. Select/confirm ROI around barbell sleeve/end-cap (recommended).
4. Run analysis.
5. Review score, feedback, metrics, and optional tracking outputs.

### Manual ROI Tracking Smoke Test
1. Start backend: `cd backend && python run.py`
2. Start frontend: `cd frontend && npm run dev`
3. Upload a squat side-view video.
4. Play preview for 1–3 seconds.
5. Pause when barbell end-cap is clearly visible.
6. Draw ROI around end-cap and confirm **Initial ROI**.
7. Start KCF tracking.
8. Verify processed output shows **Tracked ROI + bar path** and no backend crash.

## Backend Run Modes / Checks
- API docs: `http://localhost:8000/docs`
- Unit tests: `cd backend && pytest`
- MVP validation script: `cd backend && python scripts/validate_mvp.py`

## Expected Input Format
- Multipart request to `POST /api/analyze`
- Required fields:
  - `video` (uploaded file)
  - `exercise_type` (`squat` for MVP)
- Optional tuning fields:
  - `camera_view`, `roi_x/roi_y/roi_w/roi_h`, `frame_stride`, `analysis_downscale`, `tracker_type`, etc.

## Expected Output Format
`/api/analyze` returns JSON containing:
- analysis metadata (`video_id`, `fps`, `summary_status`, timings)
- per-rep metrics (`min_knee_angle`, `rep_duration_sec`, etc.)
- issue labels + feedback text
- optional tracking summary (`tracking_success_rate`, path metrics)
- artifact links (`tracking_csv_url`, `annotated_video_url`, timing logs)

## ROI Tracking API Flow (MVP)
1. Upload a video with `POST /api/analyze/upload-tracker-video`.
   - Returns `video_id`, static URL, and metadata (`fps`, `duration`, `frame_count`, `width`, `height`).
2. Preview an exact frame with `GET /api/video/frame?video_id=<id>&time=<seconds>`.
3. Pause playback in frontend and select **Initial ROI** around the barbell end-cap.
4. Start tracking with `POST /api/track/barbell`:
   - body: `video_id`, `start_time`, pixel ROI `{x,y,width,height}`, `tracker_type` (`KCF`).
5. Backend initializes tracker on the exact frame, tracks forward, and writes processed output.
6. Frontend displays **Tracked ROI + bar path** results.

### KCF Tracker Notes
- Tracker creation supports OpenCV modern + `cv2.legacy` paths.
- Install `opencv-contrib-python` (not `opencv-python` simultaneously) for KCF/CSRT tracker availability.
- Friendly errors are returned when tracker support is unavailable.

## Known Limitations
- Side-view squat only (no multi-angle fusion)
- Accuracy depends on camera quality, lighting, and full-body visibility
- Fixed heuristic thresholds are not personalized
- Small/locally managed dataset in MVP phase
- ROI tracking can fail on low contrast, occlusion, or motion blur
- Side-view videos with clear barbell sleeve/end-cap visibility work best for reliable KCF tracking

## Reproducibility Notes
- Use pinned backend dependencies in `backend/requirements.txt`.
- Use frontend scripts in `frontend/package.json`.
- Place local demo videos under `data/raw_videos/` (ignored by git) as documented in `data/README.md`.
- Follow rubric mapping in `docs/final_project_checklist.md` before submission.

## MVP Disclaimer
**This prototype provides educational form feedback only and is not medical advice or a substitute for a certified coach.**
