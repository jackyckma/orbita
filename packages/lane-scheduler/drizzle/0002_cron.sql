ALTER TABLE "session_jobs" ALTER COLUMN "every_seconds" DROP NOT NULL;
ALTER TABLE "session_jobs" ADD COLUMN IF NOT EXISTS "cron" text;
ALTER TABLE "session_jobs" ADD COLUMN IF NOT EXISTS "next_run_at" timestamp with time zone;
