"""Task 3 evaluation helper.

Usage:
  python backend/scripts/evaluate_task3.py --input metrics/eval_labels.json

Input JSON format:
{
  "videos": [
    {
      "id": "clip_01",
      "actual_rep_count": 5,
      "predicted_rep_count": 4,
      "actual_fault_labels": ["insufficient_depth"],
      "predicted_fault_labels": ["insufficient_depth", "poor_control"],
      "human_score": 78,
      "predicted_score": 70
    }
  ]
}
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.services.evaluation import (
    per_fault_metrics,
    render_report_table,
    rep_count_metrics,
    score_correlations,
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Compute Task 3 validation metrics")
    parser.add_argument("--input", required=True, help="Path to evaluation JSON")
    args = parser.parse_args()

    payload = json.loads(Path(args.input).read_text())
    videos = payload.get("videos", [])
    if not videos:
        raise SystemExit("No videos found in input JSON")

    predicted_reps = [item["predicted_rep_count"] for item in videos]
    actual_reps = [item["actual_rep_count"] for item in videos]
    pred_faults = [item.get("predicted_fault_labels", []) for item in videos]
    actual_faults = [item.get("actual_fault_labels", []) for item in videos]

    rep_metrics = rep_count_metrics(predicted_reps, actual_reps)
    fault_metrics = per_fault_metrics(actual_faults, pred_faults)

    correlations = None
    if all("human_score" in item and "predicted_score" in item for item in videos):
        correlations = score_correlations(
            [item["predicted_score"] for item in videos],
            [item["human_score"] for item in videos],
        )

    print("| Metric Group | Metric | Value |")
    print("|---|---|---|")
    for group, metric, value in render_report_table(rep_metrics, fault_metrics):
        print(f"| {group} | {metric} | {value} |")

    if correlations:
        print(f"\nScore correlation (Pearson): {correlations['pearson']:.3f}")
        print(f"Score correlation (Spearman): {correlations['spearman']:.3f}")


if __name__ == "__main__":
    main()
