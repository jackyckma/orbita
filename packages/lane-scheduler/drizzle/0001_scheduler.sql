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
