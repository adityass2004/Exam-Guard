# ExamGuard — Security Trigger Rules and Incident Engine Specification

> Specification for continuous verification security rules, counters, deduplication, evidence capture, and incident lifecycle (Phase 07).

---

## 1. Overview & Architecture

The Security Trigger Engine turns raw verification attempts into verified, deduplicated, and actionable security incidents.

### Core Invariants (INSTRUCTIONS §10):
1. **Every verification attempt creates exactly one `verification_logs` row.** Requests rejected *before* processing begins (e.g. `409 VERIFICATION_IN_PROGRESS`, auth failure, session not active) create no row.
2. **Images are never stored per attempt.** An image is written to disk only when a **new** incident is opened.
3. **One incident = at most one evidence image.** Enforced by `UNIQUE(trigger_evidence.trigger_id)` and by application logic. Repeat failures while an incident is active **update** the incident (`last_detected_at`, `occurrence_count`, worst score) and store nothing.
4. **Deduplication is enforced by the database.** `security_triggers.active_dedupe_key` (`"{sessionId}:{triggerType}"` while active; `NULL` after recovery/session-end). MySQL allows multiple `NULL`s, ensuring historical records are preserved while at most one active incident per (session, type) can exist concurrently.
5. **Recovery:** after `recovery_match_count` consecutive `MATCH` outcomes, active incidents of that session are marked recovered (`recovered_at = now`, `active_dedupe_key = NULL`). A later failure opens a **new** incident with a **new** `incident_code` and **new** evidence.
6. **No single-frame identity verdicts:** An `IDENTITY_MISMATCH` requires `consecutive_mismatch >= consecutive_mismatch_limit`. Low-quality frames (`LOW_QUALITY_FRAME`), no face, or multiple faces are distinct non-match states and never count as mismatches.
7. **No automatic exam termination:** Triggers flag incidents for administrative review; the proctoring engine never auto-terminates exams.

---

## 2. Counter Transitions Per Processed Attempt

All counters live on the `exam_sessions` row and update within the single verification recording transaction.
Note: `=` means unchanged.

| Outcome (`error_code`) | `consecutive_match` | `consecutive_mismatch` | `consecutive_no_face` | `consecutive_multi_face` | `consecutive_service_error` | `consecutive_non_match` |
|---|---|---|---|---|---|---|
| `MATCH` | `+1` | `0` | `0` | `0` | `0` | `0` |
| `MISMATCH` | `0` | `+1` | `0` | `0` | `0` | `+1` |
| `NO_FACE` | `0` | `=` | `+1` | `0` | `0` | `+1` |
| `MULTIPLE_FACES` | `0` | `=` | `0` | `+1` | `0` | `+1` |
| `VERIFICATION_ERROR / LOW_QUALITY_FRAME` | `0` | `=` | `=` | `=` | `0` | `+1` |
| `VERIFICATION_ERROR / SERVICE_*, MODEL_*, INTERNAL_ERROR` | `0` | `=` | `=` | `=` | `+1` | `+1` |
| `VERIFICATION_ERROR / INVALID_IMAGE` | `0` | `=` | `=` | `=` | `=` | `+1` |
| `CAMERA_ERROR` | `0` | `=` | `=` | `=` | `=` | `+1` |

### Counter Rules:
- `camera_error_since` is set to `now` on the first `CAMERA_ERROR` when currently `NULL`, and cleared to `NULL` by any attempt that carried a real frame.
- Inconclusive outcomes (`NO_FACE`, `MULTIPLE_FACES`, `LOW_QUALITY_FRAME`, `CAMERA_ERROR`, `SERVICE_ERROR`, `INVALID_IMAGE`) **never reset `consecutive_mismatch`**; only a `MATCH` resets `consecutive_mismatch`.
- Phase `PRE_EXAM` attempts do **not** touch these continuous counters and never open incidents.

---

## 3. Trigger Conditions & Policies

Evaluated after counters update, only when `now >= started_at + startup_grace_seconds`.
Counters accumulate during the startup grace period, so any condition persisting past the grace period triggers on the very next processed attempt.

| Trigger Type | Opens When | Evidence Frame |
|---|---|---|
| `IDENTITY_MISMATCH` | `consecutive_mismatch >= consecutive_mismatch_limit` | The current attempt frame |
| `NO_FACE` | `consecutive_no_face >= missing_face_limit` | The current attempt frame |
| `MULTIPLE_FACES` | `ALERT_IMMEDIATELY`: first occurrence (`>= 1`);<br>`ALERT_AFTER_CONSECUTIVE`: `consecutive_multi_face >= multiple_faces_consecutive_limit`;<br>`LOG_ONLY`: never | The current attempt frame |
| `VERIFICATION_SERVICE_FAILURE` | `consecutive_service_error >= service_failure_limit` | Current frame if received, else `NOT_AVAILABLE` |
| `REPEATED_VERIFICATION_FAILURE` | `consecutive_non_match >= repeated_failure_limit` | Current frame if received, else `NOT_AVAILABLE` |
| `CAMERA_DISCONNECTED` | `ALERT_IMMEDIATELY`: first `CAMERA_ERROR`;<br>`ALERT_AFTER_GRACE`: `now - camera_error_since >= camera_grace_seconds`;<br>Or detected by Watchdog (`now - last_seen_at >= interval_ms * 3 + camera_grace_seconds * 1000`) | `NOT_AVAILABLE` (no frame exists) |

### Severity Resolution:
- Dynamic severity per trigger is read from the session's immutable `settingsSnapshot.severityRules[triggerType]`.
- Defaults: `IDENTITY_MISMATCH` $\to$ `CRITICAL`, `MULTIPLE_FACES` $\to$ `HIGH`, `CAMERA_DISCONNECTED` $\to$ `HIGH`, `NO_FACE` $\to$ `MEDIUM`, `REPEATED_VERIFICATION_FAILURE` $\to$ `MEDIUM`, `VERIFICATION_SERVICE_FAILURE` $\to$ `LOW`.

---

## 4. Evidence Storage & Integrity

### Storage Specification:
- Directory: `STORAGE_ROOT/evidence/{hash_prefix_2}/{incidentId}_{sha256Prefix}.enc`
- Plaintext frame is re-encoded with `sharp` to strip metadata, then hashed via SHA-256.
- Encrypted at rest using AES-256-GCM with `IMAGE_ENCRYPTION_KEY` (32 bytes).
- 12-byte cryptographic IV and 16-byte GCM authentication tag stored in `trigger_evidence` table along with SHA-256 and dimensions.

### Order of Operations (Atomic Evidence Protocol):
1. The pure engine flags an `OPEN` action for a trigger type.
2. The evidence writer encrypts and writes the evidence file to disk **before** the Prisma transaction commits.
3. The Prisma `$transaction` commits:
   - Verification log row
   - Security incident row (`status: OPEN`, `occurrenceCount: 1`)
   - `TriggerEvidence` row (`triggerId` UNIQUE)
   - Updated session counters
4. **On Transaction Failure:** The written evidence file is unlinked immediately in the error handler.
5. **On File Write Failure:** The incident is still opened, but with `evidence_status = FAILED`, `evidence_failure_reason = <error_message>`, and no `TriggerEvidence` row is created. Audit log `EVIDENCE_CAPTURE_FAILED` is recorded.
6. **Concurrent Duplicate Insert (P2002 on `active_dedupe_key`):** The newly created file is unlinked, and the transaction safely updates the existing incident.

---

## 5. Recovery Protocol

- When `consecutive_match >= recovery_match_count`:
  1. All active incidents (`active_dedupe_key != NULL`) for the session are updated:
     - `recovered_at = now`
     - `active_dedupe_key = NULL`
  2. `status` remains as-is (e.g. `OPEN` or `ACKNOWLEDGED` for admin review).
  3. Subsequent failure of the same trigger type will find no active incident, creating a brand new incident with a fresh `incident_code` and capturing a new evidence image.
  4. Post-commit event `incident.recovered` is dispatched on `eventBus`.

---

## 6. Session End Hook

When an exam session transitions out of `IN_PROGRESS` (`SUBMITTED`, `EXPIRED`, `CANCELLED`):
- All ongoing incidents for that session have their `active_dedupe_key` set to `NULL`.
- `recovered_at` remains `NULL` (the condition did not recover).
- The incidents remain fully reviewable by administrators.

---

## 7. Watchdog Specification (`jobs/watchdog.ts`)

- Runs periodically (~5 seconds).
- Finds `IN_PROGRESS` sessions.
- Skips sessions whose in-process verification lock is currently held.
- For sessions past `startup_grace_seconds`:
  - If `now - last_seen_at > interval_ms * 3 + camera_grace_seconds * 1000`:
    - Evaluates `CAMERA_DISCONNECTED`.
    - If no active incident exists: creates one `verification_logs` row (`outcome: 'CAMERA_ERROR'`, `errorCode: 'NO_SIGNAL'`), opens a `CAMERA_DISCONNECTED` incident with `evidence_status = NOT_AVAILABLE`.
    - If incident already active: updates `last_detected_at` and increments `occurrence_count` without creating additional log rows or evidence files.
- Wording: "no verification signal received", never "camera unplugged".
