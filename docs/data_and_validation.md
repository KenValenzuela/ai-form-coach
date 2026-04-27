# Data and Validation (MVP)

## Dataset Source
- Primary source: team-recorded or consented squat demo videos for MVP testing.
- Optional supplemental source: publicly available squat clips if license permits.
- TODO: Document exact sources/links and consent process in final report.

## Dataset Size
- TODO: Fill in total number of videos collected.
- TODO: Fill in number of videos used for internal development vs. final validation.

## Video Format Assumptions
- Supported upload formats: `.mp4`, `.mov`, `.avi`, `.mkv`, `.webm` (frontend/backend dependent)
- Side-view camera angle expected.
- Full body should stay in frame with adequate lighting.

## Input Angle Assumptions
- MVP assumes sagittal (side) view for squat biomechanics.
- Non-side angles may degrade depth and lean interpretation.

## Preprocessing Steps
1. Decode video frames (optional stride/downscale for speed).
2. Run MediaPipe Pose landmark extraction per frame.
3. Smooth landmarks to reduce jitter.
4. Segment reps using knee-angle state transitions.
5. Compute rep-level biomechanical features.
6. Apply rule-based fault checks.

## Data Limitations
- Small and non-standardized MVP dataset.
- Camera setup and background variation across clips.
- Occlusion, clothing, and lighting can reduce landmark quality.
- Possible demographic/body-type bias due to limited samples.

## Validation Method
- Manual clip review against expected observations.
- Compare system outputs (rep count, depth/lean labels, tracking stability) to human expectation.
- Record pass/fail outcomes per clip.

### Validation Table Template
| Test clip | Expected observation | System output | Pass/Fail | Notes |
|---|---|---|---|---|
| TODO_clip_01.mp4 | TODO | TODO | TODO | TODO |
| TODO_clip_02.mp4 | TODO | TODO | TODO | TODO |
| TODO_clip_03.mp4 | TODO | TODO | TODO | TODO |

## MVP Metrics (manual fill)
- **Rep detection accuracy:** TODO: Fill in `%` agreement with manual count.
- **Depth classification agreement:** TODO: Fill in `%` agreement with manual labels.
- **Bar path tracking success rate:** TODO: Fill in average success rate across clips.
- **Processing time per video:** TODO: Fill in mean/median seconds from upload to result.

## Evidence To Add Before Final Submission
- TODO: Fill in number of videos tested.
- TODO: Add sample output screenshots (UI + overlay + metrics).
- TODO: Add one anonymized example JSON output in appendix/notebook.
- TODO: Add final validation summary table in report.

## Disclaimer
This prototype provides educational form feedback only and is not medical advice or a substitute for a certified coach.
