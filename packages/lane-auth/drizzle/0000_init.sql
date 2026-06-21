CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key_prefix" text NOT NULL,
  "key_hash" text NOT NULL,
  "allowed_client_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "rate_limit_per_minute" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);

CREATE TABLE IF NOT EXISTS "rate_limit_counters" (
  "key_id" uuid NOT NULL REFERENCES "api_keys"("id") ON DELETE CASCADE,
  "window_start" timestamp with time zone NOT NULL,
  "count" integer DEFAULT 1 NOT NULL,
  PRIMARY KEY("key_id", "window_start")
);
