-- W32: memory graph — notes + links
CREATE TABLE IF NOT EXISTS "notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" text NOT NULL,
  "title" text,
  "body" text NOT NULL,
  "frontmatter" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "embedding" vector(1024),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "notes_client_idx" ON "notes" ("client_id", "updated_at" DESC);

CREATE TABLE IF NOT EXISTS "note_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" text NOT NULL,
  "from_id" uuid NOT NULL REFERENCES "notes"("id") ON DELETE CASCADE,
  "to_id" uuid NOT NULL REFERENCES "notes"("id") ON DELETE CASCADE,
  "rel" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "note_links_unique" UNIQUE ("client_id", "from_id", "to_id", "rel")
);

CREATE INDEX IF NOT EXISTS "note_links_from_idx" ON "note_links" ("client_id", "from_id");
CREATE INDEX IF NOT EXISTS "note_links_to_idx" ON "note_links" ("client_id", "to_id");
