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
