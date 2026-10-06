-- T-0096: exception tasks + integrator review queue columns (additive)
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "task_class" text DEFAULT 'planned';
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "exception_type" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "requires_review" boolean NOT NULL DEFAULT false;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "reviewed_by" jsonb;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "review_outcome" text;

CREATE INDEX IF NOT EXISTS "tickets_client_review_queue_idx"
  ON "tickets" ("client_id", "requires_review", "reviewed_at");
