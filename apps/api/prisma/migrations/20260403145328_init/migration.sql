-- CreateTable
CREATE TABLE `organizations` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(255) NOT NULL,
    `short_name` VARCHAR(100) NULL,
    `org_code` VARCHAR(50) NULL,
    `org_type` VARCHAR(50) NOT NULL DEFAULT 'school',
    `address` TEXT NULL,
    `province` VARCHAR(100) NULL,
    `district` VARCHAR(100) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organization_profiles` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `organization_id` BIGINT NOT NULL,
    `profile_year` INTEGER NOT NULL,
    `school_size` VARCHAR(20) NULL,
    `student_count` INTEGER NULL,
    `teacher_count` INTEGER NULL,
    `classroom_count` INTEGER NULL,
    `internet_quality` VARCHAR(20) NULL,
    `budget_level` VARCHAR(20) NULL,
    `geography_type` VARCHAR(30) NULL,
    `socioeconomic_level` VARCHAR(20) NULL,
    `language_context` VARCHAR(50) NULL,
    `special_constraints` TEXT NULL,
    `strategic_strengths` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `context_dimensions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `dimension_code` VARCHAR(50) NOT NULL,
    `dimension_name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `scale_min` DOUBLE NOT NULL DEFAULT 1,
    `scale_max` DOUBLE NOT NULL DEFAULT 5,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `context_dimensions_dimension_code_key`(`dimension_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organization_context_scores` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `organization_id` BIGINT NOT NULL,
    `dimension_id` BIGINT NOT NULL,
    `score` DOUBLE NOT NULL,
    `level` VARCHAR(20) NULL,
    `note` TEXT NULL,
    `scored_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `topics` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `topic_code` VARCHAR(50) NOT NULL,
    `topic_name_th` VARCHAR(255) NOT NULL,
    `topic_name_en` VARCHAR(255) NULL,
    `parent_topic_id` BIGINT NULL,
    `level` INTEGER NOT NULL DEFAULT 1,
    `description` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `topics_topic_code_key`(`topic_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documents` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `document_code` VARCHAR(100) NULL,
    `title` VARCHAR(500) NOT NULL,
    `source_type` VARCHAR(50) NOT NULL,
    `document_type` VARCHAR(50) NOT NULL,
    `source_channel` VARCHAR(50) NULL,
    `issuing_authority` VARCHAR(255) NULL,
    `source_url` VARCHAR(1000) NULL,
    `language` VARCHAR(10) NULL DEFAULT 'th',
    `jurisdiction` VARCHAR(50) NULL,
    `published_at` DATETIME(3) NULL,
    `effective_date` DATETIME(3) NULL,
    `expiry_date` DATETIME(3) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'active',
    `trust_level` DOUBLE NULL,
    `freshness_score` DOUBLE NULL,
    `summary_text` TEXT NULL,
    `full_text` LONGTEXT NULL,
    `storage_path` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `documents_source_type_idx`(`source_type`),
    INDEX `documents_document_type_idx`(`document_type`),
    INDEX `documents_published_at_idx`(`published_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_topics` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `document_id` BIGINT NOT NULL,
    `topic_id` BIGINT NOT NULL,
    `relevance_score` DOUBLE NULL,

    INDEX `document_topics_document_id_idx`(`document_id`),
    INDEX `document_topics_topic_id_idx`(`topic_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_chunks` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `document_id` BIGINT NOT NULL,
    `chunk_index` INTEGER NOT NULL,
    `chunk_text` TEXT NOT NULL,
    `token_count` INTEGER NULL,
    `page_no` INTEGER NULL,
    `section_title` VARCHAR(255) NULL,
    `semantic_label` VARCHAR(100) NULL,
    `embedding_id` VARCHAR(100) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `document_chunks_document_id_idx`(`document_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `horizon_items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `document_id` BIGINT NOT NULL,
    `item_type` VARCHAR(50) NOT NULL,
    `scope` VARCHAR(50) NULL,
    `country_code` VARCHAR(10) NULL,
    `sector` VARCHAR(50) NULL,
    `implementation_stage` VARCHAR(30) NULL,
    `evidence_strength` VARCHAR(20) NULL,
    `budget_requirement` VARCHAR(20) NULL,
    `tech_requirement` VARCHAR(20) NULL,
    `scalability` VARCHAR(20) NULL,
    `summary` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `horizon_item_topics` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `horizon_item_id` BIGINT NOT NULL,
    `topic_id` BIGINT NOT NULL,
    `relevance` DOUBLE NULL DEFAULT 1.0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `horizon_practices` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `horizon_item_id` BIGINT NOT NULL,
    `practice_title` VARCHAR(500) NOT NULL,
    `problem_addressed` TEXT NULL,
    `target_group` VARCHAR(255) NULL,
    `implementation_method` TEXT NULL,
    `required_capabilities` TEXT NULL,
    `expected_outcomes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `horizon_context_fit_rules` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `horizon_item_id` BIGINT NOT NULL,
    `practice_id` BIGINT NULL,
    `dimension_id` BIGINT NOT NULL,
    `min_score` DOUBLE NOT NULL DEFAULT 1,
    `max_score` DOUBLE NOT NULL DEFAULT 5,
    `fit_note` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `policy_items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `document_id` BIGINT NOT NULL,
    `policy_type` VARCHAR(50) NOT NULL,
    `issuing_authority` VARCHAR(255) NULL,
    `jurisdiction_level` VARCHAR(30) NULL,
    `policy_number` VARCHAR(100) NULL,
    `effective_status` VARCHAR(30) NOT NULL DEFAULT 'active',
    `supersedes_policy_id` BIGINT NULL,
    `mandatory_level` VARCHAR(20) NULL,
    `compliance_risk_level` VARCHAR(20) NULL,
    `summary_for_action` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `policy_clauses` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `policy_item_id` BIGINT NOT NULL,
    `clause_code` VARCHAR(50) NOT NULL,
    `clause_text` TEXT NOT NULL,
    `obligation_type` VARCHAR(30) NULL,
    `action_required` VARCHAR(100) NULL,
    `responsible_role` VARCHAR(100) NULL,
    `applicable_context` VARCHAR(100) NULL,
    `trigger_condition` TEXT NULL,
    `penalty_if_ignored` TEXT NULL,
    `remediation_note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `policy_clause_topics` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `clause_id` BIGINT NOT NULL,
    `topic_id` BIGINT NOT NULL,
    `relevance` DOUBLE NULL DEFAULT 1.0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `policy_applicability_rules` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `clause_id` BIGINT NOT NULL,
    `org_type` VARCHAR(50) NULL,
    `dimension_id` BIGINT NULL,
    `min_score` DOUBLE NULL,
    `max_score` DOUBLE NULL,
    `condition` TEXT NULL,
    `recommended_note` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inbound_cases` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `organization_id` BIGINT NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` LONGTEXT NULL,
    `source_document_id` BIGINT NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `due_date` DATETIME(3) NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'new',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `case_topics` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `inbound_case_id` BIGINT NOT NULL,
    `topic_id` BIGINT NOT NULL,
    `relevance_score` DOUBLE NULL,

    INDEX `case_topics_inbound_case_id_idx`(`inbound_case_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `case_retrieval_results` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `inbound_case_id` BIGINT NOT NULL,
    `source_type` VARCHAR(50) NOT NULL,
    `source_record_id` BIGINT NOT NULL,
    `retrieval_rank` INTEGER NOT NULL DEFAULT 1,
    `semantic_score` DOUBLE NULL,
    `trust_score` DOUBLE NULL,
    `freshness_score` DOUBLE NULL,
    `context_fit_score` DOUBLE NULL,
    `final_score` DOUBLE NULL,
    `rationale` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `case_retrieval_results_inbound_case_id_idx`(`inbound_case_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `case_options` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `inbound_case_id` BIGINT NOT NULL,
    `option_code` VARCHAR(5) NOT NULL,
    `title` VARCHAR(500) NOT NULL,
    `description` LONGTEXT NULL,
    `implementation_steps` TEXT NULL,
    `expected_benefits` TEXT NULL,
    `risks` TEXT NULL,
    `policy_compliance_note` TEXT NULL,
    `context_fit_note` TEXT NULL,
    `feasibility_score` DOUBLE NULL,
    `innovation_score` DOUBLE NULL,
    `compliance_score` DOUBLE NULL,
    `overall_score` DOUBLE NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `case_options_inbound_case_id_idx`(`inbound_case_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `case_option_references` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `case_option_id` BIGINT NOT NULL,
    `reference_type` VARCHAR(50) NOT NULL,
    `source_record_id` BIGINT NOT NULL,
    `citation_text` TEXT NULL,
    `contribution_note` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `line_channels` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `channel_name` VARCHAR(100) NOT NULL,
    `line_channel_id` VARCHAR(100) NOT NULL,
    `line_channel_secret` VARCHAR(255) NOT NULL,
    `line_channel_access_token` TEXT NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `line_users` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `line_channel_id` BIGINT NOT NULL,
    `line_user_id` VARCHAR(100) NOT NULL,
    `display_name` VARCHAR(255) NULL,
    `picture_url` VARCHAR(500) NULL,
    `organization_id` BIGINT NULL,
    `role_code` VARCHAR(50) NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `line_users_line_user_id_key`(`line_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `line_events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `line_channel_id` BIGINT NOT NULL,
    `webhook_event_id` VARCHAR(100) NOT NULL,
    `line_user_id` VARCHAR(100) NOT NULL,
    `event_type` VARCHAR(50) NOT NULL,
    `message_id` VARCHAR(100) NULL,
    `message_type` VARCHAR(50) NULL,
    `reply_token` VARCHAR(255) NULL,
    `raw_payload_json` LONGTEXT NOT NULL,
    `is_redelivery` BOOLEAN NOT NULL DEFAULT false,
    `receive_status` VARCHAR(30) NOT NULL DEFAULT 'received',
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processed_at` DATETIME(3) NULL,

    UNIQUE INDEX `line_events_webhook_event_id_key`(`webhook_event_id`),
    INDEX `line_events_line_user_id_idx`(`line_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_intakes` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `source_channel` VARCHAR(50) NOT NULL,
    `line_event_id` BIGINT NULL,
    `line_user_id_ref` BIGINT NULL,
    `organization_id` BIGINT NULL,
    `original_file_name` VARCHAR(255) NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `file_extension` VARCHAR(20) NULL,
    `file_size` BIGINT NULL,
    `storage_path` VARCHAR(500) NULL,
    `sha256` VARCHAR(64) NULL,
    `google_drive_file_id` VARCHAR(255) NULL,
    `google_drive_folder_id` VARCHAR(255) NULL,
    `upload_status` VARCHAR(30) NOT NULL DEFAULT 'received',
    `ocr_status` VARCHAR(30) NOT NULL DEFAULT 'pending',
    `classifier_status` VARCHAR(30) NOT NULL DEFAULT 'pending',
    `ai_status` VARCHAR(30) NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `document_ai_results` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `document_intake_id` BIGINT NOT NULL,
    `is_official_document` BOOLEAN NULL,
    `classification_label` VARCHAR(50) NULL,
    `classification_confidence` DOUBLE NULL,
    `issuing_authority` VARCHAR(255) NULL,
    `document_no` VARCHAR(100) NULL,
    `document_date` DATETIME(3) NULL,
    `subject_text` TEXT NULL,
    `summary_text` LONGTEXT NULL,
    `extracted_text` LONGTEXT NULL,
    `deadline_date` DATETIME(3) NULL,
    `next_action_json` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `document_ai_results_document_intake_id_key`(`document_intake_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `line_conversation_sessions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `line_user_id_ref` BIGINT NOT NULL,
    `document_intake_id` BIGINT NULL,
    `session_type` VARCHAR(50) NOT NULL,
    `current_step` VARCHAR(100) NULL,
    `context_json` LONGTEXT NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'open',
    `expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `line_session_actions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `session_id` BIGINT NOT NULL,
    `action_code` VARCHAR(50) NOT NULL,
    `action_label` VARCHAR(255) NOT NULL,
    `payload_json` LONGTEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `organization_profiles` ADD CONSTRAINT `organization_profiles_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `organization_context_scores` ADD CONSTRAINT `organization_context_scores_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `organization_context_scores` ADD CONSTRAINT `organization_context_scores_dimension_id_fkey` FOREIGN KEY (`dimension_id`) REFERENCES `context_dimensions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `topics` ADD CONSTRAINT `topics_parent_topic_id_fkey` FOREIGN KEY (`parent_topic_id`) REFERENCES `topics`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_topics` ADD CONSTRAINT `document_topics_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_topics` ADD CONSTRAINT `document_topics_topic_id_fkey` FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_chunks` ADD CONSTRAINT `document_chunks_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `horizon_items` ADD CONSTRAINT `horizon_items_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `horizon_item_topics` ADD CONSTRAINT `horizon_item_topics_horizon_item_id_fkey` FOREIGN KEY (`horizon_item_id`) REFERENCES `horizon_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `horizon_item_topics` ADD CONSTRAINT `horizon_item_topics_topic_id_fkey` FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `horizon_practices` ADD CONSTRAINT `horizon_practices_horizon_item_id_fkey` FOREIGN KEY (`horizon_item_id`) REFERENCES `horizon_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `horizon_context_fit_rules` ADD CONSTRAINT `horizon_context_fit_rules_horizon_item_id_fkey` FOREIGN KEY (`horizon_item_id`) REFERENCES `horizon_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `horizon_context_fit_rules` ADD CONSTRAINT `horizon_context_fit_rules_practice_id_fkey` FOREIGN KEY (`practice_id`) REFERENCES `horizon_practices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_items` ADD CONSTRAINT `policy_items_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_clauses` ADD CONSTRAINT `policy_clauses_policy_item_id_fkey` FOREIGN KEY (`policy_item_id`) REFERENCES `policy_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_clause_topics` ADD CONSTRAINT `policy_clause_topics_clause_id_fkey` FOREIGN KEY (`clause_id`) REFERENCES `policy_clauses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_clause_topics` ADD CONSTRAINT `policy_clause_topics_topic_id_fkey` FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `policy_applicability_rules` ADD CONSTRAINT `policy_applicability_rules_clause_id_fkey` FOREIGN KEY (`clause_id`) REFERENCES `policy_clauses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inbound_cases` ADD CONSTRAINT `inbound_cases_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inbound_cases` ADD CONSTRAINT `inbound_cases_source_document_id_fkey` FOREIGN KEY (`source_document_id`) REFERENCES `documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_topics` ADD CONSTRAINT `case_topics_inbound_case_id_fkey` FOREIGN KEY (`inbound_case_id`) REFERENCES `inbound_cases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_topics` ADD CONSTRAINT `case_topics_topic_id_fkey` FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_retrieval_results` ADD CONSTRAINT `case_retrieval_results_inbound_case_id_fkey` FOREIGN KEY (`inbound_case_id`) REFERENCES `inbound_cases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_options` ADD CONSTRAINT `case_options_inbound_case_id_fkey` FOREIGN KEY (`inbound_case_id`) REFERENCES `inbound_cases`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `case_option_references` ADD CONSTRAINT `case_option_references_case_option_id_fkey` FOREIGN KEY (`case_option_id`) REFERENCES `case_options`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `line_users` ADD CONSTRAINT `line_users_line_channel_id_fkey` FOREIGN KEY (`line_channel_id`) REFERENCES `line_channels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `line_users` ADD CONSTRAINT `line_users_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `line_events` ADD CONSTRAINT `line_events_line_channel_id_fkey` FOREIGN KEY (`line_channel_id`) REFERENCES `line_channels`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_intakes` ADD CONSTRAINT `document_intakes_line_event_id_fkey` FOREIGN KEY (`line_event_id`) REFERENCES `line_events`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_intakes` ADD CONSTRAINT `document_intakes_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `document_ai_results` ADD CONSTRAINT `document_ai_results_document_intake_id_fkey` FOREIGN KEY (`document_intake_id`) REFERENCES `document_intakes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `line_conversation_sessions` ADD CONSTRAINT `line_conversation_sessions_line_user_id_ref_fkey` FOREIGN KEY (`line_user_id_ref`) REFERENCES `line_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `line_conversation_sessions` ADD CONSTRAINT `line_conversation_sessions_document_intake_id_fkey` FOREIGN KEY (`document_intake_id`) REFERENCES `document_intakes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `line_session_actions` ADD CONSTRAINT `line_session_actions_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `line_conversation_sessions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
