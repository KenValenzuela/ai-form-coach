# CIS 515 Final Project Checklist (MVP Audit)

Use this checklist to verify submission readiness for the final report, presentation, and demo package.

| Requirement | Evidence in repo | Status | Action needed |
|---|---|---|---|
| Problem & motivation | `README.md` Problem section; `docs/presentation_outline.md` slides 2-3 | Complete | Keep language consistent with final report abstract. |
| Data | `docs/data_and_validation.md`; `data/README.md` | Partial | TODO: Fill exact number of videos and source split. |
| Preprocessing | `docs/system_design.md` + `backend/app/services/video_io.py`, `pose_extractor.py`, `smoothing.py` | Complete | Add one screenshot of preprocessing output to report appendix. |
| Model/system design | `docs/system_design.md`; backend pipeline services | Complete | Keep mermaid/text diagram in slides. |
| Implementation | `backend/app/services/*`, `backend/app/api/routes/analyze.py`, `frontend/components/AnalyzeSection.tsx` | Complete | Add final commit hash in report reproducibility section. |
| Validation/results | `docs/data_and_validation.md` validation table template; backend tests | Partial | TODO: Fill measured MVP metrics and attach sample outputs. |
| Deployment plan | `docs/deployment_and_maintenance.md` deployment vision section | Complete | Add hosting choice decision in final report. |
| Maintenance plan | `docs/deployment_and_maintenance.md` monitoring/update/data-drift sections | Complete | Assign owner for maintenance tasks in contribution summary. |
| Risks/limitations | `docs/risks_limitations.md` | Complete | Include mitigations in presentation slide 13. |
| Code reproducibility | `README.md` setup/run instructions; dependency files; `.gitignore` | Complete | Verify all commands on clean machine before submission. |
| Demo evidence (input → processing → output) | UI flow in `frontend/components/AnalyzeSection.tsx`; API outputs; tracking exports | Partial | TODO: Add final demo recording link and still images. |
| Presentation slides (10–15) | `docs/presentation_outline.md` 15-slide plan | Complete | Build deck from outline and add visuals. |
| LLM log | `docs/llm_log.md` template | Partial | TODO: Fill only actual prompts/tools used by team. |
| Peer evaluation reminder | This checklist + course submission TODO | Partial | TODO: Complete and submit peer evaluation form by deadline. |
| Contribution summary | `docs/presentation_outline.md` slide 15 template | Partial | TODO: Add named contributions with percentages/roles. |

## Open Issues / Failed Checks
- `cd backend && pytest -q` currently fails in environments without backend dependencies installed (`ModuleNotFoundError: No module named 'cv2'` and `ModuleNotFoundError: No module named 'numpy'`).
- `cd backend && python scripts/validate_mvp.py` currently fails in environments without OpenCV installed (`ModuleNotFoundError: No module named 'cv2'`).
- `cd frontend && npm run lint` completes with warnings (React hook dependency warning and `next/image` recommendations) but no blocking errors after config/setup fixes.
- Recommended remediation:
  1. Create/activate backend venv and install `backend/requirements.txt`.
  2. Re-run backend tests and validation script.
  3. Decide whether to address non-blocking frontend lint warnings before final submission.

## Submission Gate
Project is ready when all **Partial/Missing** rows are either completed or explicitly documented in final report/slides with a concrete owner and due date.
