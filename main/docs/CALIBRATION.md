# ExamGuard Biometric Calibration & Threshold Record

> **Calibration Status:** `PROVISIONAL` (Unverified on target cohort)  
> **Last Updated:** Phase 09 (Testing, Security, and Analytics)  
> **Model Pack:** InsightFace `buffalo_l` (SCRFD detection + ArcFace-class recognition)  

---

## 1. Overview & Disclaimer

ExamGuard relies on local face detection and ArcFace-class biometric embedding models. Because facial recognition accuracy is subject to variation based on camera hardware, sensor noise, lighting geometry, user ethnicity, ageing, and accessories, all thresholds defined during initial development are marked **PROVISIONAL**.

> [!WARNING]
> Match scores and quality thresholds documented here are heuristic starting baselines. They must not be treated as empirical proof of identity until calibrated on owner-consented evaluation data following the procedure in Phase 09.

---

## 2. Multi-Angle Enrollment Acceptance Criteria (`config/enrollment.ts`)

During Phase 03 multi-angle face enrollment, the Node API enforces strict server-side acceptance rules before persisting biometric reference captures:

| Quality Parameter | Threshold | Rationale / Failure Reason |
|---|---|---|
| **Face Count** | Exactly `1` | `NO_FACE` if 0; `MULTIPLE_FACES` if > 1 |
| **Minimum Sharpness (Blur)** | `35.0` (Variance of Laplacian) | `TOO_BLURRY` — prevents out-of-focus or motion-blurred reference embeddings |
| **Minimum Face Luminance** | `50.0` (Mean 8-bit luminance) | `TOO_DARK` — ensures facial landmark features are clearly discriminable |
| **Maximum Face Luminance** | `210.0` (Mean 8-bit luminance) | `TOO_BRIGHT` — prevents overexposed glare or white washout |
| **Minimum Face Size Ratio** | `0.05` (Face area / Frame area) | `FACE_TOO_SMALL` — requires subject to be sufficiently close to camera |
| **Frame Margin (Face in Frame)** | `5 px` padding from frame border | `FACE_PARTIALLY_OUT_OF_FRAME` — ensures complete head boundary in view |
| **Minimum Detector Confidence** | `0.65` (SCRFD score) | `LOW_DETECTION_CONFIDENCE` — rejects borderline detections |
| **Inter-Sample Consistency** | `0.65` Cosine similarity to centroid | `ENROLLMENT_INCONSISTENT` — ensures all 5 angles belong to the same person |

---

## 3. Pose Windows & Coordinate Conventions

Head pose is estimated in degrees (`yaw`, `pitch`, `roll`) via InsightFace 3D landmark regression (`landmark_3d_68`) with geometric keypoint fallback.

### Coordinate Convention
- **Yaw (Vertical axis):**
  - `0°`: Facing directly at camera center.
  - `+15°` to `+45°`: Student turning head toward **student's left** (viewer's right in mirrored preview).
  - `-45°` to `-15°`: Student turning head toward **student's right** (viewer's left in mirrored preview).
- **Pitch (Horizontal axis):**
  - `0°`: Level gaze.
  - `+12°` to `+35°`: Looking slightly upward.
  - `-35°` to `-12°`: Looking slightly downward.
- **Roll (Sideways tilt):**
  - Must remain within `±15°` to `±20°` to prevent tilted orientation artifacts.

### Configured Windows
```typescript
poseWindows: {
  FRONT: { yawMin: -15, yawMax:  15, pitchMin: -15, pitchMax:  15, rollMaxAbs: 15 },
  LEFT:  { yawMin:  15, yawMax:  45, pitchMin: -18, pitchMax:  18, rollMaxAbs: 20 },
  RIGHT: { yawMin: -45, yawMax: -15, pitchMin: -18, pitchMax:  18, rollMaxAbs: 20 },
  UP:    { yawMin: -18, yawMax:  18, pitchMin:  12, pitchMax:  35, rollMaxAbs: 18 },
  DOWN:  { yawMin: -18, yawMax:  18, pitchMin: -35, pitchMax: -12, rollMaxAbs: 18 },
}
```

---

## 4. Centroid Embedding Calculation

When all five angles are accepted:
1. All 5 sample vectors $v_1, \dots, v_5 \in \mathbb{R}^{512}$ (L2-normalized) are decrypted in memory.
2. The arithmetic mean vector $c = \frac{1}{5} \sum_{i=1}^5 v_i$ is computed.
3. The centroid is L2-normalized: $\hat{c} = \frac{c}{\|c\|_2}$.
4. Inter-sample consistency is verified:
   $$\text{cosine\_similarity}(v_i, \hat{c}) = v_i \cdot \hat{c} \ge 0.65 \quad \forall i \in \{1, \dots, 5\}$$
5. If any angle fails, enrollment is rejected with the specific angles identified.
6. The centroid vector $\hat{c}$ is encrypted using AES-256-GCM and stored in `eg_face_embeddings` (`kind = CENTROID`, `angle = NULL`).

---

## 5. ArcFace Raw Similarity Calibration & Mapping (`calibration.json`)

### 5.1 Architecture & Purpose
ArcFace cosine similarity between 512-dimensional L2-normalized embeddings produces raw dot products $s \in [-1.0, 1.0]$. For typical genuine face pairs under varying angles and lighting, raw scores span $[0.40, 0.75]$, while impostor pairs cluster around $[0.05, 0.25]$.

To present meaningful and consistent percentage figures to administrators without leaking fragile raw cosine scores to candidates, `services/vision/app/core/calibration.py` implements a **monotonic, clamped piecewise-linear calibration mapping** governed by `services/vision/calibration.json`:

```json
{
  "status": "PROVISIONAL",
  "floor_raw": 0.20,
  "anchor_raw": 0.45,
  "ceiling_raw": 0.70,
  "notes": "Provisional anchors chosen from general ArcFace guidance. Unverified for this specific deployment."
}
```

### 5.2 Mathematical Mapping Function
The calibrated score $P(s) \in [0.0, 100.0]$ is computed as follows:

$$P(s) = \begin{cases} 
0.0 & \text{if } s \le \text{floor\_raw} \\
\frac{s - \text{floor\_raw}}{\text{anchor\_raw} - \text{floor\_raw}} \times 75.0 & \text{if } \text{floor\_raw} < s \le \text{anchor\_raw} \\
75.0 + \frac{s - \text{anchor\_raw}}{\text{ceiling\_raw} - \text{anchor\_raw}} \times (100.0 - 75.0) & \text{if } \text{anchor\_raw} < s \le \text{ceiling\_raw} \\
100.0 & \text{if } s > \text{ceiling\_raw}
\end{cases}$$

### 5.3 Mathematical Guarantees
1. **Monotonicity:** $\forall s_1 \le s_2 \implies P(s_1) \le P(s_2)$. Higher raw cosine similarity never yields a lower calibrated score.
2. **Anchor Invariance:** $P(\text{anchor\_raw} = 0.45) \equiv 75.0\%$, aligning precisely with the default institutional verification policy threshold.
3. **Clamping & Continuity:** Values below $0.20$ clamp cleanly to $0.0\%$, and values above $0.70$ clamp cleanly to $100.0\%$, with strict continuity across segments.

> [!IMPORTANT]
> **Score $\neq$ Probability:** The calibrated percentage $P(s)$ is a normalized heuristic display metric. It is **not** a posterior probability that the two photographs represent the same identity. It must never be communicated to students or proctors as an empirical certainty.

---

## 6. Continuous Verification Settings & Snapshot Immunity

### 6.1 Baseline Default Settings
The default verification settings profile (`version 1`) is seeded as:
- **Threshold (`thresholdPct`):** `75.0%` calibrated similarity (equivalent to raw cosine similarity $\ge 0.450$).
- **Interval (`intervalMs`):** `1500 ms` (1.5 seconds between verification attempts).
- **Consecutive Mismatch Limit:** `3` frames before trigger escalation.
- **Missing Face Limit:** `3` frames.
- **Multiple Faces Policy:** `ALERT_IMMEDIATELY` (limit: 2).
- **Camera Failure Policy:** `ALERT_IMMEDIATELY` (grace: 10s).
- **Pre-Exam Required Matches:** `2` consecutive matches.
- **Startup Grace Period:** `15` seconds upon exam launch.

### 6.2 Snapshot Immunity
When a candidate launches an examination session, an immutable JSON snapshot of the currently active verification settings profile is captured and committed to `exam_sessions.settings_snapshot`. Any subsequent administrative modification to the global settings creates a new version number and leaves all running exam sessions unaffected.

### 6.3 Student Score Concealment
In compliance with privacy and security principles, all endpoints serving candidates (`POST /student/sessions/:id/verifications` and `POST /student/sessions/:id/pre-verification`) strictly conceal raw cosine similarity scores, calibrated similarity percentages, internal detection boxes, and tolerance limit counters. Candidates receive only standardized, empathetic status codes and guidance messages.

### 6.4 Presentation Attack Detection (PAD) Disclosure
The current InsightFace Buffalo_L open-source model does not provide hardware-backed depth or active liveness challenge verification. System administrators and proctors are explicitly alerted via the admin dashboard banner that printed photograph presentations or screen replays may produce high similarity scores without triggering biometric mismatches.

---

## 7. Empirical FAR / FRR Evaluation & Calibration Toolchain

Phase 09 delivered complete evaluation tooling in `services/vision/tools/`:
- `evaluate.py`: Generates genuine vs impostor distributions, computes FAR, FRR, EER, and evaluates centroid vs top-$k$ multi-sample scoring.
- `calibrate.py`: Derives empirical anchors and updates `calibration.json` with `status: "CALIBRATED"` once minimum subject criteria ($\ge 10$ subjects, $\ge 50$ genuine, $\ge 100$ impostor) are met. Refuses calibration on sub-threshold datasets.
- `simulate_sequences.py`: Monte-Carlo sequence simulation demonstrating the necessity of the consecutive mismatch limit rule.

### Current Empirical Status
> **Empirical FAR / FRR on target cohort:** **Not evaluated — dataset required**  
> Because ExamGuard adheres to strict data minimization and does not bundle private human face datasets, empirical error rates must be measured by the deploying institution using owner-consented photographs.

### Monte-Carlo Consecutive Mismatch Analysis
Simulation over 10,000 synthetic 1-hour sessions (360 frames, interval = 10s, per-frame FRR = 2%, per-frame FAR = 1%):

| Consecutive Mismatch Limit ($k$) | False Incident Probability (Genuine Candidate) | Mean Impostor Detection Time |
|---|---|---|
| **$k = 1$ (Single Frame)** | **$> 99.9\%$** (Unusable in practice) | ~10 seconds (1 frame) |
| **$k = 2$** | ~14.2% | ~20 seconds (2 frames) |
| **$k = 3$ (Default Policy)** | **$< 0.3\%$** (Optimal operating point) | ~30 seconds (3 frames) |
| **$k = 4$** | $< 0.01\%$ | ~40 seconds (4 frames) |
| **$k = 5$** | $\approx 0.00\%$ | ~50 seconds (5 frames) |

*Caveat:* Real video frames exhibit temporal correlation (pose/lighting persist over consecutive seconds). Uncorrelated Bernoulli trials provide a theoretical lower bound on false incident frequency.
