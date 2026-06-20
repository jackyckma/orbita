CREATE TABLE IF NOT EXISTS "client_memories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" text NOT NULL,
  "key" text NOT NULL,
  "content" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "client_memories_client_idx" ON "client_memories" ("client_id");
