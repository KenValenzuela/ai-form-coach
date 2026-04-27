# Data Folder Guide

This folder is for local data used to run and reproduce the MVP demo.

## Recommended Local Layout
```text
data/
  raw_videos/          # input clips (not committed)
  processed/           # optional derived files
  samples/             # tiny shareable examples only
```

## What to Place Here
- Side-view squat demo videos for validation and demo rehearsal.
- Small anonymized sample clips only if license/consent allows.

## What NOT to Commit
- Large raw videos
- Personally identifying footage without permission
- Any sensitive metadata

## Reproducibility Notes
- Keep a local manifest (`data/raw_videos/manifest.csv`) with:
  - clip name
  - source/consent note
  - camera angle
  - date collected
- Reference clip IDs (not personal names) in validation tables.

## TODO Before Final Submission
- TODO: Fill in final dataset size in `docs/data_and_validation.md`.
- TODO: Confirm which clips are safe to include in demo package.

## Disclaimer
This prototype provides educational form feedback only and is not medical advice or a substitute for a certified coach.
