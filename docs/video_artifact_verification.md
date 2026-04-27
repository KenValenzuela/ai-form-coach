# Video Artifact Pipeline Manual Verification

1. Start the backend from `backend/`:
   ```bash
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```
2. Open health endpoint and verify static directory paths/existence:
   - `http://127.0.0.1:8000/health`
3. Copy a known processed video file into:
   - `backend/app/data/processed/dennis_squat_cis515_processed.mp4`
4. Open the processed static URL directly in browser:
   - `http://127.0.0.1:8000/static/processed/dennis_squat_cis515_processed.mp4`
5. Start frontend and process a squat video from UI.
6. In the results view, confirm:
   - The main player label is **Processed / Tracked Result**.
   - The debug panel shows `display_video_url` with `/static/processed/` or `/static/tracking/`.
   - The displayed result URL is not `/static/uploads/`.
