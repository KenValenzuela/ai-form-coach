# Risks and Limitations

## Core MVP Risks
1. **Small dataset risk**
   - Limited clips can reduce confidence in generalization.
2. **Camera angle sensitivity**
   - Non-side angles can produce incorrect depth/lean interpretations.
3. **Lighting and clutter sensitivity**
   - Poor contrast/background clutter can hurt pose and ROI tracking.
4. **Pose estimation failure cases**
   - Occlusion, motion blur, loose clothing, or partial body visibility can cause landmark dropout.
5. **ROI/barbell tracking limitations**
   - Low-texture ROI, rapid movement, or occlusion can reduce tracking success.

## Safety and Scope Limitations
- **Not medical advice**: output is educational only.
- **Not a substitute for coaching**: feedback does not replace certified trainers.
- **No clinical claims**: no claim of diagnostic or injury-prevention accuracy.

## Bias and Generalization Limits
- Potential bias due to limited participant diversity in MVP data.
- Fixed thresholds may not reflect body-structure or mobility differences.
- Results may vary across devices, camera heights, and gym environments.

## Technical Limitations
- Rule-based logic instead of a trained classifier.
- No personalization by experience level or anthropometrics.
- Local-first architecture; no robust production auth/storage pipeline.

## Future Work
- Expand dataset with diverse body types and recording conditions.
- Add multi-view support and confidence scoring.
- Evaluate learned classifier or hybrid rule+ML approach.
- Add temporal smoothing and uncertainty display in UI.
- Improve robust fallback behavior for tracking failures.

## Disclaimer
This prototype provides educational form feedback only and is not medical advice or a substitute for a certified coach.
