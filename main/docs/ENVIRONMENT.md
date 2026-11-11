# ExamGuard Environment & Dependency Record

This document records the exact operating environment, validated tool versions, and Windows 10/11 platform notes established during **Prompt 01 (Foundation)** and **Prompt 02 (Database & Auth)**.

## 1. Host System Environment
- **Operating System:** Windows 10/11 x64 (PowerShell 5.1 / PowerShell 7)
- **Node.js:** `v22.23.2` (LTS)
- **npm:** `10.9.8`
- **Git:** `2.54.0.windows.1`
- **Python:** `3.11.9 (64-bit)`
- **MySQL Target:** MySQL 8.0.45 Server (`C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe`)
  - Running on port `3306` with local datadir `d:\My_Projects\Exam_Guard\mysql-data` (git-ignored)
  - Databases: `examguard` (development) and `examguard_test` (automated testing)
  - Dedicated user: `examguard`@`localhost` with permissions on both databases

## 2. Password & Native Hashing Subsystem
- **Argon2 Native Addon:** `argon2` npm package v0.45.2 installed cleanly on Node.js v22 on Windows x64.
- **Crypto Native Node:** Built-in `node:crypto` provides AES-256-GCM cipher and SHA-256 digests.
- **Cookie Parser:** `cookie-parser` v1.4.7 parses session and CSRF cookies for Express.
- **Image Processing & Uploads:** `sharp` v0.34.x (native libvips Windows x64 prebuilt) and `multer` v1.4.5 for streaming memory uploads and image re-encoding.

## 3. Python Computer Vision Subsystem (`services/vision/.venv`)
All computer vision dependencies installed natively on Windows without compilation issues or wheel mismatch:

| Package | Exact Version | Role | Notes |
|---|---|---|---|
| `fastapi` | `0.162.2` | REST Framework | Asynchronous microservice runtime |
| `uvicorn` | `0.41.0` | ASGI Server | Bound to `127.0.0.1:8000` |
| `python-multipart` | `0.0.33` | Form / Multipart | Required by FastAPI for multipart upload streaming |
| `pydantic` | `2.12.5` | Data Validation | Strict schema enforcement |
| `pydantic-settings` | `2.13.1` | Config Management | Environment parsing from `.env` |
| `numpy` | `1.26.4` | Numerical Arrays | Pinned `< 2.0.0` for ONNX and InsightFace compatibility |
| `opencv-python-headless` | `4.11.0.86` | Image Processing | Headless CV without GUI library overhead |
| `onnxruntime` | `1.31.1` | Model Runtime | CPUExecutionProvider |
| `insightface` | `2.1` | Face Analysis | ArcFace recognition head & SCRFD detection |
| `mediapipe` | `1.2.2` | Face Mesh & Pose | Head pose estimation and landmark checks |
| `httpx` | `0.28.1` | HTTP Client | TestClient driver for FastAPI |
| `pytest` | `9.2.0` | Test Runner | Automated Python test suite |

### Model Pack Status
- **Pack Name:** `buffalo_l` (v1.0)
- **Model State Observed:** `READY`
- **Execution Providers:** `["CPUExecutionProvider"]`
- **Calibration Status:** `PROVISIONAL` (to be calibrated on owner evaluation data in Prompt 09)

## 4. Node.js & TypeScript Subsystems
- **TypeScript:** `5.8.2`
- **Prisma Client & CLI:** `6.19.3` / `6.4.1`
- **Express:** `4.21.2`
- **Next.js:** `15.5.29` (App Router)
- **React & React-DOM:** `19.0.0`
- **Tailwind CSS:** `3.4.17`
- **Vitest:** `3.2.7`
- **Pino:** `9.6.0`

## 5. Windows Specific Notes & Resolutions
1. **PowerShell Variable String Parsing:**
   In PowerShell double-quoted strings, variable references immediately followed by colons (such as `"$var:"`) are parsed as drive letters. In scripts (`doctor.ps1`, `setup.ps1`), variables are written as `"$($var):"`.
2. **Localhost Security Context:**
   Modern Chromium browsers treat `http://localhost:3000` as a secure origin (`isSecureContext === true`), allowing webcam capture via `navigator.mediaDevices.getUserMedia` without needing local self-signed SSL certificates during development.
3. **Storage Directory Invariant:**
   `apps/api/src/server.ts` guarantees that `STORAGE_ROOT` (`storage/enrollment`, `storage/evidence`, `storage/tmp`) is created on startup and `storage/tmp` is automatically cleaned on every process launch.
4. **MySQL Windows Service Execution:**
   When running without administrative service rights, MySQL 8.0.45 can be run directly using `mysqld.exe --datadir="<project-root>/mysql-data" --port=3306 --console`. The datadir is excluded from git tracking in `.gitignore`.

## 6. Vision Service Hardening & Environment Variables (Prompt 06)
- **`VISION_MAX_CONCURRENCY`:** Bounded to `2` concurrent ONNX inference executions in Python via `asyncio.Semaphore`. Excess requests wait in queue; timeouts beyond `VISION_QUEUE_TIMEOUT_MS` (500ms) return HTTP 503 `BUSY` with `Retry-After: 1`.
- **`VISION_MAX_UPLOAD_BYTES`:** Hard cap at `10485760` (10 MB).
- **`VISION_MAX_IMAGE_EDGE`:** Hard limit of `4096` pixels per dimension to prevent out-of-memory raster allocation.
- **`VISION_MAX_IMAGE_PIXELS`:** Decompression bomb ceiling of `16777216` pixels (16 MP).
- **`VISION_ORT_THREADS`:** `onnxruntime` intra-op thread count tuned to `2` to prevent CPU oversubscription under concurrent verification ticks.
- **Threadpool Offloading:** `cv2.imdecode` and ONNX inference are offloaded from the asyncio event loop using `asyncio.to_thread` to maintain responsive health checks.
