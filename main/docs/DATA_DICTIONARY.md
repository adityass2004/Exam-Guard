# ExamGuard — Data Dictionary (planned schema)

Authoritative plan for `apps/api/prisma/schema.prisma`. Prisma is the single source of truth: if the implemented schema deviates, update **this document and `docs/DATA_DICTIONARY.md` in the repo in the same change**.

## Conventions

- Prisma model names are `PascalCase` singular (`VerificationLog`); table names are `snake_case` plural via `@@map` (`verification_logs`); column names are `snake_case` via `@map`, Prisma fields are `camelCase`.
- Primary keys: `String @id @default(uuid()) @db.Char(36)` except `verification_logs.id` which is `BigInt @id @default(autoincrement())` (high volume; serialised to JSON as a **string**).
- Every table has `created_at` (`DateTime @default(now())`) and, where rows change, `updated_at` (`@updatedAt`). All timestamps are UTC (`DateTime(3)`).
- Soft deletion (`deleted_at DateTime?`) only on: `users`, `exams`, `exam_questions`. Biometric data is **hard-deleted** on deletion requests/retention (a soft-deleted biometric is still stored biometric).
- Foreign keys use `onDelete: Restrict` by default; `Cascade` only where a child is meaningless without the parent (options→question, images/embeddings→face_profile, answers→session).
- Enums are Prisma enums (stored as MySQL ENUM). Shared TypeScript enums are re-exported from `packages/shared`.
- No image binaries in MySQL. Encrypted embeddings (`VarBinary`) are the only biometric payload in MySQL.

## Enums

| Enum | Values |
|---|---|
| `UserRole` | `STUDENT`, `ADMIN` |
| `UserStatus` | `ACTIVE`, `SUSPENDED` |
| `EnrollmentStatus` | `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `SUPERSEDED`, `REVOKED` |
| `FaceAngle` | `FRONT`, `LEFT`, `RIGHT`, `UP`, `DOWN` |
| `EmbeddingKind` | `SAMPLE`, `CENTROID` |
| `ExamStatus` | `DRAFT`, `ACTIVE`, `INACTIVE` |
| `SessionStatus` | `PENDING_VERIFICATION`, `IN_PROGRESS`, `SUBMITTED`, `EXPIRED`, `CANCELLED` |
| `VerificationPhase` | `PRE_EXAM`, `CONTINUOUS` |
| `VerificationOutcome` | `MATCH`, `MISMATCH`, `NO_FACE`, `MULTIPLE_FACES`, `CAMERA_ERROR`, `VERIFICATION_ERROR` |
| `TriggerType` | `IDENTITY_MISMATCH`, `NO_FACE`, `MULTIPLE_FACES`, `CAMERA_DISCONNECTED`, `VERIFICATION_SERVICE_FAILURE`, `REPEATED_VERIFICATION_FAILURE` |
| `Severity` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `IncidentStatus` | `OPEN`, `ACKNOWLEDGED`, `REVIEWED` |
| `ReviewDisposition` | `CONFIRMED_CONCERN`, `FALSE_POSITIVE`, `INCONCLUSIVE` |
| `EvidenceCaptureStatus` | `CAPTURED`, `FAILED`, `NOT_AVAILABLE` |
| `MultipleFacesPolicy` | `LOG_ONLY`, `ALERT_AFTER_CONSECUTIVE`, `ALERT_IMMEDIATELY` |
| `CameraFailurePolicy` | `ALERT_AFTER_GRACE`, `ALERT_IMMEDIATELY` |
| `DeletionRequestStatus` | `PENDING`, `FULFILLED`, `REJECTED` |

Stable `error_code` strings for `verification_logs` (not an enum, to stay extensible): `NONE`, `LOW_QUALITY_FRAME`, `SERVICE_UNAVAILABLE`, `SERVICE_TIMEOUT`, `SERVICE_BUSY`, `MODEL_UNAVAILABLE`, `MODEL_MISMATCH`, `INVALID_IMAGE`, `CAMERA_PERMISSION_DENIED`, `CAMERA_NOT_FOUND`, `CAMERA_IN_USE`, `CAMERA_TRACK_ENDED`, `CAMERA_UNKNOWN`, `NO_SIGNAL` (watchdog: no verification signal received from a live session), `INTERNAL_ERROR`.

**"Active" vs "ongoing" incident (canonical definitions).** *Active incident* = `security_triggers.status IN ('OPEN','ACKNOWLEDGED')` (still needs administrator attention) — used by the admin dashboard, live monitoring and reports. *Ongoing incident* = `active_dedupe_key IS NOT NULL` (the failure condition has not yet recovered and the session is still live) — used only for deduplication and an "ongoing" badge. The key is cleared on recovery **and** when the session ends.

---

## Tables

### users
Accounts for both roles.
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| role | `UserRole` | indexed |
| email | varchar(254) | **UNIQUE**, stored lower-case |
| password_hash | varchar(255) | Argon2id string |
| full_name | varchar(120) | |
| status | `UserStatus` | default `ACTIVE` |
| must_change_password | boolean | default `false` (forces credential change on temporary password reset) |
| failed_login_count / locked_until | int / datetime? | lockout support |
| last_login_at | datetime? | |
| created_at / updated_at / deleted_at | | soft delete (indexed with `[role, deleted_at]`) |

### auth_sessions
Server-side login sessions (not exam sessions).
`id`, `user_id` FK→users, `token_hash` (**UNIQUE**, SHA-256 hex), `csrf_token_hash`, `created_at`, `last_used_at`, `expires_at`, `revoked_at?`, `user_agent` (truncated), index `(user_id)`, `(expires_at)`.

### student_profiles
1:1 with a student user. `id`, `user_id` **UNIQUE** FK→users, `student_id` varchar(32) **UNIQUE** (institution ID), `enrollment_status_cache EnrollmentStatus?` (denormalised for listing; recomputed on every enrollment transition), timestamps.

### consent_records
`id`, `user_id` FK, `consent_type` varchar(40) (`BIOMETRIC_ENROLLMENT`), `policy_version` varchar(20), `policy_text_sha256` char(64), `granted` bool, `created_at`. Latest row wins; withdrawal inserts `granted=false`. Index `(user_id, consent_type, created_at)`.

### face_profiles
One enrollment attempt/version for a student.
`id`, `student_user_id` FK→users, `version` int, `status EnrollmentStatus`, `model_name`, `model_version`, `embedding_dim` int, `quality_summary` JSON, `consistency_min_observed` float?, `submitted_at?`, `approved_at?`, `approved_by?` FK→users, `rejected_reason?`, `revoked_at?`, timestamps. **UNIQUE(student_user_id, version)**. Index `(student_user_id, status)`. At most one `APPROVED` per student, enforced transactionally by approval logic and verified by a test.

### face_enrollment_images
One per angle per profile. `id`, `face_profile_id` FK (Cascade), `angle FaceAngle`, `storage_path` (relative to `STORAGE_ROOT`), `sha256` char(64), `mime`, `byte_size`, `width`, `height`, `enc_iv` binary(12), `enc_tag` binary(16), `enc_key_version` smallint, `quality` JSON (blur, brightness, det_score, face_box, yaw, pitch, roll), `captured_at`. **UNIQUE(face_profile_id, angle)** (retake replaces).

### face_embeddings
`id`, `face_profile_id` FK (Cascade), `kind EmbeddingKind`, `angle FaceAngle?` (null for centroid), `ciphertext` VarBinary(2200), `enc_iv` binary(12), `enc_tag` binary(16), `enc_key_version` smallint, `dim` int, `model_name`, `model_version`, `created_at`. **UNIQUE(face_profile_id, kind, angle)** — note MySQL treats NULLs as distinct, so centroid uniqueness is additionally enforced in application code and by a test.

### exams
`id`, `title`, `description?`, `duration_minutes` int (1–600), `status ExamStatus`, `shuffle_questions` bool, `show_score_after_submit` bool, `verification_settings_id?` FK→verification_settings (optional per-exam override; null = use the active global version at session start), `created_by` FK→users, timestamps, `deleted_at?`. Index `(status, deleted_at)`.

### exam_questions
`id`, `exam_id` FK, `position` int, `prompt` text, `points` int default 1, timestamps, `deleted_at?`. **UNIQUE(exam_id, position)** is *not* used with soft delete; ordering is by `position` and re-numbered by service code inside a transaction. Index `(exam_id, position)`.

### exam_question_options
`id`, `question_id` FK (Cascade), `position` int, `label` text, `is_correct` bool. **UNIQUE(question_id, position)**. Exactly one correct option per question is validated in service code. `is_correct` is never serialised to student endpoints.

### exam_sessions
One student attempt, and the container of live monitoring state.
| Column | Notes |
|---|---|
| id uuid PK | |
| exam_id, student_user_id | FK |
| face_profile_id | FK; the approved profile used |
| settings_version_id | FK→verification_settings (the version applied) |
| settings_snapshot | JSON; **full copy** of the applied settings; immutable after creation; the engine reads **only** this |
| status | `SessionStatus` |
| active_student_key | char(36)? **UNIQUE**; equals `student_user_id` while status ∈ {PENDING_VERIFICATION, IN_PROGRESS}, else NULL → one live session per student |
| created_at, pre_verified_at?, started_at?, expires_at?, submitted_at?, cancelled_at?, cancelled_by? | |
| last_seen_at | updated on each accepted verification or client event |
| next_sequence_no | int, allocated inside the verification transaction |
| total_attempts, match_count, mismatch_count, no_face_count, multi_face_count, camera_error_count, verification_error_count | int counters (continuous phase only; pre-exam attempts are counted separately in `pre_exam_attempts`) |
| pre_exam_attempts, pre_exam_consecutive_matches | int |
| consecutive_match, consecutive_mismatch, consecutive_no_face, consecutive_multi_face, consecutive_service_error, consecutive_non_match | int, state machine inputs |
| camera_error_since | datetime? |
| last_outcome `VerificationOutcome?`, last_similarity_pct float?, last_verification_at datetime? | monitoring convenience |
| score, max_score | int? computed on submit |
Indexes: `(status)`, `(exam_id, status)`, `(student_user_id, created_at)`, `(last_seen_at)`.

### exam_answers
`id`, `session_id` FK (Cascade), `question_id` FK, `option_id` FK?, `answered_at`. **UNIQUE(session_id, question_id)** (upsert).

### verification_settings
**Immutable, versioned.** Editing creates a new row.
`id`, `version` int **UNIQUE**, `is_active` bool (exactly one active, enforced transactionally), `name?`, `threshold_pct` float (30–99, default **75**), `interval_ms` int (500–10000, default **1500**), `consecutive_mismatch_limit` int (default 3), `missing_face_limit` int (default 4), `multiple_faces_policy`, `multiple_faces_consecutive_limit` int (default 2), `camera_failure_policy`, `camera_grace_seconds` int (default 6), `service_failure_limit` int (default 3), `repeated_failure_limit` int (default 6), `recovery_match_count` int (default 3), `startup_grace_seconds` int (default 10), `pre_exam_required_matches` int (default 2), `min_face_quality` JSON (blur/brightness/face-size/detector-confidence minimums; provisional), `severity_rules` JSON (trigger→severity; defaults: IDENTITY_MISMATCH=CRITICAL, MULTIPLE_FACES=HIGH, REPEATED_VERIFICATION_FAILURE=HIGH, NO_FACE=MEDIUM, CAMERA_DISCONNECTED=MEDIUM, VERIFICATION_SERVICE_FAILURE=LOW), `created_by` FK, `created_at`, `change_note?`.

### verification_logs
**One row per verification attempt, success or failure. Never contains image data.**
| Column | Notes |
|---|---|
| id BigInt PK | |
| session_id FK, student_user_id FK, exam_id FK | denormalised FKs for filtering |
| sequence_no int | **UNIQUE(session_id, sequence_no)** |
| phase | `VerificationPhase` |
| outcome | `VerificationOutcome` |
| error_code | varchar(40), default `NONE` |
| similarity_raw float?, similarity_pct float? | null when no score exists |
| threshold_pct float | threshold from the session snapshot, always stored |
| face_count int? | |
| quality | JSON? (blur, brightness, det_score, face_size, yaw/pitch) — numbers only |
| vision_ms int?, processing_ms int | Python-side and total server-side durations |
| client_captured_at datetime(3)? | from browser (informational; not trusted) |
| settings_version_id | FK |
| trigger_id char(36)? | FK→security_triggers; set when this attempt opened or updated an incident |
| created_at datetime(3) | server receive time |
Indexes: `(session_id, sequence_no)` unique, `(session_id, created_at)`, `(student_user_id, created_at)`, `(exam_id, created_at)`, `(outcome, created_at)`, `(created_at)`, `(trigger_id)`.

### security_triggers (incidents)
| Column | Notes |
|---|---|
| id uuid PK; incident_code varchar(24) **UNIQUE** | |
| session_id, student_user_id, exam_id | FK |
| trigger_type, severity, status | status default `OPEN` |
| disposition `ReviewDisposition?` | set on REVIEWED |
| active_dedupe_key varchar(80)? **UNIQUE** | `"{session_id}:{trigger_type}"` while active, else NULL |
| first_detected_at, last_detected_at, recovered_at? | |
| occurrence_count int | |
| first_similarity_pct, worst_similarity_pct float? | "relevant matching score" |
| first_verification_log_id, last_verification_log_id | BigInt |
| evidence_status `EvidenceCaptureStatus`, evidence_failure_reason? | |
| acknowledged_by?, acknowledged_at?, reviewed_by?, reviewed_at? | FK users |
Indexes: `(status, severity)`, `(session_id)`, `(student_user_id)`, `(exam_id)`, `(trigger_type, first_detected_at)`, `(active_dedupe_key)` unique.

### trigger_evidence
**Exactly one per incident (UNIQUE trigger_id).** `id`, `trigger_id` **UNIQUE** FK, `verification_log_id` BigInt, `storage_path`, `sha256` char(64), `mime`, `byte_size`, `width`, `height`, `enc_iv`, `enc_tag`, `enc_key_version`, `captured_at`, `created_at`. Rows are append-only. When capture fails there is no evidence row; the failure lives on `security_triggers.evidence_status/failure_reason`.

### admin_investigation_logs
Append-only investigation timeline per incident. `id`, `trigger_id` FK, `admin_user_id` FK, `action` varchar(30) (`VIEWED`, `EVIDENCE_VIEWED`, `COMPARED`, `ACKNOWLEDGED`, `REVIEWED`, `NOTE`, `REPORT_EXPORTED`), `note` text?, `disposition?`, `created_at`. Index `(trigger_id, created_at)`.

### admin_audit_logs
System-wide audit. `id` BigInt PK, `actor_user_id` FK?, `actor_role`, `action` varchar(60) (e.g. `AUTH_LOGIN`, `AUTH_LOGIN_FAILED`, `SETTINGS_CHANGED`, `EVIDENCE_ACCESSED`, `ENROLLMENT_IMAGE_ACCESSED`, `ENROLLMENT_APPROVED`, `STUDENT_SUSPENDED`, `DATA_DELETION_FULFILLED`, `RETENTION_PURGE`, `EVIDENCE_INTEGRITY_FAILURE`, `SESSION_CANCELLED`, `EXPORT_GENERATED`), `entity_type`, `entity_id`, `before` JSON?, `after` JSON?, `request_id`, `ip_hash` char(64)? (salted hash), `created_at`. **Never contains passwords, tokens, embeddings or image data.** Indexes `(action, created_at)`, `(entity_type, entity_id)`, `(actor_user_id, created_at)`.

### system_settings
Key/value for non-verification settings. `key` varchar(80) PK, `value` JSON, `updated_by`, `updated_at`. Keys: `require_enrollment_approval` (bool, default true), `retention.enrollment_images_days`, `retention.evidence_days`, `retention.verification_logs_days`, `retention.audit_logs_days`, `biometric_consent_policy_version`. Retention defaults are **administrator decisions** — the seed sets conservative placeholder values and flags them "review before real use"; they are not legal advice.

### data_deletion_requests
`id`, `student_user_id` FK, `status DeletionRequestStatus`, `reason?`, `requested_at`, `handled_by?`, `handled_at?`, `handler_note?`.

---

## Key relationships

```
users 1─1 student_profiles
users 1─* face_profiles 1─* face_enrollment_images
                        1─* face_embeddings
users 1─* exam_sessions *─1 exams 1─* exam_questions 1─* exam_question_options
exam_sessions 1─* exam_answers
exam_sessions *─1 face_profiles                (profile used)
exam_sessions *─1 verification_settings        (version applied) + settings_snapshot JSON
exam_sessions 1─* verification_logs
exam_sessions 1─* security_triggers 1─1 trigger_evidence
security_triggers 1─* admin_investigation_logs
verification_logs *─0..1 security_triggers     (the incident the attempt touched)
users 1─* admin_audit_logs                     (as actor)
```

## Transaction boundaries (must be implemented as single Prisma `$transaction`s)

1. **Verification cycle:** allocate `sequence_no`, insert log, update session counters/state, open or update incident, insert evidence row, update `last_*` — atomically.
2. **Enrollment finalisation / approval:** supersede previous approved profile + approve new one + update `student_profiles.enrollment_status_cache` + audit row.
3. **Settings change:** deactivate old active version + insert new active version + audit row.
4. **Session creation:** check no live session (unique key), copy settings snapshot, insert session.
5. **Deletion fulfilment:** delete embeddings/image rows + revoke profile + audit; files are deleted after commit, failures are logged and retried by the retention job.
