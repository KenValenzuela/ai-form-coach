# Deployment and Maintenance Plan

## Local Deployment (Current MVP)
### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

### Frontend
```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

## Possible ASU/SDFC Deployment Vision
- Internal web app hosted on ASU-managed infrastructure or approved cloud.
- Authenticated student/staff access.
- Optional kiosk/workstation mode for SDFC demo area.
- Optional API gateway for controlled upload size/rate limits.

## Privacy Considerations
- Workout videos are sensitive user data.
- Use explicit consent language before upload.
- Minimize retention; auto-delete raw uploads after analysis window.
- Avoid collecting unnecessary personal identifiers.
- If deployed institutionally, align with ASU policy and legal requirements.

## Scalability
- Horizontal API scaling for concurrent video uploads.
- Queue-based asynchronous processing for larger workloads.
- Store derived metrics separately from raw videos to reduce storage footprint.
- Add caching for repeated demo assets.

## Data Drift / Performance Drift
- Monitor shifts in input quality (camera angles, lighting, frame rates).
- Track rates of low-visibility landmark failures.
- Periodically review fault-label consistency against human review samples.

## Model/Rule Updates
- Version thresholds and feedback mapping files.
- Keep changelog entries for rule adjustments.
- Re-run validation table after each update.

## Monitoring Strategy
- Log API request durations and failure counts.
- Log tracking success rate and lost-frame frequency.
- Create lightweight dashboard for:
  - analysis latency
  - no-rep-detected rate
  - tracking failure rate

## Feedback Wording Disclaimer
Include this notice in UI/docs/report:

> This prototype provides educational form feedback only and is not medical advice or a substitute for a certified coach.

## Operational TODOs
- TODO: Define data retention period for raw uploads.
- TODO: Add production logging/alerts for API failures.
- TODO: Decide whether to keep synchronous or queue-based inference for finals demo.
