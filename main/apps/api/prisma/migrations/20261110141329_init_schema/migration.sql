-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `role` ENUM('STUDENT', 'ADMIN') NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `full_name` VARCHAR(120) NOT NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `failed_login_count` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_role_idx`(`role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_sessions` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `csrf_token_hash` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_used_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `user_agent` VARCHAR(512) NULL,

    UNIQUE INDEX `auth_sessions_token_hash_key`(`token_hash`),
    INDEX `auth_sessions_user_id_idx`(`user_id`),
    INDEX `auth_sessions_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student_profiles` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `student_id` VARCHAR(32) NOT NULL,
    `enrollment_status_cache` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'REVOKED') NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `student_profiles_user_id_key`(`user_id`),
    UNIQUE INDEX `student_profiles_student_id_key`(`student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `consent_records` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `consent_type` VARCHAR(40) NOT NULL,
    `policy_version` VARCHAR(20) NOT NULL,
    `policy_text_sha256` CHAR(64) NOT NULL,
    `granted` BOOLEAN NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `consent_records_user_id_consent_type_created_at_idx`(`user_id`, `consent_type`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `face_profiles` (
    `id` CHAR(36) NOT NULL,
    `student_user_id` CHAR(36) NOT NULL,
    `version` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SUPERSEDED', 'REVOKED') NOT NULL,
    `model_name` VARCHAR(64) NOT NULL,
    `model_version` VARCHAR(32) NOT NULL,
    `embedding_dim` INTEGER NOT NULL,
    `quality_summary` JSON NULL,
    `consistency_min_observed` DOUBLE NULL,
    `submitted_at` DATETIME(3) NULL,
    `approved_at` DATETIME(3) NULL,
    `approved_by` CHAR(36) NULL,
    `rejected_reason` TEXT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `face_profiles_student_user_id_status_idx`(`student_user_id`, `status`),
    UNIQUE INDEX `face_profiles_student_user_id_version_key`(`student_user_id`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `face_enrollment_images` (
    `id` CHAR(36) NOT NULL,
    `face_profile_id` CHAR(36) NOT NULL,
    `angle` ENUM('FRONT', 'LEFT', 'RIGHT', 'UP', 'DOWN') NOT NULL,
    `storage_path` VARCHAR(255) NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `mime` VARCHAR(32) NOT NULL,
    `byte_size` INTEGER NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `enc_iv` BINARY(12) NOT NULL,
    `enc_tag` BINARY(16) NOT NULL,
    `enc_key_version` SMALLINT NOT NULL,
    `quality` JSON NOT NULL,
    `captured_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `face_enrollment_images_face_profile_id_angle_key`(`face_profile_id`, `angle`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `face_embeddings` (
    `id` CHAR(36) NOT NULL,
    `face_profile_id` CHAR(36) NOT NULL,
    `kind` ENUM('SAMPLE', 'CENTROID') NOT NULL,
    `angle` ENUM('FRONT', 'LEFT', 'RIGHT', 'UP', 'DOWN') NULL,
    `ciphertext` VARBINARY(2500) NOT NULL,
    `enc_iv` BINARY(12) NOT NULL,
    `enc_tag` BINARY(16) NOT NULL,
    `enc_key_version` SMALLINT NOT NULL,
    `dim` INTEGER NOT NULL,
    `model_name` VARCHAR(64) NOT NULL,
    `model_version` VARCHAR(32) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `face_embeddings_face_profile_id_kind_angle_key`(`face_profile_id`, `kind`, `angle`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verification_settings` (
    `id` CHAR(36) NOT NULL,
    `version` INTEGER NOT NULL,
    `is_active` BOOLEAN NOT NULL,
    `name` VARCHAR(120) NULL,
    `threshold_pct` DOUBLE NOT NULL,
    `interval_ms` INTEGER NOT NULL,
    `consecutive_mismatch_limit` INTEGER NOT NULL,
    `missing_face_limit` INTEGER NOT NULL,
    `multiple_faces_policy` ENUM('LOG_ONLY', 'ALERT_AFTER_CONSECUTIVE', 'ALERT_IMMEDIATELY') NOT NULL,
    `multiple_faces_consecutive_limit` INTEGER NOT NULL,
    `camera_failure_policy` ENUM('ALERT_AFTER_GRACE', 'ALERT_IMMEDIATELY') NOT NULL,
    `camera_grace_seconds` INTEGER NOT NULL,
    `service_failure_limit` INTEGER NOT NULL,
    `repeated_failure_limit` INTEGER NOT NULL,
    `recovery_match_count` INTEGER NOT NULL,
    `startup_grace_seconds` INTEGER NOT NULL,
    `pre_exam_required_matches` INTEGER NOT NULL,
    `min_face_quality` JSON NOT NULL,
    `severity_rules` JSON NOT NULL,
    `created_by` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `change_note` VARCHAR(255) NULL,

    UNIQUE INDEX `verification_settings_version_key`(`version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exams` (
    `id` CHAR(36) NOT NULL,
    `title` VARCHAR(180) NOT NULL,
    `description` TEXT NULL,
    `duration_minutes` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'DRAFT',
    `shuffle_questions` BOOLEAN NOT NULL DEFAULT false,
    `show_score_after_submit` BOOLEAN NOT NULL DEFAULT false,
    `verification_settings_id` CHAR(36) NULL,
    `created_by` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `exams_status_deleted_at_idx`(`status`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_questions` (
    `id` CHAR(36) NOT NULL,
    `exam_id` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL,
    `prompt` TEXT NOT NULL,
    `points` INTEGER NOT NULL DEFAULT 1,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `exam_questions_exam_id_position_idx`(`exam_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_question_options` (
    `id` CHAR(36) NOT NULL,
    `question_id` CHAR(36) NOT NULL,
    `position` INTEGER NOT NULL,
    `label` TEXT NOT NULL,
    `is_correct` BOOLEAN NOT NULL,

    UNIQUE INDEX `exam_question_options_question_id_position_key`(`question_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_sessions` (
    `id` CHAR(36) NOT NULL,
    `exam_id` CHAR(36) NOT NULL,
    `student_user_id` CHAR(36) NOT NULL,
    `face_profile_id` CHAR(36) NOT NULL,
    `settings_version_id` CHAR(36) NOT NULL,
    `settings_snapshot` JSON NOT NULL,
    `status` ENUM('PENDING_VERIFICATION', 'IN_PROGRESS', 'SUBMITTED', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'PENDING_VERIFICATION',
    `active_student_key` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `pre_verified_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,
    `submitted_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `cancelled_by` CHAR(36) NULL,
    `last_seen_at` DATETIME(3) NULL,
    `next_sequence_no` INTEGER NOT NULL DEFAULT 1,
    `total_attempts` INTEGER NOT NULL DEFAULT 0,
    `match_count` INTEGER NOT NULL DEFAULT 0,
    `mismatch_count` INTEGER NOT NULL DEFAULT 0,
    `no_face_count` INTEGER NOT NULL DEFAULT 0,
    `multi_face_count` INTEGER NOT NULL DEFAULT 0,
    `camera_error_count` INTEGER NOT NULL DEFAULT 0,
    `verification_error_count` INTEGER NOT NULL DEFAULT 0,
    `pre_exam_attempts` INTEGER NOT NULL DEFAULT 0,
    `pre_exam_consecutive_matches` INTEGER NOT NULL DEFAULT 0,
    `consecutive_match` INTEGER NOT NULL DEFAULT 0,
    `consecutive_mismatch` INTEGER NOT NULL DEFAULT 0,
    `consecutive_no_face` INTEGER NOT NULL DEFAULT 0,
    `consecutive_multi_face` INTEGER NOT NULL DEFAULT 0,
    `consecutive_service_error` INTEGER NOT NULL DEFAULT 0,
    `consecutive_non_match` INTEGER NOT NULL DEFAULT 0,
    `camera_error_since` DATETIME(3) NULL,
    `last_outcome` ENUM('MATCH', 'MISMATCH', 'NO_FACE', 'MULTIPLE_FACES', 'CAMERA_ERROR', 'VERIFICATION_ERROR') NULL,
    `last_similarity_pct` DOUBLE NULL,
    `last_verification_at` DATETIME(3) NULL,
    `score` INTEGER NULL,
    `max_score` INTEGER NULL,

    UNIQUE INDEX `exam_sessions_active_student_key_key`(`active_student_key`),
    INDEX `exam_sessions_status_idx`(`status`),
    INDEX `exam_sessions_exam_id_status_idx`(`exam_id`, `status`),
    INDEX `exam_sessions_student_user_id_created_at_idx`(`student_user_id`, `created_at`),
    INDEX `exam_sessions_last_seen_at_idx`(`last_seen_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `exam_answers` (
    `id` CHAR(36) NOT NULL,
    `session_id` CHAR(36) NOT NULL,
    `question_id` CHAR(36) NOT NULL,
    `option_id` CHAR(36) NULL,
    `answered_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `exam_answers_session_id_question_id_key`(`session_id`, `question_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verification_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `session_id` CHAR(36) NOT NULL,
    `student_user_id` CHAR(36) NOT NULL,
    `exam_id` CHAR(36) NOT NULL,
    `sequence_no` INTEGER NOT NULL,
    `phase` ENUM('PRE_EXAM', 'CONTINUOUS') NOT NULL,
    `outcome` ENUM('MATCH', 'MISMATCH', 'NO_FACE', 'MULTIPLE_FACES', 'CAMERA_ERROR', 'VERIFICATION_ERROR') NOT NULL,
    `error_code` VARCHAR(40) NOT NULL DEFAULT 'NONE',
    `similarity_raw` DOUBLE NULL,
    `similarity_pct` DOUBLE NULL,
    `threshold_pct` DOUBLE NOT NULL,
    `face_count` INTEGER NULL,
    `quality` JSON NULL,
    `vision_ms` INTEGER NULL,
    `processing_ms` INTEGER NOT NULL,
    `client_captured_at` DATETIME(3) NULL,
    `settings_version_id` CHAR(36) NOT NULL,
    `trigger_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `verification_logs_session_id_created_at_idx`(`session_id`, `created_at`),
    INDEX `verification_logs_student_user_id_created_at_idx`(`student_user_id`, `created_at`),
    INDEX `verification_logs_exam_id_created_at_idx`(`exam_id`, `created_at`),
    INDEX `verification_logs_outcome_created_at_idx`(`outcome`, `created_at`),
    INDEX `verification_logs_created_at_idx`(`created_at`),
    INDEX `verification_logs_trigger_id_idx`(`trigger_id`),
    UNIQUE INDEX `verification_logs_session_id_sequence_no_key`(`session_id`, `sequence_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `security_triggers` (
    `id` CHAR(36) NOT NULL,
    `incident_code` VARCHAR(24) NOT NULL,
    `session_id` CHAR(36) NOT NULL,
    `student_user_id` CHAR(36) NOT NULL,
    `exam_id` CHAR(36) NOT NULL,
    `trigger_type` ENUM('IDENTITY_MISMATCH', 'NO_FACE', 'MULTIPLE_FACES', 'CAMERA_DISCONNECTED', 'VERIFICATION_SERVICE_FAILURE', 'REPEATED_VERIFICATION_FAILURE') NOT NULL,
    `severity` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL,
    `status` ENUM('OPEN', 'ACKNOWLEDGED', 'REVIEWED') NOT NULL DEFAULT 'OPEN',
    `disposition` ENUM('CONFIRMED_CONCERN', 'FALSE_POSITIVE', 'INCONCLUSIVE') NULL,
    `active_dedupe_key` VARCHAR(80) NULL,
    `first_detected_at` DATETIME(3) NOT NULL,
    `last_detected_at` DATETIME(3) NOT NULL,
    `recovered_at` DATETIME(3) NULL,
    `occurrence_count` INTEGER NOT NULL DEFAULT 1,
    `first_similarity_pct` DOUBLE NULL,
    `worst_similarity_pct` DOUBLE NULL,
    `first_verification_log_id` BIGINT NOT NULL,
    `last_verification_log_id` BIGINT NOT NULL,
    `evidence_status` ENUM('CAPTURED', 'FAILED', 'NOT_AVAILABLE') NOT NULL,
    `evidence_failure_reason` VARCHAR(255) NULL,
    `acknowledged_by` CHAR(36) NULL,
    `acknowledged_at` DATETIME(3) NULL,
    `reviewed_by` CHAR(36) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `security_triggers_incident_code_key`(`incident_code`),
    UNIQUE INDEX `security_triggers_active_dedupe_key_key`(`active_dedupe_key`),
    INDEX `security_triggers_status_severity_idx`(`status`, `severity`),
    INDEX `security_triggers_session_id_idx`(`session_id`),
    INDEX `security_triggers_student_user_id_idx`(`student_user_id`),
    INDEX `security_triggers_exam_id_idx`(`exam_id`),
    INDEX `security_triggers_trigger_type_first_detected_at_idx`(`trigger_type`, `first_detected_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trigger_evidence` (
    `id` CHAR(36) NOT NULL,
    `trigger_id` CHAR(36) NOT NULL,
    `verification_log_id` BIGINT NOT NULL,
    `storage_path` VARCHAR(255) NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `mime` VARCHAR(32) NOT NULL,
    `byte_size` INTEGER NOT NULL,
    `width` INTEGER NOT NULL,
    `height` INTEGER NOT NULL,
    `enc_iv` BINARY(12) NOT NULL,
    `enc_tag` BINARY(16) NOT NULL,
    `enc_key_version` SMALLINT NOT NULL,
    `captured_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `trigger_evidence_trigger_id_key`(`trigger_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_investigation_logs` (
    `id` CHAR(36) NOT NULL,
    `trigger_id` CHAR(36) NOT NULL,
    `admin_user_id` CHAR(36) NOT NULL,
    `action` VARCHAR(30) NOT NULL,
    `note` TEXT NULL,
    `disposition` ENUM('CONFIRMED_CONCERN', 'FALSE_POSITIVE', 'INCONCLUSIVE') NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_investigation_logs_trigger_id_created_at_idx`(`trigger_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_audit_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `actor_user_id` CHAR(36) NULL,
    `actor_role` ENUM('STUDENT', 'ADMIN') NOT NULL,
    `action` VARCHAR(60) NOT NULL,
    `entity_type` VARCHAR(40) NOT NULL,
    `entity_id` VARCHAR(64) NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `request_id` VARCHAR(64) NULL,
    `ip_hash` CHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_audit_logs_action_created_at_idx`(`action`, `created_at`),
    INDEX `admin_audit_logs_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `admin_audit_logs_actor_user_id_created_at_idx`(`actor_user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `system_settings` (
    `key` VARCHAR(80) NOT NULL,
    `value` JSON NOT NULL,
    `updated_by` CHAR(36) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `data_deletion_requests` (
    `id` CHAR(36) NOT NULL,
    `student_user_id` CHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'FULFILLED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `reason` TEXT NULL,
    `requested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `handled_by` CHAR(36) NULL,
    `handled_at` DATETIME(3) NULL,
    `handlerNote` TEXT NULL,

    INDEX `data_deletion_requests_student_user_id_status_idx`(`student_user_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `student_profiles` ADD CONSTRAINT `student_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `consent_records` ADD CONSTRAINT `consent_records_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `face_profiles` ADD CONSTRAINT `face_profiles_student_user_id_fkey` FOREIGN KEY (`student_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `face_profiles` ADD CONSTRAINT `face_profiles_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `face_enrollment_images` ADD CONSTRAINT `face_enrollment_images_face_profile_id_fkey` FOREIGN KEY (`face_profile_id`) REFERENCES `face_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `face_embeddings` ADD CONSTRAINT `face_embeddings_face_profile_id_fkey` FOREIGN KEY (`face_profile_id`) REFERENCES `face_profiles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `verification_settings` ADD CONSTRAINT `verification_settings_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exams` ADD CONSTRAINT `exams_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exams` ADD CONSTRAINT `exams_verification_settings_id_fkey` FOREIGN KEY (`verification_settings_id`) REFERENCES `verification_settings`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_questions` ADD CONSTRAINT `exam_questions_exam_id_fkey` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_question_options` ADD CONSTRAINT `exam_question_options_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `exam_questions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_sessions` ADD CONSTRAINT `exam_sessions_exam_id_fkey` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_sessions` ADD CONSTRAINT `exam_sessions_student_user_id_fkey` FOREIGN KEY (`student_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_sessions` ADD CONSTRAINT `exam_sessions_cancelled_by_fkey` FOREIGN KEY (`cancelled_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_sessions` ADD CONSTRAINT `exam_sessions_face_profile_id_fkey` FOREIGN KEY (`face_profile_id`) REFERENCES `face_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_sessions` ADD CONSTRAINT `exam_sessions_settings_version_id_fkey` FOREIGN KEY (`settings_version_id`) REFERENCES `verification_settings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_answers` ADD CONSTRAINT `exam_answers_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `exam_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_answers` ADD CONSTRAINT `exam_answers_question_id_fkey` FOREIGN KEY (`question_id`) REFERENCES `exam_questions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `exam_answers` ADD CONSTRAINT `exam_answers_option_id_fkey` FOREIGN KEY (`option_id`) REFERENCES `exam_question_options`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `verification_logs` ADD CONSTRAINT `verification_logs_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `exam_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `verification_logs` ADD CONSTRAINT `verification_logs_student_user_id_fkey` FOREIGN KEY (`student_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `verification_logs` ADD CONSTRAINT `verification_logs_exam_id_fkey` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `verification_logs` ADD CONSTRAINT `verification_logs_settings_version_id_fkey` FOREIGN KEY (`settings_version_id`) REFERENCES `verification_settings`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `verification_logs` ADD CONSTRAINT `verification_logs_trigger_id_fkey` FOREIGN KEY (`trigger_id`) REFERENCES `security_triggers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `security_triggers` ADD CONSTRAINT `security_triggers_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `exam_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `security_triggers` ADD CONSTRAINT `security_triggers_student_user_id_fkey` FOREIGN KEY (`student_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `security_triggers` ADD CONSTRAINT `security_triggers_exam_id_fkey` FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `security_triggers` ADD CONSTRAINT `security_triggers_acknowledged_by_fkey` FOREIGN KEY (`acknowledged_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `security_triggers` ADD CONSTRAINT `security_triggers_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trigger_evidence` ADD CONSTRAINT `trigger_evidence_trigger_id_fkey` FOREIGN KEY (`trigger_id`) REFERENCES `security_triggers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trigger_evidence` ADD CONSTRAINT `trigger_evidence_verification_log_id_fkey` FOREIGN KEY (`verification_log_id`) REFERENCES `verification_logs`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_investigation_logs` ADD CONSTRAINT `admin_investigation_logs_trigger_id_fkey` FOREIGN KEY (`trigger_id`) REFERENCES `security_triggers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_investigation_logs` ADD CONSTRAINT `admin_investigation_logs_admin_user_id_fkey` FOREIGN KEY (`admin_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `admin_audit_logs` ADD CONSTRAINT `admin_audit_logs_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `data_deletion_requests` ADD CONSTRAINT `data_deletion_requests_student_user_id_fkey` FOREIGN KEY (`student_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `data_deletion_requests` ADD CONSTRAINT `data_deletion_requests_handled_by_fkey` FOREIGN KEY (`handled_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
