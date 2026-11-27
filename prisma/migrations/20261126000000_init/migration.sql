-- CreateTable: users
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(64) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" VARCHAR(32) NOT NULL DEFAULT 'OPERATOR',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable: credential_metadata
CREATE TABLE "credential_metadata" (
    "id" UUID NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "algorithm" VARCHAR(32) NOT NULL DEFAULT 'AES-256-GCM',
    "iv_hex" VARCHAR(64) NOT NULL,
    "auth_tag_hex" VARCHAR(64) NOT NULL,
    "ciphertext_hex" TEXT NOT NULL,
    "secret_type" VARCHAR(32) NOT NULL DEFAULT 'PASSWORD',
    "fingerprint_sha256" VARCHAR(64) NOT NULL,
    "rotated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "credential_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable: accounts
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "roblox_username" VARCHAR(64) NOT NULL,
    "roblox_user_id" VARCHAR(64),
    "credential_id" UUID,
    "category" VARCHAR(64) NOT NULL DEFAULT 'STANDARD',
    "registration_status" VARCHAR(32) NOT NULL DEFAULT 'REGISTERED',
    "verification_status" VARCHAR(32) NOT NULL DEFAULT 'UNVERIFIED',
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: account_generation_jobs
CREATE TABLE "account_generation_jobs" (
    "id" UUID NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "total_count" INTEGER NOT NULL DEFAULT 0,
    "processed_count" INTEGER NOT NULL DEFAULT 0,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "verification_required_count" INTEGER NOT NULL DEFAULT 0,
    "config_json" TEXT NOT NULL DEFAULT '{}',
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "paused_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "account_generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: generated_account_data
CREATE TABLE "generated_account_data" (
    "id" UUID NOT NULL,
    "job_id" UUID,
    "candidate_username" VARCHAR(64) NOT NULL,
    "prefix" VARCHAR(32),
    "suffix" VARCHAR(32),
    "length" INTEGER NOT NULL,
    "credential_id" UUID,
    "validation_status" VARCHAR(32) NOT NULL DEFAULT 'VALID',
    "validation_errors" TEXT,
    "registration_state" VARCHAR(32) NOT NULL DEFAULT 'GENERATED_CANDIDATE',
    "account_id" UUID,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "generated_account_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable: registration_events
CREATE TABLE "registration_events" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "account_id" UUID,
    "job_id" UUID,
    "event_type" VARCHAR(64) NOT NULL,
    "status_before" VARCHAR(32),
    "status_after" VARCHAR(32) NOT NULL,
    "roblox_user_id" VARCHAR(64),
    "roblox_username" VARCHAR(64),
    "notes" TEXT,
    "performed_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "registration_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable: activity_logs
CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" VARCHAR(64),
    "details_json" TEXT NOT NULL DEFAULT '{}',
    "ip_address" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- Unique Indexes
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "accounts_roblox_username_key" ON "accounts"("roblox_username");
CREATE UNIQUE INDEX "accounts_roblox_user_id_key" ON "accounts"("roblox_user_id");
CREATE UNIQUE INDEX "accounts_credential_id_key" ON "accounts"("credential_id");
CREATE UNIQUE INDEX "generated_account_data_candidate_username_key" ON "generated_account_data"("candidate_username");
CREATE UNIQUE INDEX "generated_account_data_credential_id_key" ON "generated_account_data"("credential_id");
CREATE UNIQUE INDEX "generated_account_data_account_id_key" ON "generated_account_data"("account_id");

-- Performance Indexes
CREATE INDEX "users_role_is_active_idx" ON "users"("role", "is_active");
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");
CREATE INDEX "credential_metadata_fingerprint_sha256_idx" ON "credential_metadata"("fingerprint_sha256");
CREATE INDEX "credential_metadata_secret_type_deleted_at_idx" ON "credential_metadata"("secret_type", "deleted_at");
CREATE INDEX "accounts_category_registration_status_verification_status_idx" ON "accounts"("category", "registration_status", "verification_status");
CREATE INDEX "accounts_created_at_idx" ON "accounts"("created_at");
CREATE INDEX "accounts_deleted_at_idx" ON "accounts"("deleted_at");
CREATE INDEX "account_generation_jobs_status_created_at_idx" ON "account_generation_jobs"("status", "created_at");
CREATE INDEX "account_generation_jobs_created_by_id_idx" ON "account_generation_jobs"("created_by_id");
CREATE INDEX "generated_account_data_job_id_registration_state_idx" ON "generated_account_data"("job_id", "registration_state");
CREATE INDEX "generated_account_data_validation_status_idx" ON "generated_account_data"("validation_status");
CREATE INDEX "generated_account_data_created_at_idx" ON "generated_account_data"("created_at");
CREATE INDEX "registration_events_candidate_id_created_at_idx" ON "registration_events"("candidate_id", "created_at");
CREATE INDEX "registration_events_job_id_event_type_idx" ON "registration_events"("job_id", "event_type");
CREATE INDEX "registration_events_account_id_idx" ON "registration_events"("account_id");
CREATE INDEX "activity_logs_action_entity_type_idx" ON "activity_logs"("action", "entity_type");
CREATE INDEX "activity_logs_user_id_created_at_idx" ON "activity_logs"("user_id", "created_at");
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at");

-- Foreign Keys
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credential_metadata"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "account_generation_jobs" ADD CONSTRAINT "account_generation_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "generated_account_data" ADD CONSTRAINT "generated_account_data_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "account_generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generated_account_data" ADD CONSTRAINT "generated_account_data_credential_id_fkey" FOREIGN KEY ("credential_id") REFERENCES "credential_metadata"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "generated_account_data" ADD CONSTRAINT "generated_account_data_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "registration_events" ADD CONSTRAINT "registration_events_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "generated_account_data"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "registration_events" ADD CONSTRAINT "registration_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "registration_events" ADD CONSTRAINT "registration_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "account_generation_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "registration_events" ADD CONSTRAINT "registration_events_performed_by_id_fkey" FOREIGN KEY ("performed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
