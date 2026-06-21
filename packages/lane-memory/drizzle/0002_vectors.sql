CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "client_memories" ADD COLUMN IF NOT EXISTS "embedding" vector(1024);

CREATE UNIQUE INDEX IF NOT EXISTS "client_memories_client_key_unique"
  ON "client_memories" ("client_id", "key");
