# CIS 515 Presentation Outline (15 Slides)

## 1) Title / team / project name
- **Slide title:** AI-Powered Weightlifting Form Correction at ASU SDFC
- **Main bullets:** Team members, course, semester, MVP statement
- **Visual suggestion:** Project logo + one gym still frame
- **Speaker note:** Introduce problem context and what the demo will show.

## 2) Problem and motivation
- **Slide title:** Why this problem matters
- **Main bullets:** Coaching access gap, injury-risk motivation, student affordability
- **Visual suggestion:** Problem statement graphic / short quote
- **Speaker note:** Frame this as a practical student wellness challenge.

## 3) Stakeholders and ASU relevance
- **Slide title:** Stakeholders and campus impact
- **Main bullets:** ASU students, SDFC, wellness programs, educational value
- **Visual suggestion:** Stakeholder map
- **Speaker note:** Emphasize ASU-specific relevance and feasibility.

## 4) Dataset and collection process
- **Slide title:** Data used in MVP
- **Main bullets:** Video sources, consent assumptions, side-view focus, TODO counts
- **Visual suggestion:** Data pipeline snapshot and sample frame
- **Speaker note:** Be explicit about current dataset limits.

## 5) Data preprocessing pipeline
- **Slide title:** Preprocessing workflow
- **Main bullets:** Decode, stride/downscale, pose extraction, smoothing, rep segmentation
- **Visual suggestion:** Flowchart from `docs/system_design.md`
- **Speaker note:** Explain why lightweight preprocessing supports MVP speed.

## 6) System architecture
- **Slide title:** End-to-end architecture
- **Main bullets:** Frontend, FastAPI backend, analysis services, outputs/artifacts
- **Visual suggestion:** Component diagram
- **Speaker note:** Show input → processing → output chain clearly.

## 7) MediaPipe Pose and keypoint extraction
- **Slide title:** Pose keypoint extraction
- **Main bullets:** Landmarks used, normalized coordinates, visibility checks
- **Visual suggestion:** Annotated skeleton frame
- **Speaker note:** Clarify what signal comes from pose vs tracking.

## 8) Feature engineering and rule logic
- **Slide title:** How feedback is generated
- **Main bullets:** Angles/depth/tempo features, threshold rules, issue-to-feedback map
- **Visual suggestion:** Table of example rules and labels
- **Speaker note:** Highlight interpretability and MVP simplicity.

## 9) Bar path / ROI tracking enhancement if implemented
- **Slide title:** Optional bar path tracking
- **Main bullets:** ROI selection, tracker outputs, success/lost frames, fallback behavior
- **Visual suggestion:** Video still with ROI and traced path
- **Speaker note:** Mention this is enhancement; pose pipeline still works without it.

## 10) Demo walkthrough
- **Slide title:** Live/recorded demo path
- **Main bullets:** Upload, ROI, run analysis, inspect outputs, export artifacts
- **Visual suggestion:** 3–4 step storyboard
- **Speaker note:** Keep walkthrough reproducible and short.

## 11) Validation and results
- **Slide title:** MVP validation status
- **Main bullets:** Manual validation table, metrics placeholders, known observations
- **Visual suggestion:** Validation table + TODO highlights
- **Speaker note:** Do not overclaim; report only measured values.

## 12) Deployment and maintenance plan
- **Slide title:** Deployment + operations
- **Main bullets:** Local run, ASU deployment vision, monitoring, update strategy
- **Visual suggestion:** Lifecycle diagram
- **Speaker note:** Show practical pathway beyond class demo.

## 13) Risks and limitations
- **Slide title:** Risks and constraints
- **Main bullets:** Dataset size, angle sensitivity, lighting, bias, disclaimer
- **Visual suggestion:** Risk matrix (likelihood × impact)
- **Speaker note:** Be candid and grounded in MVP scope.

## 14) Future work
- **Slide title:** Next iteration roadmap
- **Main bullets:** More exercises, larger dataset, personalization, robust tracking
- **Visual suggestion:** Roadmap timeline
- **Speaker note:** Distinguish post-class roadmap from current deliverables.

## 15) Team contributions
- **Slide title:** Contribution summary
- **Main bullets:** Per-member roles (data, backend, frontend, evaluation, report/slides)
- **Visual suggestion:** Contribution table with percentages
- **Speaker note:** Align with peer evaluations and final report acknowledgments.
