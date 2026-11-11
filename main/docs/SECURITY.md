# ExamGuard Security Policy & Key Management

This document defines the baseline security architecture established in Prompt 01 and expanded in subsequent prompts.

## 1. Secrets and Environment Isolation
- Real secrets, encryption keys, and database passwords are **never** committed to version control.
- `.env` is ignored by `.gitignore`.
- `.env.example` contains documented configuration with placeholder `REPLACE_ME` flags.
- `scripts/setup.ps1` automatically generates high-entropy random keys on initial setup using `scripts/gen-secrets.mjs` (powered by Node.js `crypto.randomBytes`).
- Startup environment validation in `apps/api/src/config/env.ts` fails fast if any encryption key is missing, equals `REPLACE_ME`, or does not decode to exactly 32 bytes (256 bits).

## 2. Password Management & Argon2id Parameters
- All passwords are encrypted using **Argon2id** (OWASP recommended standard for credential storage).
- **Argon2id Parameters:**
  - Type: Argon2id (variant 2)
  - Memory Cost: `65536` KiB (64 MiB)
  - Time Cost: `3` iterations
  - Parallelism: `4` threads
- **Password Strength Policy:**
  - Minimum length: 12 characters
  - Refusal of common passwords and test patterns (e.g., `password123`, `admin123`, `examguard`, `changeme`)
  - Server-side validation via `validatePasswordStrength()` before hashing.
- **Timing Attack Mitigation:**
  - When login is attempted with an unknown email address, a precomputed dummy Argon2 verification is executed (`dummyVerify()`) to ensure consistent response latency regardless of account existence.

## 3. Account Lockout & Brute-Force Defense
- Maximum failed login attempts: `5`.
- Lockout duration: `15 minutes` (`locked_until` timestamp in `eg_user`).
- Failed attempts are tracked in `failed_login_attempts`. Successful authentication clears the counter to `0` and resets `locked_until`.
- When an account is locked, responses return `ACCOUNT_LOCKED` (423) with the remaining lockout duration in seconds, without exposing whether credentials were valid.
- Strict IP rate limiting is applied via Express middleware: 5 attempts per 15-minute window for auth routes.

## 4. Session Architecture & 256-Bit Opaque Tokens
- Authentication tokens are **256-bit cryptographically secure random values** (`crypto.randomBytes(32)`).
- **Hashed in Database:** The raw session token is **never stored plaintext** in the database; only its `SHA-256` hash is persisted in `eg_session.token_hash`.
- **Cookie Security:**
  - Cookie name: `eg_session`
  - Flags: `HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` (in production/HTTPS).
- **Session Expiration & Renewal:**
  - Idle timeout: `SESSION_IDLE_MINUTES` (default 60 minutes).
  - Absolute timeout: `SESSION_ABSOLUTE_HOURS` (default 8 hours).
  - Sliding renewal on activity while respecting the hard absolute ceiling.
- **Revocation:** Logout revokes the session immediately by setting `is_revoked = true` and `revoked_at = NOW()`, clearing the cookie on the client.

## 5. CSRF Protection (Double-Submit Pattern)
- Every state-changing HTTP request (`POST`, `PUT`, `PATCH`, `DELETE`) is protected against Cross-Site Request Forgery.
- **Origin / Referer Validation:** Requests must present an `Origin` or `Referer` matching `WEB_ORIGIN`.
- **Double-Submit Token:**
  - Cookie: `eg_csrf` (256-bit random token).
  - Header: `X-CSRF-Token`.
  - Server verifies that the `X-CSRF-Token` header matches the signed/hashed `eg_csrf` cookie before processing the request.

## 6. Audit Logging & Sensitive Data Scrubbing
- All administrative and security-critical actions are recorded in `eg_admin_audit_log` (model `AdminAuditLog`).
- Automatic recursive scrubbing of sensitive fields (`password`, `currentPassword`, `newPassword`, `token`, `secret`, `key`, `apiKey`) before storing JSON payloads.
- IP addresses are scrubbed and anonymized using a salted SHA-256 hash to protect student and proctor privacy while enabling forensic correlation.

## 7. Biometric Data Protection (AES-256-GCM)
- Face embeddings stored in MySQL are encrypted using `EMBEDDING_ENCRYPTION_KEY` (AES-256-GCM).
- Captured enrollment images and incident evidence in `storage/` are encrypted at rest using `IMAGE_ENCRYPTION_KEY` (AES-256-GCM).

## 8. Protected Biometric Image Streaming & Delivery (Phase 04)
- **Zero Public Access:** Stored encrypted images are completely private; no public or signed-forever URLs exist.
- **Strict Role Gating:** Endpoints (`/api/v1/admin/images/enrollment/:imageId`) require valid admin credentials (`requireAuth` + `requireRole('ADMIN')`); student sessions receive 403 Forbidden.
- **Integrity Validation & Tamper Protection:**
  - Decryption authenticates AES-256-GCM authentication tag.
  - Plaintext SHA-256 checksum is calculated and constant-time compared against the database hash.
  - On tamper or mismatch: zero image bytes are served, returns `409 IMAGE_INTEGRITY_FAILED`, and logs `ENROLLMENT_IMAGE_INTEGRITY_FAILURE` to audit trail.
- **Audit-Before-Serve (Fail-Closed):**
  - Every image view is strictly recorded in `admin_audit_logs` (`action = ENROLLMENT_IMAGE_ACCESSED`) with actor, image ID, and student ID.
  - If the audit write fails, image streaming is refused (`500 INTERNAL_ERROR`).
- **Cache Prevention Headers:**
  - `Cache-Control: no-store, private`
  - `Pragma: no-cache`
  - `X-Content-Type-Options: nosniff`
  - `Content-Disposition: inline`
- **Scraping Defense:**
  - Admin image streaming endpoints are rate-limited per admin session (120 req/min) to blunt bulk automated harvesting.
- Every encrypted record uses a unique random 12-byte initialization vector (IV) and stores a 16-byte authentication tag.
- Key versions (`ENCRYPTION_KEY_VERSION`) are tagged on each record to support seamless future key rotation.

## 8. Log Redaction & Privacy
- Application logging uses `pino` with strict redaction paths:
  - `password`, `token`, `cookie`, `authorization`
  - `embedding`, `frame`, `image`, `*.password`
  - `req.headers.cookie`, `req.headers.authorization`
- All log events are correlated with a unique `requestId` (`X-Request-Id`).
- Stack traces are logged server-side only and are **never** returned in client API error envelopes.

## 9. Network and Service Hardening
- Python Vision service binds strictly to `127.0.0.1` (localhost) and requires `X-Internal-Key` with constant-time comparison (`secrets.compare_digest`).
- Node API applies `helmet` security headers, strict CORS origin filtering (`WEB_ORIGIN`), JSON body size limits, and timeout protection.
- Private files in `storage/` are not statically served; all image access requires authentication, role authorization, and audit logging.

## 10. Examination Session & Verification Security

### 10.1 Reference Biometric Vector Transport & Isolation
- Centroid reference embeddings are stored encrypted using AES-256-GCM in MySQL (`eg_face_embeddings`).
- The Node API `ReferenceService` decrypts the 512-dimension vector **strictly in memory** and caches it with a 15-minute TTL and LRU eviction (max 1,000 entries).
- Decrypted embeddings are never written to disk, never included in logs, and never exposed over public HTTP.
- Transmitted solely over internal localhost loopback to `/v1/verify` authenticated with `X-Internal-Key`.
- Caches are immediately invalidated on re-enrollment approval or candidate deletion.

### 10.2 Pre-Exam Verification Gate Guarantees
- Before commencing an exam, students must pass pre-exam face verification (`POST /student/sessions/:id/pre-verification`).
- Pre-exam attempts are recorded in `eg_verification_logs` with `phase = PRE_EXAM` for complete auditability.
- **Zero Image Storage:** Unlike proctoring incidents during the exam, pre-exam verification stores **no image files** to disk.
- **No Incident Creation:** Pre-exam verification does not open security incidents; it acts solely as an entry gate requiring $N$ consecutive matches before starting the examination.

### 10.3 Candidate Information Concealment
- To prevent reverse-engineering of biometric thresholds and proctoring algorithms:
  - Student session endpoints never expose `matchThreshold`, `consecutiveFailuresBeforeWarning`, or severity rule configurations.
  - Student question endpoints never include `isCorrect` on answer options.
  - Verification responses to candidates contain only plain-language guidance (e.g., "Face verified. You may begin.", "Face does not match registered profile. Please look directly at the camera.") without numerical scores or system parameters.

## 11. Continuous Face Recognition Engine Hardening (Phase 06)

### 11.1 In-Process Session Mutex (`sessionLock.ts`)
To prevent race conditions, out-of-order sequence counter updates, and verification cycle overlaps, the Node API enforces an in-process, non-blocking per-session lock for both continuous cycles and pre-exam requests:
- If a verification cycle is in flight for a given session ID, subsequent requests for that session are immediately rejected with HTTP 409 `VERIFICATION_IN_PROGRESS`.
- The lock is released in a strict `finally` block upon cycle completion or abort.

### 11.2 Settings Snapshot Immunity
When a session is created, the Node API captures an immutable snapshot of the active verification settings:
- Running sessions evaluate similarity thresholds, consecutive mismatch limits, and grace periods strictly against their own committed snapshot.
- Global settings updates or exam overrides deployed after session initialization cannot alter active session verification rules or retroactively change incident outcomes.

### 11.3 Memory-Only Verification Processing
Frames sent for continuous verification exist strictly in volatile memory (Buffer / RAM) during processing:
- No verification frames are written to disk during normal continuous verification cycles.
- Evidence frames are captured and encrypted only when a formal proctoring security incident is triggered (Phase 07).

### 11.4 Client Camera Telemetry Throttling
Candidate webcam disconnection events sent via `POST /student/sessions/:id/client-events` are strictly validated and throttled:
- Duplicate camera error events arriving within 1,000 ms are dropped with a cached acknowledgment.
- Recorded camera errors update session counters and trigger grace periods according to the session's immutable snapshot policy.

### 11.5 Python Vision Request Guards & Concurrency Caps
The local Python vision service enforces defense-in-depth bounds on all incoming image payloads:
- **Concurrency Cap:** Bounded to 2 concurrent inferences with a 500 ms queue timeout (raising 503 `BUSY` with `Retry-After: 1`).
- **Decompression Bomb Protection:** Images exceeding 10 MB or 16 megapixels ($4096 \times 4096$) are rejected immediately before raster decoding.
- **Threadpool Offloading:** OpenCV decoding and ONNX runtime inference execute in dedicated worker threads (`asyncio.to_thread`), preventing event loop blockage.

## 12. Security Trigger Engine & Evidence Capture Guarantees (Phase 07)

### 12.1 Single Evidence Capture Guarantee (INSTRUCTIONS §10.2, §10.3)
- **Zero Routine Image Persistence:** Standard verification attempts (both successful and inconclusive) are **never written to disk**. Image bytes are discarded from memory immediately after inference and outcome determination.
- **Strictly One Evidence File per Incident:** When and only when a security trigger condition opens a **new** incident (`occurrenceCount = 1`), the specific frame buffer that tipped the counter is encrypted and saved to private storage (`storage/evidence/`).
- **Deduplication Invariant:** Continued failures of the same trigger type while an incident is active increment `occurrenceCount`, update `lastDetectedAt`, and track `worstSimilarityPct` without writing any duplicate evidence files or rows (`UNIQUE(trigger_id)` on `trigger_evidence`).

### 12.2 Evidence Encryption & Integrity (AES-256-GCM + SHA-256)
- Evidence frames are re-encoded via `sharp` (stripping all EXIF and camera metadata, capping dimensions to 1920px), hashed with SHA-256, and encrypted at rest with AES-256-GCM using `IMAGE_ENCRYPTION_KEY`.
- 12-byte cryptographic IV and 16-byte GCM authentication tag are stored in `trigger_evidence`.
- Encrypted files reside outside any web-accessible directory with random UUID paths.
- Student portals and API responses **never expose evidence paths, hashes, or decrypted bytes**.

### 12.3 Atomic Evidence Persistence Protocol
To prevent orphan files on disk:
1. Pure engine evaluates that an incident must open.
2. Evidence file is written and encrypted to disk **before** the Prisma transaction commits.
3. Single interactive transaction commits: verification log + incident + trigger evidence row + session counters.
4. **On Transaction Rollback:** The written evidence file is immediately unlinked by `evidenceWriter.rollbackEvidence`.
5. **On Write Failure:** If storage fails, the incident is still opened with `evidenceStatus = FAILED` and `evidenceFailureReason`, and `EVIDENCE_CAPTURE_FAILED` is recorded in `admin_audit_logs`.
6. **Concurrent Duplicate Insert (P2002):** If two concurrent attempts race, the unique constraint on `active_dedupe_key` catches the race; the duplicate file is unlinked, and the transaction safely updates the existing incident.

### 12.4 Database-Enforced Deduplication & Recovery
- `security_triggers.active_dedupe_key` holds `"{sessionId}:{triggerType}"` while an incident is active, enforced as `UNIQUE` by MySQL.
- When candidate achieves `recoveryMatchCount` consecutive matches, `recoveredAt` is stamped and `active_dedupe_key` is set to `NULL`.
- MySQL allows multiple `NULL` entries for unique indexes, enabling complete historical auditing while strictly preventing concurrent active duplicate incidents.
- A subsequent failure creates a brand new incident with a fresh `incidentCode` and captures a new independent evidence image.

### 12.5 Candidate Neutrality & Privacy
- Student dashboard warnings use strictly neutral phrasing (e.g. "Identity could not be confirmed", "Face not detected for a period") and carry the disclaimer: *"An administrator may review this; it is not a final decision."*
- Student dashboards expose only the candidate's own warnings and summary counts; no biometric similarity scores, thresholds, or evidence links are ever returned.

## 13. Live Admin Monitoring & Incident Investigation Security (Phase 08)

### 13.1 WebSocket Handshake & Transport Security
- **Authentication & RBAC:** WebSocket upgrade requests on `/ws` enforce cookie authentication (`eg_session`) and strictly verify that the user possesses the `ADMIN` role. Unauthenticated requests are rejected with 401; student sessions are rejected with 403.
- **Strict Origin Validation:** The upgrade handshake verifies the HTTP `Origin` header against `env.WEB_ORIGIN`. Mismatched origins are immediately rejected with 403, mitigating Cross-Site WebSocket Hijacking (CSWSH).
- **Biometric Concealment & Zero Data Leakage:** All broadcast messages (`incident.opened`, `incident.updated`, `session.updated`, etc.) contain only event IDs, timestamps, and aggregate counters. Outgoing payloads **never contain raw 512-d embeddings, binary buffers, or base64 image data**. Verified by recursive automated schema scanners.
- **Client Rate Coalescing:** `SessionEventCoalescer` caps high-frequency `session.updated` events to $\le 1$ update per second per session per connected socket, preventing client starvation and browser UI freezing during concurrent examinations.

### 13.2 Protected Evidence Streaming & Fail-Closed Tamper Detection
- **Zero Static File Serving:** Stored evidence images in `storage/evidence/` are never served statically. Access is mediated exclusively through `GET /api/v1/admin/images/evidence/:triggerId`.
- **Fail-Closed Audit Protocol:** Before decrypted image bytes are streamed to an administrator, the server transactionally writes `EVIDENCE_ACCESSED` to `admin_audit_logs` and `EVIDENCE_VIEWED` to `admin_investigation_logs`. If the audit database write fails, image delivery is refused with 500.
- **Cryptographic Tamper Detection:** Before streaming, the image is decrypted with AES-256-GCM and its SHA-256 digest is recomputed and compared against `trigger_evidence.sha256`. If tampering or bit-rot is detected:
  1. Image streaming is refused with HTTP 409 `EVIDENCE_INTEGRITY_FAILED`.
  2. `EVIDENCE_INTEGRITY_FAILURE` is written to `admin_audit_logs`.
  3. `EVIDENCE_INTEGRITY_FAILED` is logged to `admin_investigation_logs`.
  4. `system.warning` is emitted on the WebSocket event bus to alert all online proctors.
- **Delivery Headers:** Strict delivery headers prevent client caching: `Cache-Control: no-store, private`, `Pragma: no-cache`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`.

### 13.3 CSV Formula Injection Defense
- Exported incident reports (`format=csv`) sanitize every cell using `sanitizeCsvCell()`. Any value beginning with dangerous formula execution trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`) is prefixed with a single quote `'` before standard RFC-4180 quote escaping, neutralizing spreadsheet macro/DDE injection attacks.

### 13.4 Candidate Neutrality & Due Process (INSTRUCTIONS §20)
- All incident listings, reports, and UI dashboards adhere strictly to neutral wording: "possible mismatch detected", "requires review", "concern confirmed after review". Accusatory language ("cheater", "fraud") is prohibited.
- Standing disclaimer is embedded in all reports and workbench views: *"Automated trigger flags represent biometric variance or signal conditions requiring human supervisor review. They do not constitute conclusive proof of misconduct on their own."*


