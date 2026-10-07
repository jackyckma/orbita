-- optional-tickets: E-16 tickets lane (applied when ORBITA_TICKETS_ENABLED=1)
CREATE TABLE IF NOT EXISTS "tickets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" text NOT NULL,
  "project" text NOT NULL,
  "function" text NOT NULL,
  "kind" text NOT NULL,
  "parent_id" uuid,
  "title" text NOT NULL,
  "description" text,
  "status" text NOT NULL,
  "owner" text,
  "requester" text,
  "priority" integer,
  "next_action" text,
  "blocked_on" text,
  "risk_tier" text,
  "source" text NOT NULL DEFAULT 'native',
  "source_ref" text,
  "git_ref" text,
  "synced_at" timestamp with time zone,
  "sync_state" text,
  "version" integer NOT NULL DEFAULT 1,
  "lease_holder" text,
  "lease_expires_at" timestamp with time zone,
  "charter" jsonb,
  "acceptance_criteria" jsonb,
  "data" jsonb,
  "task_class" text DEFAULT 'planned',
  "exception_type" text,
  "requires_review" boolean NOT NULL DEFAULT false,
  "reviewed_at" timestamp with time zone,
  "reviewed_by" jsonb,
  "review_outcome" text,
  "mandate_id" uuid,
  "mandate_status" text,
  "mandate_counters" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "last_event_seq" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "tickets_client_list_idx" ON "tickets" ("client_id", "updated_at" ASC, "id" ASC);
CREATE INDEX IF NOT EXISTS "tickets_client_project_idx" ON "tickets" ("client_id", "project");
CREATE INDEX IF NOT EXISTS "tickets_mandate_subtree_idx" ON "tickets" ("client_id", "mandate_id");

CREATE TABLE IF NOT EXISTS "ticket_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL REFERENCES "tickets"("id") ON DELETE CASCADE,
  "client_id" text NOT NULL,
  "seq" integer NOT NULL,
  "actor" jsonb NOT NULL,
  "verb" text NOT NULL,
  "from_status" text,
  "to_status" text,
  "payload" jsonb,
  "at" timestamp with time zone NOT NULL,
  CONSTRAINT "ticket_events_client_ticket_seq_unique" UNIQUE ("client_id", "ticket_id", "seq")
);

CREATE INDEX IF NOT EXISTS "ticket_events_ticket_idx" ON "ticket_events" ("client_id", "ticket_id", "seq" ASC);

CREATE TABLE IF NOT EXISTS "ticket_idempotency" (
  "client_id" text NOT NULL,
  "verb" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "response_json" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("client_id", "verb", "idempotency_key")
);

ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "task_class" text DEFAULT 'planned';
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "exception_type" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "requires_review" boolean NOT NULL DEFAULT false;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "reviewed_at" timestamp with time zone;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "reviewed_by" jsonb;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "review_outcome" text;

CREATE INDEX IF NOT EXISTS "tickets_client_review_queue_idx"
  ON "tickets" ("client_id", "requires_review", "reviewed_at");

ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "decision_class" text DEFAULT 'question';
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "proposal_type" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "proposal_target" jsonb;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "suggested_change" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "rationale" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "proposal_outcome" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "proposal_response" text;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "result_refs" jsonb;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "inputs_from" jsonb;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "proposer_api_key_id" text;

CREATE INDEX IF NOT EXISTS "tickets_proposal_inbox_idx"
  ON "tickets" ("client_id", "decision_class", "status")
  WHERE decision_class = 'proposal';
