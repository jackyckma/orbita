-- E-17: agent principals lane (optional — applied when ORBITA_AGENT_PRINCIPALS_ENABLED=1)
CREATE TABLE IF NOT EXISTS "agent_principals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" text NOT NULL,
  "kind" text NOT NULL,
  "name" text NOT NULL,
  "bound_api_key_id" text NOT NULL,
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "mandate_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "agent_principals_client_api_key_unique" ON "agent_principals" ("client_id", "bound_api_key_id");
CREATE INDEX IF NOT EXISTS "agent_principals_client_list_idx" ON "agent_principals" ("client_id", "created_at" ASC, "id" ASC);

CREATE TABLE IF NOT EXISTS "agent_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "principal_id" uuid NOT NULL,
  "client_id" text NOT NULL,
  "surface" text NOT NULL,
  "operation" text NOT NULL,
  "decision" text NOT NULL,
  "reason_code" text NOT NULL,
  "at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "agent_audit_client_principal_idx" ON "agent_audit" ("client_id", "principal_id", "at" DESC);
CREATE INDEX IF NOT EXISTS "agent_audit_client_at_idx" ON "agent_audit" ("client_id", "at" DESC);
