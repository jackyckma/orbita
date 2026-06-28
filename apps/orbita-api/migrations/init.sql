-- Orbita schema bootstrap (idempotent)
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key_prefix" text NOT NULL,
  "key_hash" text NOT NULL,
  "allowed_client_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);

CREATE TABLE IF NOT EXISTS "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" text NOT NULL,
  "agent_profile_id" text NOT NULL,
  "profile_snapshot" jsonb NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "token_count_estimate" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ended_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "sessions"("id") ON DELETE CASCADE,
  "sequence" integer NOT NULL,
  "role" text NOT NULL,
  "input" jsonb,
  "output" jsonb,
  "execution_meta" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "messages_session_sequence_idx" ON "messages" ("session_id", "sequence");

CREATE TABLE IF NOT EXISTS "client_memories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" text NOT NULL,
  "key" text NOT NULL,
  "content" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "client_memories_client_idx" ON "client_memories" ("client_id");

CREATE TABLE IF NOT EXISTS "trajectory_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "client_id" text NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "trajectory_session_idx" ON "trajectory_events" ("session_id", "created_at");

CREATE TABLE IF NOT EXISTS "session_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL,
  "client_id" text NOT NULL,
  "every_seconds" integer NOT NULL,
  "task" jsonb NOT NULL,
  "output_routing" jsonb NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "last_run_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" text NOT NULL,
  "name" text NOT NULL,
  "secret_ciphertext" text NOT NULL,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "credentials_client_name_unique" UNIQUE("client_id", "name")
);

CREATE INDEX IF NOT EXISTS "credentials_client_idx" ON "credentials" ("client_id");

-- W6: context compression + pgvector memory
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "context_summary" text;

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "client_memories" ADD COLUMN IF NOT EXISTS "embedding" vector(1024);

CREATE UNIQUE INDEX IF NOT EXISTS "client_memories_client_key_unique"
  ON "client_memories" ("client_id", "key");

-- W7: scheduler cron + rate limiting
ALTER TABLE "session_jobs" ALTER COLUMN "every_seconds" DROP NOT NULL;
ALTER TABLE "session_jobs" ADD COLUMN IF NOT EXISTS "cron" text;
ALTER TABLE "session_jobs" ADD COLUMN IF NOT EXISTS "next_run_at" timestamp with time zone;

ALTER TABLE "api_keys" ADD COLUMN IF NOT EXISTS "rate_limit_per_minute" integer;

CREATE TABLE IF NOT EXISTS "rate_limit_counters" (
  "key_id" uuid NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  PRIMARY KEY ("key_id", "window_start")
);

-- W11: admin-editable deployment settings
CREATE TABLE IF NOT EXISTS "deployment_settings" (
  "key" text PRIMARY KEY NOT NULL,
  "value" jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- W12: admin device authorization flow
CREATE TABLE IF NOT EXISTS "device_auth_requests" (
  "device_code" text PRIMARY KEY NOT NULL,
  "user_code" text NOT NULL UNIQUE,
  "status" text DEFAULT 'pending' NOT NULL,
  "session_token" text,
  "expires_at" timestamp with time zone NOT NULL,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Phase 1: hosted API waitlist
CREATE TABLE IF NOT EXISTS "waitlist_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "message" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "approved_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "waitlist_entries_email_lower_unique"
  ON "waitlist_entries" (lower("email"));

-- W27: Harness (Loop Engineering infrastructure)
CREATE TABLE IF NOT EXISTS "harnesses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" text NOT NULL,
  "name" text NOT NULL,
  "template_id" text NOT NULL,
  "template_version" text DEFAULT '1' NOT NULL,
  "config_version" text DEFAULT '1' NOT NULL,
  "config" jsonb NOT NULL,
  "session_id" uuid NOT NULL,
  "cron" text,
  "timezone" text DEFAULT 'UTC' NOT NULL,
  "next_run_at" timestamp with time zone,
  "last_run_at" timestamp with time zone,
  "session_memory_key" text,
  "feedback_memory_key" text,
  "enabled" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "harnesses_client_idx" ON "harnesses" ("client_id", "enabled");

CREATE TABLE IF NOT EXISTS "harness_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "harness_id" uuid NOT NULL,
  "client_id" text NOT NULL,
  "session_id" uuid NOT NULL,
  "status" text NOT NULL,
  "trigger" text NOT NULL,
  "cron_fingerprint" text,
  "error" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "harness_runs_idempotency_idx"
  ON "harness_runs" ("harness_id", "cron_fingerprint");
