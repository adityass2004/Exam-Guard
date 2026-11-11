# ExamGuard Biometric Calibration & Evaluation Toolchain

This directory provides empirical evaluation, threshold calibration, and sequence simulation tools for the ExamGuard face verification pipeline.

---

## 1. Privacy & Test Data Policy

> [!IMPORTANT]
> **No biometric datasets are bundled in this repository.**  
> In compliance with privacy standards and institutional ethical requirements, biometric data must be collected with informed participant consent and stored privately outside version control.

### Dataset Directory Format
Organise consented evaluation data as follows:
```
<dataset_root>/
  ├── <person_id_01>/
  │     ├── enrollment_front.jpg
  │     ├── enrollment_left.jpg
  │     ├── enrollment_right.jpg
  │     ├── enrollment_up.jpg
  │     ├── enrollment_down.jpg
  │     ├── probe_01.jpg
  │     └── probe_02.jpg
  ├── <person_id_02>/
  ...
```

---

## 2. Tools Overview

### 2.1 `evaluate.py`
Computes genuine and impostor similarity distributions:
- Extracts embeddings and builds L2-normalised centroid vectors for each identity.
- Evaluates genuine pairs (probes vs own centroid) and impostor pairs (probes vs foreign centroids).
- Sweeps thresholds from `0.0` to `1.0` to compute **FAR (False Acceptance Rate)**, **FRR (False Rejection Rate)**, and **EER (Equal Error Rate)**.
- Compares **Centroid matching** vs **Top-k sample matching**.

**Usage:**
```bash
python evaluate.py --dataset /path/to/consented_dataset --out evaluation_results.json
```

---

### 2.2 `calibrate.py`
Derives empirical operating thresholds for production use:
- Determines `floor_raw` (impostor 95th percentile, mapping to 0%).
- Determines `anchor_raw` (target FAR operating threshold, mapping to 75%).
- Determines `ceiling_raw` (genuine 90th percentile, mapping to 100%).
- Enforces sample size minimums: $\ge 10$ subjects, $\ge 50$ genuine pairs, $\ge 100$ impostor pairs. Refuses to update status to `CALIBRATED` if sample criteria are not met.
- Updates `calibration.json` automatically, reflecting directly in `/v1/diagnostics` and the Admin UI.

**Usage:**
```bash
python calibrate.py --eval-results evaluation_results.json
```

---

### 2.3 `simulate_sequences.py`
Monte-Carlo simulator that models exam sessions to determine optimal security trigger thresholds:
- Estimates the false-incident probability for genuine candidates over a complete exam session as a function of `consecutive_mismatch_limit` ($k = 1, 2, 3, 4, 5$).
- Estimates mean time-to-detect for an impostor candidate.
- Documents the difference between independent Bernoulli trials and temporally correlated camera frames.

**Usage:**
```bash
python simulate_sequences.py --sessions 10000 --duration 60 --interval 10 --frr 0.02 --far 0.01
```

