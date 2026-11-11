# ExamGuard — API Contract (planned)

Canonical endpoint catalogue. Prompts say which endpoints they implement. If an implementation must deviate, update this file **and** the OpenAPI/route docs in the repo in the same change, and note it in the completion report.

## 1. Global conventions

- Base path: `/api/v1`. The browser reaches it **same-origin** through the Next.js rewrite; the API itself listens on `API_PORT` (default 4000).
- JSON everywhere except uploads (`multipart/form-data`) and image/CSV responses.
- Success envelope: `{ "data": <payload>, "meta": { ... }? }`. Error envelope: `{ "error": { "code": "STRING_CODE", "message": "human readable", "details": <any>?, "requestId": "uuid" } }`.
- Timestamps: ISO-8601 UTC strings. BigInt ids: strings.
- Pagination: lists use `?limit=` (default 25, max 100) and either `?page=` (small tables) or `?cursor=` (verification history, monitoring feeds). Response `meta`: `{ total?, nextCursor?, page?, limit }`.
- Auth: `HttpOnly` session cookie `eg_session`. State-changing requests (`POST/PUT/PATCH/DELETE`) require `X-CSRF-Token` from `GET /auth/csrf`.
- Role guard: `/student/*` → role STUDENT; `/admin/*` → role ADMIN; `/auth/*` public (rate-limited).
- Standard error codes: `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `PAYLOAD_TOO_LARGE` 413, `UNSUPPORTED_MEDIA_TYPE` 415, `RATE_LIMITED` 429, `INTERNAL_ERROR` 500, `SERVICE_UNAVAILABLE` 503. Domain codes listed per endpoint below.
- Upload limits: image ≤ 2 MB, types `image/jpeg` or `image/png` verified by **magic bytes**, not client MIME; decoded dimensions capped (≤ 4096 px) to prevent decompression bombs.

## 2. Auth (`/auth`)

| Method & path | Purpose | Notes |
|---|---|---|
| `GET /auth/csrf` | Return CSRF token for the current (or anonymous) browser | sets/returns token |
| `POST /auth/register` | Student registration `{ studentId, fullName, email, password }` | role forced to STUDENT; password policy ≥ 12 chars, checked against a small common-password list; codes `EMAIL_TAKEN`, `STUDENT_ID_TAKEN` |
| `POST /auth/login` | Student login `{ email, password }` | rejects ADMIN accounts with generic `INVALID_CREDENTIALS` |
| `POST /auth/admin/login` | Admin login `{ email, password }` | rejects STUDENT accounts with the same generic error |
| `POST /auth/logout` | Revoke session | |
| `GET /auth/me` | Current user `{ id, role, fullName, email, studentId? }` | |

Lockout: 5 failed attempts → 15-minute lock (configurable). Responses never reveal whether the email exists.

## 3. Student (`/student`)

| Endpoint | Purpose |
|---|---|
| `GET /student/dashboard` | profile, enrollment status, available exams, previous sessions, verification summary, previous warnings (own only) |
| `GET /student/profile` | profile |
| `POST /student/consent/biometric` | `{ accepted: true, policyVersion }` records consent |
| `GET /student/enrollment` | current draft/profile: per-angle status, progress, overall status |
| `POST /student/enrollment/start` | creates a `DRAFT` profile (new version) — requires consent; `CONSENT_REQUIRED` |
| `POST /student/enrollment/preview-check` | multipart `{ frame, angle }` → live quality feedback only (nothing stored) |
| `POST /student/enrollment/captures` | multipart `{ frame, angle }` → server re-validates quality, stores encrypted image + encrypted embedding; codes `QUALITY_FAILED` (with machine-readable reasons), `WRONG_POSE`, `MODEL_UNAVAILABLE` |
| `DELETE /student/enrollment/captures/:angle` | remove one capture to retake |
| `POST /student/enrollment/finalize` | needs all 5 angles; computes centroid; consistency check; → `PENDING_APPROVAL` (or `APPROVED` if approval not required); codes `ENROLLMENT_INCOMPLETE`, `ENROLLMENT_INCONSISTENT` |
| `POST /student/biometric-deletion-requests` | request deletion |
| `GET /student/exams` | exams the student may start (ACTIVE, approved enrollment); includes `canStart` and `reason` |
| `POST /student/exams/:examId/sessions` | create/resume session. Returns existing live session if present. Codes `ENROLLMENT_NOT_APPROVED`, `EXAM_NOT_ACTIVE`, `ANOTHER_SESSION_ACTIVE` |
| `GET /student/sessions/:sessionId` | status, `serverNow`, `expiresAt`, **student-safe** settings subset `{ intervalMs }` only (no threshold, no limits) |
| `GET /student/sessions/:sessionId/questions` | questions + options **without** `isCorrect`; only when IN_PROGRESS |
| `POST /student/sessions/:sessionId/pre-verification` | multipart `{ frame }`; logs a PRE_EXAM attempt; returns `{ outcome, studentMessage, consecutiveMatches, requiredMatches, readyToStart }` |
| `POST /student/sessions/:sessionId/start` | requires `readyToStart`; sets `started_at`, `expires_at`; code `VERIFICATION_REQUIRED` |
| `PUT /student/sessions/:sessionId/answers/:questionId` | `{ optionId }`; `SESSION_NOT_ACTIVE`, `SESSION_EXPIRED` |
| `POST /student/sessions/:sessionId/verifications` | multipart `{ frame, clientCapturedAt }`; the continuous cycle. Response `{ outcome, studentMessage, statusCode, activeWarning: boolean, nextIntervalMs, serverNow }`. Never includes score, threshold, or other students' data. Codes `VERIFICATION_IN_PROGRESS` 409, `SESSION_NOT_ACTIVE` |
| `POST /student/sessions/:sessionId/client-events` | `{ type: "CAMERA_ERROR", errorCode, detail? }`; creates a `CAMERA_ERROR` log row (no frame) and updates state |
| `POST /student/sessions/:sessionId/submit` | final submit |
| `GET /student/sessions/:sessionId/summary` | duration, total attempts, successful matches, failed matches, unverified, security triggers (count + friendly types), status, score if allowed |

`studentMessage` values are chosen from a fixed list: identity verified; face not detected; multiple faces detected; identity could not be confirmed; image unclear, improve lighting; camera disconnected or blocked; verification service temporarily unavailable.

## 4. Admin (`/admin`)

### Dashboard, students, gallery
| Endpoint | Purpose | Status |
|---|---|---|
| `GET /admin/dashboard` | totals: students, enrolled, active exams, active sessions, total attempts, successful, failed, unverified, active incidents, latest 5 pending approvals & audit activity | Implemented (P04) |
| `GET /admin/students?search=&enrollmentStatus=&status=&page=&limit=` | list, filter, search, paginate students | Implemented (P04) |
| `GET /admin/students/:id` | profile + enrollment summary + session history | Implemented (P04) |
| `PATCH /admin/students/:id` | `{ status }` suspend/reactivate (audited; revokes sessions on suspension) | Implemented (P04) |
| `POST /admin/students/:id/reset-password` | returns a one-time temporary password **once**, forces change on next login | Implemented (P04) |
| `DELETE /admin/students/:id` | soft delete (revokes sessions; biometric data preserved for deletion workflow) | Implemented (P04) |
| `GET /admin/students/:id/face-gallery` | profiles (all versions) with per-angle image metadata and **authorized image URLs** (`/api/v1/admin/images/enrollment/:imageId`) | Implemented (P04) |
| `GET /admin/gallery/candidates` | gallery candidate grid search with front angle authorized preview URL | Implemented (P04) |
| `GET /admin/enrollments` | list pending enrollment approvals with candidate details and 5 images | Implemented (P04) |
| `POST /admin/enrollments/:profileId/approve` · `/reject` `{reason}` · `/revoke` | transitions (audited, <= 1 approved profile guarantee) | Implemented (P04) |
| `GET /admin/images/enrollment/:imageId` | streams decrypted image; audited; `no-store`, SHA-256 integrity checked | Implemented (P04) |
| `GET /admin/images/evidence/:triggerId` | streams evidence; audited; integrity-checked | Implemented (P08) |
| `GET /admin/data-deletion-requests` · `POST /admin/data-deletion-requests/:id/fulfill` `/reject` | deletion workflow (hard-deletes image files & embeddings, audits counts only) | Implemented (P04) |
| `GET /admin/system-settings` · `PATCH /admin/system-settings` | view and update `require_enrollment_approval` gate | Implemented (P04) |
| `GET /admin/audit-logs` | keyset-paginated, filterable immutable administrative audit log | Implemented (P04) |
| `GET /admin/audit-logs/evidence-access` | shortcut filter for biometric and evidence access events | Implemented (P04) |

### Exams
`GET/POST /admin/exams`, `GET/PATCH/DELETE /admin/exams/:id`, `POST /admin/exams/:id/activate`, `POST /admin/exams/:id/deactivate`, `GET /admin/exams/:id/participants`, `POST /admin/exams/:id/questions`, `PATCH/DELETE /admin/exams/:id/questions/:questionId`, `PUT /admin/exams/:id/questions/order`.
Editing questions of an exam that has sessions is blocked unless the exam is `INACTIVE` (`EXAM_HAS_SESSIONS`).

### Settings
| Endpoint | Purpose | Status |
|---|---|---|
| `GET /admin/verification-settings` | active settings profile + history overview | Implemented (P06) |
| `GET /admin/verification-settings/history` | full history list with change notes and creators | Implemented (P06) |
| `POST /admin/verification-settings` | creates immutable new version, deactivates previous, audits change note | Implemented (P06) |
| `GET /admin/system-settings` · `PATCH /admin/system-settings` | retention, approval flag | Implemented (P04) |
| `POST /admin/retention/run` | manual retention job, returns counts | Implemented (P04) |

### Monitoring and incidents
| Endpoint | Purpose | Status |
|---|---|---|
| `GET /admin/monitoring/sessions` | snapshot of live sessions: student name/ID, exam, started_at, latest status, latest score, total attempts, matches, failed, active incidents | Implemented (P08) |
| `POST /admin/sessions/:id/cancel` | manual cancel `{ reason }` (audited) | Implemented (P08) |
| `GET /admin/incidents?status=&severity=&type=&examId=&studentId=&from=&to=&cursor=` | list incidents with cursor pagination | Implemented (P08) |
| `GET /admin/incidents/:id` | detail incl. evidence metadata, timeline of related log rows, student's approved enrollment images (URLs), investigation log | Implemented (P08) |
| `POST /admin/incidents/:id/acknowledge` | acknowledge open incident | Implemented (P08) |
| `POST /admin/incidents/:id/review` | submit review `{ disposition, note? }` (requires note >= 10 chars for CONFIRMED_CONCERN) | Implemented (P08) |
| `POST /admin/incidents/:id/notes` | append note to investigation log `{ note }` | Implemented (P08) |
| `GET /admin/incidents/:id/report?format=csv\|html` | exportable report (audited); includes evidence hash, formula injection safe; neutral wording | Implemented (P08) |

### History, reports, audit
`GET /admin/verifications?studentId=&examId=&sessionId=&from=&to=&outcome=&triggerType=&cursor=&limit=` · `GET /admin/verifications/export.csv` (same filters, streamed) · `GET /admin/reports/overview` · `/sessions` · `/students` · `/exams` · `/incidents` (each with `?format=csv`) · `GET /admin/audit-logs?action=&actor=&from=&to=&cursor=` · `GET /admin/audit-logs/evidence-access`.

## 5. WebSocket (`ws://localhost:4000/ws`)

- Handshake: cookie auth + `Origin` allow-list; role ADMIN required for `monitoring`.
- Client → server: `{ "type": "subscribe", "channel": "monitoring" }`, `{ "type": "ping" }`.
- Server → client envelope: `{ "type": "<event>", "eventId": number, "emittedAt": ISO, "payload": {...} }`.
- Events: `session.started`, `session.updated` (latest status/score/counters), `session.ended`, `incident.opened`, `incident.updated`, `incident.recovered`, `incident.status_changed`, `service.health` (vision up/down), `system.warning` (e.g. evidence integrity failure).
- Payloads contain ids and numbers needed for the table only; **never image data or biometric content**.

## 6. Vision service (`services/vision`, Node→Python only)

Base `http://127.0.0.1:8000`. All endpoints except `/v1/health` require header `X-Internal-Key`.
Image part name: `image` (multipart). Reference embeddings travel as base64 little-endian float32.

| Endpoint | Request | Response (200) |
|---|---|---|
| `GET /v1/health` | — | `{ status: "OK" \| "DEGRADED", modelLoaded: bool }` |
| `GET /v1/diagnostics` | — | python/package versions, onnxruntime providers, model name/version/present, mediapipe availability, `calibrationStatus: "PROVISIONAL" \| "CALIBRATED"`, concurrency in-flight/limit, last error — **honest** about failures |
| `POST /v1/quality` | `image`, optional `angle` | `{ faceCount, faces:[{box, detScore, yaw, pitch, roll}], quality:{blur, brightness, faceSizeRatio, faceInFrame, poseOk?}, reasons:[...] , ms }` — no embedding |
| `POST /v1/embed` | `image`, optional `angle` | as above plus `embedding` (b64), `modelName`, `modelVersion`, `dim` — **only when exactly one acceptable face** |
| `POST /v1/verify` | `image`, `reference` (b64 centroid), optional `samples[]` (b64) | `{ faceCount, faces[], quality, similarityRaw?, similarityPct?, perSample?:[...], modelName, modelVersion, calibrationStatus, ms }`; `similarity*` present only when exactly one face and embedding succeeded |

Errors: `400 INVALID_IMAGE`, `401 BAD_INTERNAL_KEY`, `503 MODEL_UNAVAILABLE`, `503 BUSY` (+`Retry-After`), `500 INTERNAL_ERROR`. Python **never** returns a verdict like "same person"; Node decides.
