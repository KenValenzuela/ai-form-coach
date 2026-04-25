from __future__ import annotations

from typing import Dict, Iterable, List, Sequence, Tuple

import numpy as np


def rep_count_metrics(predicted: Sequence[int], actual: Sequence[int]) -> Dict[str, float]:
    if len(predicted) != len(actual):
        raise ValueError("predicted and actual must have same length")
    if not predicted:
        return {"mae": 0.0, "exact_match_rate": 0.0}

    errors = [abs(p - a) for p, a in zip(predicted, actual)]
    exact_matches = [1 if p == a else 0 for p, a in zip(predicted, actual)]
    return {
        "mae": float(np.mean(errors)),
        "exact_match_rate": float(np.mean(exact_matches)),
    }


def binary_classification_metrics(
    y_true: Sequence[bool],
    y_pred: Sequence[bool],
) -> Dict[str, float | int]:
    if len(y_true) != len(y_pred):
        raise ValueError("y_true and y_pred must have same length")

    tp = sum(1 for t, p in zip(y_true, y_pred) if t and p)
    fp = sum(1 for t, p in zip(y_true, y_pred) if not t and p)
    tn = sum(1 for t, p in zip(y_true, y_pred) if not t and not p)
    fn = sum(1 for t, p in zip(y_true, y_pred) if t and not p)

    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if (precision + recall)
        else 0.0
    )

    return {
        "tp": tp,
        "fp": fp,
        "tn": tn,
        "fn": fn,
        "precision": precision,
        "recall": recall,
        "f1": f1,
    }


FAULT_LABELS = (
    "insufficient_depth",
    "excessive_forward_lean",
    "poor_control",
    "heel_lift",
)


def per_fault_metrics(
    true_labels_per_rep: Sequence[Iterable[str]],
    predicted_labels_per_rep: Sequence[Iterable[str]],
    labels: Sequence[str] = FAULT_LABELS,
) -> Dict[str, Dict[str, float | int]]:
    if len(true_labels_per_rep) != len(predicted_labels_per_rep):
        raise ValueError("label sequences must have same length")

    metrics: Dict[str, Dict[str, float | int]] = {}
    true_sets = [set(x) for x in true_labels_per_rep]
    pred_sets = [set(x) for x in predicted_labels_per_rep]

    for label in labels:
        y_true = [label in rep for rep in true_sets]
        y_pred = [label in rep for rep in pred_sets]
        metrics[label] = binary_classification_metrics(y_true, y_pred)

    return metrics


def score_correlations(
    predicted_scores: Sequence[float],
    human_scores: Sequence[float],
) -> Dict[str, float]:
    if len(predicted_scores) != len(human_scores):
        raise ValueError("predicted_scores and human_scores must have same length")
    if len(predicted_scores) < 2:
        return {"pearson": 0.0, "spearman": 0.0}

    predicted_np = np.asarray(predicted_scores, dtype=float)
    human_np = np.asarray(human_scores, dtype=float)

    pearson = float(np.corrcoef(predicted_np, human_np)[0, 1])

    pred_ranks = _average_ranks(predicted_np)
    human_ranks = _average_ranks(human_np)
    spearman = float(np.corrcoef(pred_ranks, human_ranks)[0, 1])

    if np.isnan(pearson):
        pearson = 0.0
    if np.isnan(spearman):
        spearman = 0.0

    return {"pearson": pearson, "spearman": spearman}


def _average_ranks(values: np.ndarray) -> np.ndarray:
    order = np.argsort(values, kind="mergesort")
    ranks = np.empty_like(order, dtype=float)

    idx = 0
    while idx < len(values):
        start = idx
        current_value = values[order[idx]]
        while idx < len(values) and values[order[idx]] == current_value:
            idx += 1
        end = idx
        average_rank = (start + end - 1) / 2.0 + 1.0
        ranks[order[start:end]] = average_rank

    return ranks


def render_report_table(
    rep_metrics: Dict[str, float],
    fault_metrics: Dict[str, Dict[str, float | int]],
) -> List[Tuple[str, str, str]]:
    rows: List[Tuple[str, str, str]] = [
        ("Rep detection", "Rep count MAE", f"{rep_metrics['mae']:.3f}"),
        (
            "Rep detection",
            "Exact rep-count match (%)",
            f"{rep_metrics['exact_match_rate'] * 100:.1f}%",
        ),
    ]

    for label, display in (
        ("insufficient_depth", "Fault: depth"),
        ("excessive_forward_lean", "Fault: lean"),
        ("poor_control", "Fault: control"),
        ("heel_lift", "Fault: heel lift"),
    ):
        item = fault_metrics[label]
        rows.append(
            (
                display,
                "Precision / Recall / F1",
                f"{item['precision']:.3f} / {item['recall']:.3f} / {item['f1']:.3f}",
            )
        )

    return rows
