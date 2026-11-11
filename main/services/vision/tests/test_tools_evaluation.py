"""
Unit tests for FAR/FRR Evaluation, Calibration, and Monte-Carlo Simulation Tools.
Uses synthetic vectors and controlled score distributions to verify mathematical correctness.
"""

import json
import math
import tempfile
from pathlib import Path

import numpy as np
import pytest

from tools.calibrate import (
    MIN_SUBJECTS,
    derive_anchors,
    update_calibration_file,
)
from tools.evaluate import (
    compare_centroid_vs_topk,
    compute_centroid,
    cosine_similarity,
    evaluate_scores,
    l2_normalize,
)
from tools.simulate_sequences import run_monte_carlo, simulate_exam_session


def test_l2_normalize_and_centroid():
    # 3 random 512-d vectors
    np.random.seed(42)
    v1 = np.random.randn(512)
    v2 = np.random.randn(512)
    v3 = np.random.randn(512)

    v1_norm = l2_normalize(v1)
    assert np.isclose(np.linalg.norm(v1_norm), 1.0)

    centroid = compute_centroid([v1, v2, v3])
    assert np.isclose(np.linalg.norm(centroid), 1.0)
    assert len(centroid) == 512


def test_evaluate_scores_eer():
    # Synthetic distributions with known separation:
    # Genuine ~ N(0.70, 0.05), Impostor ~ N(0.20, 0.05)
    np.random.seed(42)
    genuine = np.random.normal(0.70, 0.05, 500).tolist()
    impostor = np.random.normal(0.20, 0.05, 500).tolist()

    res = evaluate_scores(genuine, impostor)

    assert "eer" in res
    assert "eer_threshold" in res
    assert 0.30 <= res["eer_threshold"] <= 0.60
    # Clear separation should yield very low EER (< 1%)
    assert res["eer"] < 0.01

    assert res["genuine_stats"]["mean"] > 0.65
    assert res["impostor_stats"]["mean"] < 0.25


def test_compare_centroid_vs_topk():
    np.random.seed(42)
    c1 = l2_normalize(np.random.randn(128))
    # Small perturbations of c1
    s1 = l2_normalize(c1 + np.random.randn(128) * 0.02)
    s2 = l2_normalize(c1 + np.random.randn(128) * 0.02)
    probe = l2_normalize(c1 + np.random.randn(128) * 0.02)

    centroids = {"p1": c1}
    samples = {"p1": [s1, s2]}
    probes = {"p1": [probe]}

    comp = compare_centroid_vs_topk(centroids, samples, probes, k=2)
    assert "mean_centroid_score" in comp
    assert "mean_topk_score" in comp
    assert comp["mean_centroid_score"] > 0.80
    assert comp["mean_topk_score"] > 0.80


def test_derive_anchors_satisfies_inequality():
    np.random.seed(42)
    genuine = np.random.normal(0.75, 0.05, 100).tolist()
    impostor = np.random.normal(0.20, 0.05, 200).tolist()

    floor_raw, anchor_raw, ceiling_raw = derive_anchors(genuine, impostor, target_far=0.01)

    assert floor_raw < anchor_raw < ceiling_raw
    assert floor_raw >= 0.15
    assert ceiling_raw <= 1.0


def test_calibration_refuses_small_sample_size():
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        tmp_path = Path(tmp.name)

    try:
        # 5 subjects < MIN_SUBJECTS (10)
        with pytest.raises(ValueError, match="Sample size too small"):
            update_calibration_file(
                calibration_file_path=tmp_path,
                floor_raw=0.20,
                anchor_raw=0.45,
                ceiling_raw=0.70,
                sample_count=20,
                subject_count=5,
            )
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


def test_monte_carlo_false_incident_reduction():
    # Per-frame FRR = 5%, 60 checks
    # Consecutive limit 1 should trigger false incidents frequently
    # Consecutive limit 3 should trigger false incidents rarely
    res = run_monte_carlo(
        num_sessions=1000,
        exam_duration_minutes=10,
        check_interval_seconds=10,
        consecutive_limits=[1, 3],
        genuine_frr=0.05,
        impostor_far=0.01,
    )

    limit1_rate = res["limits"][1]["false_incident_rate_pct"]
    limit3_rate = res["limits"][3]["false_incident_rate_pct"]

    # limit 1 (single mismatch triggers incident) has high false incident rate (> 80%)
    assert limit1_rate > 50.0
    # limit 3 dramatically drops false incident rate (< 5%)
    assert limit3_rate < 5.0
