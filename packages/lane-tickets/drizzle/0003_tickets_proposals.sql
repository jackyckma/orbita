-- T-0097: proposal decisions + inputs_from (additive)
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
