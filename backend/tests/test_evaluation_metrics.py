from app.services.evaluation import (
    binary_classification_metrics,
    per_fault_metrics,
    rep_count_metrics,
    render_report_table,
    score_correlations,
)


def test_rep_count_metrics_basic():
    metrics = rep_count_metrics([5, 6, 3], [5, 4, 3])
    assert metrics["mae"] == 2 / 3
    assert metrics["exact_match_rate"] == 2 / 3


def test_binary_classification_metrics_counts_and_scores():
    metrics = binary_classification_metrics(
        [True, False, True, False],
        [True, True, False, False],
    )
    assert metrics == {
        "tp": 1,
        "fp": 1,
        "tn": 1,
        "fn": 1,
        "precision": 0.5,
        "recall": 0.5,
        "f1": 0.5,
    }


def test_per_fault_metrics_shape():
    truth = [
        {"insufficient_depth", "poor_control"},
        {"heel_lift"},
        set(),
    ]
    pred = [
        {"insufficient_depth"},
        {"heel_lift", "poor_control"},
        set(),
    ]

    metrics = per_fault_metrics(truth, pred)

    assert set(metrics.keys()) == {
        "insufficient_depth",
        "excessive_forward_lean",
        "poor_control",
        "heel_lift",
    }
    assert metrics["insufficient_depth"]["tp"] == 1
    assert metrics["poor_control"]["fp"] == 1


def test_score_correlations_handles_ties():
    metrics = score_correlations([80, 90, 90, 70], [78, 92, 90, 68])
    assert metrics["pearson"] > 0.9
    assert metrics["spearman"] > 0.9


def test_render_report_table_rows():
    rows = render_report_table(
        {"mae": 0.4, "exact_match_rate": 0.8},
        {
            "insufficient_depth": {"precision": 1.0, "recall": 0.5, "f1": 2 / 3},
            "excessive_forward_lean": {"precision": 0.8, "recall": 0.8, "f1": 0.8},
            "poor_control": {"precision": 0.4, "recall": 1.0, "f1": 0.571},
            "heel_lift": {"precision": 0.0, "recall": 0.0, "f1": 0.0},
        },
    )

    assert len(rows) == 6
    assert rows[0] == ("Rep detection", "Rep count MAE", "0.400")
    assert rows[2][0] == "Fault: depth"
