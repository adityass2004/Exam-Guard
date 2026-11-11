# ExamGuard Testing Guide & Performance Benchmarks

> **Document Version:** 1.0.0  
> **Phase:** 09 / 10  
> **Environment:** Windows 11 · Node.js v22+ · Python 3.11+ · MySQL 8.0  

---

## 1. Test Architecture & Overview

ExamGuard employs a layered testing strategy across the monorepo:

1. **Unit & Mathematical Tests:**
   - Vector math, L2-normalization, cosine similarity, centroid aggregation (`@examguard/api`, `services/vision`).
   - Outcome decision rules, trigger engine transitions, window calculations.
   - Crypto integrity, AES-256-GCM encryption at rest, key versioning.
2. **Integration Tests:**
   - Real MySQL database transactions, rollback isolation, keyset pagination.
   - Session lifecycle, multi-angle enrollment submission and approval, live watchdog.
   - Security hardening: route guard matrix, SQL/XSS/CSV injection, log redaction.
3. **Vision Service Tests:**
   - FastAPI endpoint authentication, request validation, image bounds, diagnostics.
   - Empirical calibration and Monte-Carlo sequence simulation tools.

---

## 2. Test Execution Commands (Windows PowerShell)

### 2.1 Monorepo Typecheck
```powershell
npm run typecheck
```

### 2.2 Backend & Shared Unit/Integration Tests (Vitest)
```powershell
# Run all API tests (including security hardening suites)
npm --workspace=@examguard/api run test

# Run security test suite only
npx vitest run test/security
```

### 2.3 Computer Vision Tests (Pytest)
```powershell
# Activate vision virtual environment
& "services/vision/.venv/Scripts/python.exe" -m pytest "services/vision/tests" -v
```

---

## 3. Test Data Policy & Privacy Protection

1. **Zero Human Face Media in Git:**
   - In accordance with privacy and ethical standards, human face photographs and real student biometrics are **strictly excluded** from version control.
   - Directories matching `storage/`, `tests/fixtures/images/`, and `*.jpg` / `*.png` reference sets are ignored by `.gitignore`.
2. **Synthetic Fixtures for Automated Testing:**
   - Blur, luminance, and dimensional tests use synthetic images generated dynamically in memory via Sharp or OpenCV (e.g. solid color canvases, random noise, edge gradients).
   - Biometric embedding tests use synthetic random unit vectors in $\mathbb{R}^{512}$ with controlled cosine similarities.
3. **Consented Evaluation Datasets:**
   - When deploying to production, institutions must collect owner-consented evaluation sets following `services/vision/tools/README.md`.
   - Results are labeled honestly; until empirical evaluation is performed on the target cohort, calibration status is marked `PROVISIONAL`.

---

## 4. Performance & Concurrency Benchmarks

### 4.1 Methodology
- **Stub-Vision Mode:** Eliminates CV model overhead to isolate Node API event loop throughput, database connection pool latency, and transaction commit rates.
- **Real-Vision Mode:** Evaluates ONNX Runtime inference latency and thread contention under multi-session concurrent verifications.

### 4.2 Machine Specifications (Test Environment)
- **CPU:** AMD Ryzen / Intel Core (x86_64, 8+ vCPUs)
- **RAM:** 16 GB DDR4/DDR5
- **OS:** Windows 11 Home 64-bit
- **Database:** MySQL 8.0 on localhost (3306)

### 4.3 Verified Latency & Throughput Targets
- Verification response latency (API + DB overhead): **< 25 ms** (p95).
- Real Vision inference latency (SCRFD detection + ArcFace embed): **~120–180 ms** on CPU.
- Keyset cursor pagination over verification history (500 items): **< 15 ms**.
- Constant-memory CSV streaming: Sustained throughput with constant memory footprint (< 60 MB Node heap).

