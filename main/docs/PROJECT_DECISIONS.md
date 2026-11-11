# ExamGuard — Project Decisions and Feasibility Review

This document records every cross-cutting technical decision made while planning ExamGuard, including the resolution of gaps found during the feasibility review (Section 16 of the master blueprint). It is **canonical**: `INSTRUCTIONS.md`, `DATA_DICTIONARY.md`, `API_CONTRACT.md` and all ten prompts are written to agree with it.

Any later change to a decision marked **[FOUNDATIONAL]** requires a written ADR in `docs/adr/` (context, decision, consequences, migration steps) *before* code changes. See INSTRUCTIONS.md §17.

Legend: **[FOUNDATIONAL]** = changing it affects several phases. **[ASSUMPTION]** = could not be validated while planning; implementers must validate it and record the outcome in their completion report.

---

## 1. Resolved gaps (feasibility review)

| # | Gap | Decision | First built in |
|---|-----|----------|----------------|
| 1 | Webcam capture and frame transport | Browser captures a frame from a `<video>` element onto a canvas, downscales it to at most 640 px on the long edge, encodes via asynchronous `canvas.toBlob('image/jpeg', 0.8)`, and uploads it as `multipart/form-data` (field `frame`) over HTTPS/HTTP REST to the Node API. No base64-in-JSON, no browser-side WebSocket frame streaming. Typical frame ≈ 30–80 KB. **[FOUNDATIONAL]** | P03 (enrollment), P06 (continuous) |
| 2 | Browser permission handling | A shared `useWebcam` hook handles `NotAllowedError`, `NotFoundError`, `NotReadableError`, `OverconstrainedError`, track `ended`/`mute` events and `devicechange`. Each maps to a typed `CameraProblem`. During an exam these are reported to the API as `CAMERA_ERROR` client events. `getUserMedia` requires a secure context; `http://localhost` qualifies. | P03 |
| 3 | Main-thread blocking | All computer vision runs server-side in Python. The browser only draws a frame and encodes it asynchronously. The scheduler is a **self-rescheduling `setTimeout` chain** (the next tick is scheduled only after the previous request settles), so overlapping requests are impossible by construction. Each request has an `AbortController` timeout. | P06 |
| 4 | Model installation compatibility on Windows | InsightFace (`buffalo_l` model pack: SCRFD detector + ArcFace-class recognizer) via `onnxruntime` CPU. `insightface` may need Microsoft C++ Build Tools on Windows if no wheel matches the Python version. **[ASSUMPTION]** Python 3.10 or 3.11 gives the broadest wheel coverage for `insightface`, `onnxruntime`, `opencv-python` and `mediapipe`; the implementer must verify on the real machine and record the working versions. If `insightface` cannot be installed, the service must start in an explicit `DEGRADED`/`MODEL_UNAVAILABLE` state and every recognition endpoint must return a clear `503 MODEL_UNAVAILABLE` — never a fake result. |  P01, P06 |
| 5 | Offline / model download | InsightFace downloads model packs on first use. **No download URLs are hardcoded or invented in this package.** The service reads `VISION_MODEL_DIR` (default `services/vision/models/`). A documented manual-placement fallback is required: obtain the `buffalo_l` pack on a connected machine using the library's own documented mechanism, copy the folder into `VISION_MODEL_DIR`, and set `VISION_ALLOW_MODEL_DOWNLOAD=false`. `scripts/doctor.ps1` and `GET /v1/diagnostics` report model presence, checksum (if known) and provider. | P01, P06 |
| 6 | Face embedding generation | InsightFace recognition head → 512-dimension float32 vector, L2-normalised. Embedding is generated from the aligned crop produced by the detector's 5-point landmarks (not from a raw crop). Stored per-sample and as a centroid. | P03, P06 |
| 7 | Threshold calibration **[FOUNDATIONAL]** | Raw ArcFace cosine similarity is **not** a probability and typical genuine-pair values are far below 0.75. Therefore the administrator-facing **match score (%)** is a *calibrated* value: `score_pct = piecewise_linear(raw_cosine; floor, anchor, ceiling)` where `anchor` is the raw cosine that maps to exactly **75 %** (the default threshold), `floor` maps to 0 %, `ceiling` to 100 %. The three anchors live in `services/vision/calibration.json`. Both `similarity_raw` and `similarity_pct` are stored in every log row. Until `scripts/calibrate` (P09) has been run on real, consented evaluation data, the service must report `calibration_status: "PROVISIONAL"` in diagnostics and the admin settings page must display a visible "uncalibrated" warning. **No numeric anchor values are invented in this package**; P06 must ship clearly labelled provisional defaults chosen from the library's published guidance and mark them unverified. |  P06, P09 |
| 8 | Who applies the threshold | Python computes similarity only. **Node applies the threshold and all business rules** (it owns the settings snapshot). Python never sees the threshold and never judges identity. | P06 |
| 9 | Reference representation | Per enrolled sample embedding + one L2-normalised mean ("centroid"). Score strategy constant `CENTROID`: score = similarity(frame, centroid). Per-sample similarities are returned by Python for diagnostics only. P09 evaluates whether a top-k strategy improves FAR/FRR; changing the strategy needs an ADR. | P03, P06, P09 |
| 10 | Python statelessness | Python is **stateless and DB-free**. Node decrypts the reference embedding in memory and sends it with each verify request (base64 float32, 2 KB). Python holds only the model, never student data. Node → Python is the only direction of calls; Python never calls Node and never connects to MySQL. Internal calls carry `X-Internal-Key` (shared secret from env) and the service binds to `127.0.0.1` by default. **[FOUNDATIONAL]** | P01, P06 |
| 11 | Concurrent verification requests | (a) Browser: no overlap by construction (decision 3). (b) Node: a per-session in-process lock; a second verify for the same session while one is running returns `409 VERIFICATION_IN_PROGRESS` and writes **no** log row. (c) DB: `UNIQUE(session_id, sequence_no)` where `sequence_no` is allocated transactionally from `exam_sessions.next_sequence_no`. (d) Python: bounded semaphore `VISION_MAX_CONCURRENCY` (default 2); saturation returns `503 BUSY` with `Retry-After`, which Node records as `VERIFICATION_ERROR` / `SERVICE_BUSY`. |  P06, P07 |
| 12 | Database write throughput | One INSERT into `verification_logs` plus one counters UPDATE on `exam_sessions` per cycle, in a single short transaction. At the default 1.5 s interval that is ≈ 0.67 cycles/s/session, so 100 concurrent sessions ≈ 67 cycles/s — within comfortable single-node MySQL capacity. **[ASSUMPTION]** Validate with the P09 load test and record numbers. Log table has covering indexes (see Data Dictionary) and no image blobs. Retention purge removes old rows in batches. |  P07, P09 |
| 13 | Image storage | Local private directory `STORAGE_ROOT` (default `./storage`, git-ignored, outside any web-served path). Random UUID filenames, sharded by first two characters. Images are **re-encoded server-side** (strips EXIF, normalises format) then **encrypted at rest with AES-256-GCM** (key `IMAGE_ENCRYPTION_KEY`) and a SHA-256 of the *plaintext re-encoded* bytes is stored in MySQL. Only the DB holds the relation between file and person. Images are served **only** through authenticated, role-checked, audited API endpoints that decrypt on the fly with `Cache-Control: no-store`. **[FOUNDATIONAL]** | P03, P04, P07 |
| 14 | Biometric template protection | Embeddings are encrypted with AES-256-GCM (`EMBEDDING_ENCRYPTION_KEY`), unique random 12-byte IV per record, auth tag stored, `key_version` stored to allow rotation. Keys are separate for images and embeddings. Keys come from env only; a startup check refuses to run with a missing/placeholder/short key. |  P02, P03 |
| 15 | WebSocket reconnection | Node uses the `ws` library on path `/ws`, authenticated by the same httpOnly session cookie, `Origin` allow-list checked, admin-only for the monitoring channel. Server pings every 25 s. Client reconnects with exponential backoff + jitter (1 s → 30 s). **On every (re)connect the client first loads a REST snapshot, then applies live events**, so missed events are never required. Events carry a monotonically increasing per-process `eventId` and an `emittedAt` timestamp. |  P08 |
| 16 | Session recovery | A page reload or browser crash resumes an `IN_PROGRESS` session (answers re-loaded from `exam_answers`, timer derived from server `expires_at`, continuous verification restarts). Only one non-terminal session per student at a time (`active_student_key` unique). The server is the authority on time: answers after `expires_at` are rejected; a background job and lazy checks mark overdue sessions `EXPIRED`. Closing the tab does not stop the clock. |  P05 |
| 17 | Multiple active examinations | Supported. Many students may sit the same or different exams concurrently. Constraint is per student, not per exam. Monitoring and triggers are always keyed by `session_id`. |  P05, P08 |
| 18 | Camera disappears vs tab closed | Browser reports `CAMERA_ERROR` client events when it can. Additionally a Node **watchdog** (every 5 s) detects `IN_PROGRESS` sessions whose `last_seen_at` is older than `interval × 3 + camera_grace_seconds` and opens `CAMERA_DISCONNECTED` (no frame exists, so evidence status = `NOT_AVAILABLE`). The incident wording states "no signal received", not "camera unplugged". |  P07 |
| 19 | Low-quality frames | Outcomes are the six mandated enum values only. A frame whose face quality is below the configured minimum (blur, darkness, tiny face, low detector confidence) is recorded as `VERIFICATION_ERROR` with `error_code = LOW_QUALITY_FRAME`. It never counts toward the mismatch counter and never toward service-failure, but does count toward `REPEATED_VERIFICATION_FAILURE`. A below-threshold score on a low-quality frame is **not** a `MISMATCH`. |  P06, P07 |
| 20 | Definition of "failed" | `failed_matches` = outcome `MISMATCH` only. `unverified` = `NO_FACE + MULTIPLE_FACES + CAMERA_ERROR + VERIFICATION_ERROR`. `successful_matches` = `MATCH`. All dashboards, reports and student summaries use exactly these three definitions. |  P05+ |
| 21 | Trigger state machine **[FOUNDATIONAL]** | Per-session counters live on `exam_sessions` and are updated in the same transaction as the log insert. Rules (all thresholds from the session's settings snapshot): `IDENTITY_MISMATCH` opens when `consecutive_mismatch ≥ consecutive_mismatch_limit`; `NO_FACE` opens when `consecutive_no_face ≥ missing_face_limit`; `MULTIPLE_FACES` per `multiple_faces_policy`; `VERIFICATION_SERVICE_FAILURE` opens when `consecutive_service_error ≥ service_failure_limit`; `REPEATED_VERIFICATION_FAILURE` opens when `consecutive_non_match ≥ repeated_failure_limit`; `CAMERA_DISCONNECTED` per `camera_failure_policy`. No triggers fire during `startup_grace_seconds` after the session starts. A MATCH resets all consecutive failure counters except `consecutive_match`, which increments. |  P07 |
| 22 | Incident deduplication **[FOUNDATIONAL]** | MySQL has no partial unique indexes, so `security_triggers.active_dedupe_key` (nullable, **UNIQUE**) holds `"{session_id}:{trigger_type}"` while an incident is active and is set to `NULL` on recovery. MySQL permits multiple NULLs, so history is unlimited while at most one active incident per (session, type) is enforced **by the database**, not just by application code. Repeat failures `UPDATE` the active incident (`last_detected_at`, `occurrence_count`, worst score) and never create new evidence. |  P07 |
| 23 | Exactly-one-evidence guarantee | `trigger_evidence.trigger_id` is `UNIQUE`. The evidence file is written **only when a new incident row is created**, from the very frame that tipped the counter over the limit (it is already in Node memory for that request). Order of operations is specified in INSTRUCTIONS.md §10 to avoid orphan files (write file → transaction inserting incident + evidence + log; on transaction failure delete the file). If writing fails the incident is still created with `evidence_status = FAILED` and a reason. |  P07 |
| 24 | Recovery | An active incident recovers after `recovery_match_count` (default 3) consecutive `MATCH` outcomes. Recovery sets `recovered_at`, clears `active_dedupe_key`, and emits a WS event. A later failure creates a **new independent incident** with new evidence. Uniform for all trigger types. |  P07 |
| 25 | Evidence integrity | SHA-256 of the stored plaintext bytes in MySQL, verified on every evidence view (mismatch → serve nothing, log `EVIDENCE_INTEGRITY_FAILURE`, raise an admin-visible warning). Evidence rows are never updated after creation. Incident report exports include the hash. |  P07, P08 |
| 26 | Enrollment approval | System setting `require_enrollment_approval` (default `true`). Student finalises → `PENDING_APPROVAL`; admin approves → `APPROVED`. Exams require `APPROVED`. If the setting is `false`, finalisation auto-approves (and the audit log records `AUTO_APPROVED`). |  P03, P04 |
| 27 | Re-enrollment | Creates a new `face_profiles` row (`version + 1`). On approval of the new profile the previous approved one becomes `SUPERSEDED` (retained, viewable in "re-enrollment history" until retention purge). Sessions keep the `face_profile_id` they started with. |  P03, P04 |
| 28 | Enrollment quality & consistency | Per-capture checks: exactly one face, detector confidence, minimum face size, blur (variance of Laplacian), brightness range, face fully inside frame, pose approximately matching the requested angle (yaw/pitch from landmarks). Finalisation additionally checks **inter-sample consistency**: every sample's cosine similarity to the centroid must be at least a configurable `enrollment_consistency_min` (provisional; calibrated in P09) so one person cannot mix two faces. Numeric thresholds are configuration with provisional defaults marked unverified. |  P03 |
| 29 | Authentication / session handling | Server-side sessions: opaque 256-bit random token in an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie (`Secure` when HTTPS). Only the SHA-256 of the token is stored in `auth_sessions`. Idle timeout and absolute lifetime from env. Argon2id (`argon2` npm package) with documented bcrypt fallback **only** via ADR if the native module cannot install on Windows. |  P02 |
| 30 | CSRF **[FOUNDATIONAL]** | Browser talks to the API **same-origin through a Next.js rewrite** (`/api/*` → API) so cookies are first-party. State-changing requests require header `X-CSRF-Token` (double-submit: per-session token returned by `GET /auth/csrf`, also checked against `Origin`/`Referer`). `/ws` is the one direct connection (`ws://localhost:4000/ws`); it is cookie-authenticated and Origin-checked. |  P02 |
| 31 | Rate limiting | `express-rate-limit` in-memory (single-process prototype). Stricter on `/auth/*`; verification endpoints are limited per session (generous: ≥ 2× the max rate implied by `interval_ms`) rather than per IP. |  P02, P06 |
| 32 | Validation | `zod` schemas at every API boundary, shared types exported from `apps/api` and imported by `apps/web` via a workspace package `packages/shared` (enums, DTO types, zod schemas). |  P01 |
| 33 | Monorepo tooling | npm workspaces (`apps/web`, `apps/api`, `packages/shared`), no pnpm/yarn requirement. `concurrently` runs web, api and vision from one root command: `npm run dev`. Python lives in `services/vision` with its own `.venv`. |  P01 |
| 34 | Consent, retention, deletion | Biometric consent is recorded (`consent_records`, versioned text hash, timestamp, IP-less) and **required before the first capture**. Retention periods (enrollment images, evidence, verification logs, audit logs) are admin-configurable system settings; a retention job (manual trigger + scheduled via `node-cron`) deletes expired data in batches and writes an audit record. Students can request biometric deletion (`data_deletion_requests`); an admin fulfils it, which deletes images and embeddings (files **and** rows), revokes enrollment, and leaves an audit record without biometric content. |  P03, P04, P09 |
| 35 | No automatic termination | Triggers never terminate or auto-fail a session. Admins may manually `CANCEL` a session (audited). Student-facing and admin-facing text says "possible", "detected", "needs review"; never "cheating confirmed". |  P05, P07, P08 |
| 36 | Logging | `pino` structured logs with redaction of `password`, `token`, `cookie`, `authorization`, `embedding`, `frame`, `image`. A request ID is attached to every request/response. Never log image bytes or embeddings. |  P01 |
| 37 | Timer authority | `expires_at = started_at + duration`. Client shows a countdown from `serverNow`/`expiresAt` offsets returned by the API (clock-skew corrected). Server enforces. |  P05 |
| 38 | Pre-exam verification | Counts toward logs with `phase = PRE_EXAM`. Requires `pre_exam_required_matches` (default 2) consecutive `MATCH` results from separate frames before `POST /start` succeeds. Pre-exam failures are logged but do **not** create incidents. Rate-limited attempts. |  P05 |
| 39 | Scoring | Server-side only. The correct option is never sent to the student before submission; after submission the summary may show score if `exam.show_score_after_submit` is true. Not central to the project. |  P05 |
| 40 | Cursor pagination | Verification history and monitoring use keyset pagination on `(created_at, id)`; never `OFFSET` on `verification_logs`. |  P09 |
| 41 | Incident code | Human-readable `incident_code` (`INC-YYYYMMDD-XXXXXX`, random base32 suffix, unique) generated in application code in addition to the UUID primary key. |  P07 |
| 42 | Seed credentials | **No default password is hardcoded.** `scripts/setup.ps1` generates random secrets and seed account passwords with Node's `crypto`, writes them to the git-ignored `.env`, and prints the seeded emails and generated passwords once. `prisma/seed.ts` reads `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_STUDENT_EMAIL`, `SEED_STUDENT_PASSWORD` from env and refuses to run if a password is missing, shorter than 12 characters or equals a placeholder. `.env.example` contains only empty values or the literal `REPLACE_ME`. |  P02 |
| 43 | Ports | Web `3000`, API `4000`, Vision `8000`, MySQL `3306`. All configurable by env. |  P01 |
| 44 | Test strategy for webcam | Playwright runs Chromium with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-video-capture=<file>` so enrollment, verification and identity-switch flows are exercised end-to-end with controlled video files. Face test media must be **supplied by the project owner with consent** and kept out of git; the repo holds only a loader and documentation. Synthetic non-face images are used for NO_FACE tests. **[ASSUMPTION]** Fake-video flags behave identically on the owner's Chromium version; verify in P09. |  P09, P10 |
| 45 | Test doubles vs mocks | Test doubles (stubbed vision client, fake clock) are allowed **in automated tests only**. Production code paths must never contain a mock recognizer, simulated success, random scores or hardcoded "verified" states. See INSTRUCTIONS.md §18. |  all |

---

## 2. Technology versions

Do not pin versions in this package; versions drift. Each implementer must:

1. Use the **latest stable major** of Next.js, React, Tailwind CSS, Prisma, Express, zod, Vitest and Playwright available at implementation time, and follow the **official documentation for the version actually installed** (several of these tools had breaking configuration changes between majors).
2. Commit lockfiles (`package-lock.json`, `requirements.lock.txt` produced by `pip freeze`).
3. Record exact working versions (Node, Python, MySQL, Prisma, insightface, onnxruntime, mediapipe, OpenCV) in `docs/ENVIRONMENT.md`.

**MediaPipe note:** MediaPipe's Python API has changed between releases (legacy `solutions` vs newer Tasks API). Use whichever the installed release supports and document it. MediaPipe is used for facial landmarks (head pose, eye-region visibility and face-in-frame checks). Detection for recognition and the 5-point alignment come from InsightFace. If MediaPipe cannot be installed, head-pose estimation falls back to InsightFace's landmarks and the diagnostics endpoint reports `mediapipe: "unavailable"`; this must not silently weaken enrollment pose validation (enrollment must refuse if no pose source is available).

---

## 3. Explicit non-goals

- No proctoring beyond face identity (no screen recording, tab-switch monitoring, audio analysis).
- No liveness/anti-spoofing guarantee. A printed photo or screen replay may fool a recognizer; this limitation must be documented in README "Known limitations" and surfaced in the admin settings page. (A simple, honestly labelled quality heuristic is allowed but must not be marketed as liveness detection.)
- No cloud deployment, no multi-node scaling, no SSO.
- No claim of legal or forensic admissibility.
- No additional microservices. Exactly three runtime processes plus MySQL.

---

## 4. Phase dependency map

```
P01 foundation ──► P02 DB+auth ──► P03 enrollment ──► P04 admin+gallery
                                         │                 │
                                         ▼                 ▼
                                   P05 exams+sessions (needs approved enrollment, pre-exam verify)
                                         │
                                         ▼
                                   P06 continuous recognition engine
                                         │
                                         ▼
                                   P07 verification logging + trigger engine
                                         │
                                         ▼
                                   P08 live monitoring + investigation
                                         │
                                         ▼
                                   P09 reports, hardening, tests, FAR/FRR
                                         │
                                         ▼
                                   P10 integration, regression, delivery
```

**Ordering note (vision endpoint ownership — canonical).** P03 needs embeddings and P05 needs pre-exam verification, so the Python service is built incrementally, each prompt owning exactly these pieces:

| Prompt | Vision work |
|---|---|
| P01 | Skeleton, config, internal-key auth, model loader, `/v1/health`, `/v1/diagnostics`; other `/v1/*` routes return honest `501 NOT_IMPLEMENTED` |
| P03 | Detector, quality, pose, embedder; `/v1/quality`, `/v1/embed` |
| P05 | `/v1/verify`, calibration module (PROVISIONAL), Node `VisionClient.verify()` |
| P06 | Hardening: bounded concurrency, `BUSY` backpressure, warm-up, rolling metrics, error taxonomy |
| P09 | Evaluation and calibration tools; calibration may become `CALIBRATED` |

No prompt re-implements a piece owned by an earlier one; later prompts extend it.
