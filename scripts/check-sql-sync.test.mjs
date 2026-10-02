import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  checkSqlSync,
  diffLaneAgainstInit,
  emptySnapshot,
  mergeInto,
  parseSqlStatements,
} from "./check-sql-sync.mjs";

test("parseSqlStatements extracts table columns and indexes", () => {
  const sql = `
CREATE TABLE IF NOT EXISTS "widgets" (
  "id" uuid PRIMARY KEY,
  "name" text NOT NULL
);
ALTER TABLE "widgets" ADD COLUMN IF NOT EXISTS "extra" text;
CREATE UNIQUE INDEX IF NOT EXISTS "widgets_name_idx" ON "widgets" ("name");
`;
  const snap = parseSqlStatements(sql);
  assert.equal(snap.tables.has("widgets"), true);
  assert.deepEqual([...snap.columns.get("widgets")].sort(), ["extra", "id", "name"]);
  assert.equal(snap.indexes.has("widgets_name_idx"), true);
});

test("diffLaneAgainstInit reports missing column", () => {
  const lane = parseSqlStatements(`
CREATE TABLE IF NOT EXISTS "items" ("id" uuid NOT NULL);
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "orphan_col" text;
`);
  const init = parseSqlStatements(`
CREATE TABLE IF NOT EXISTS "items" ("id" uuid NOT NULL);
`);
  const diff = diffLaneAgainstInit(lane, init);
  assert.deepEqual(diff.missingColumns, ["items.orphan_col"]);
  assert.deepEqual(diff.missingTables, []);
});

test("checkSqlSync fails on fixture with deliberate drift", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sql-sync-"));
  const root = tmp;
  fs.mkdirSync(path.join(root, "apps/orbita-api/migrations"), { recursive: true });
  fs.mkdirSync(path.join(root, "packages/lane-fixture/drizzle"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs/autopilot"), { recursive: true });

  fs.writeFileSync(
    path.join(root, "apps/orbita-api/migrations/init.sql"),
    `CREATE TABLE IF NOT EXISTS "items" (
  "id" uuid PRIMARY KEY NOT NULL
);`,
  );
  fs.writeFileSync(
    path.join(root, "packages/lane-fixture/drizzle/0001_items.sql"),
    `ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "missing_in_init" text;`,
  );
  fs.writeFileSync(path.join(root, "docs/autopilot/sql-sync-allowlist.json"), "[]");

  const pass = checkSqlSync({
    root,
    laneSqlFiles: ["packages/lane-fixture/drizzle/0001_items.sql"],
    harnessSchemaPath: path.join(root, "packages/lane-harness/src/db/schema.ts"),
  });
  assert.equal(pass.ok, false);
  assert.ok(pass.missingColumns.includes("items.missing_in_init"));

  const initSnap = parseSqlStatements(
    fs.readFileSync(path.join(root, "apps/orbita-api/migrations/init.sql"), "utf8"),
  );
  const laneSnap = emptySnapshot();
  mergeInto(
    laneSnap,
    parseSqlStatements(
      fs.readFileSync(path.join(root, "packages/lane-fixture/drizzle/0001_items.sql"), "utf8"),
    ),
  );
  initSnap.columns.get("items").add("missing_in_init");
  assert.deepEqual(diffLaneAgainstInit(laneSnap, initSnap).missingColumns, []);
});

test("checkSqlSync passes on fixture when init matches lane", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sql-sync-"));
  const root = tmp;
  fs.mkdirSync(path.join(root, "apps/orbita-api/migrations"), { recursive: true });
  fs.mkdirSync(path.join(root, "packages/lane-fixture/drizzle"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs/autopilot"), { recursive: true });

  const ddl = `CREATE TABLE IF NOT EXISTS "items" (
  "id" uuid PRIMARY KEY NOT NULL,
  "note" text
);`;
  fs.writeFileSync(path.join(root, "apps/orbita-api/migrations/init.sql"), ddl);
  fs.writeFileSync(path.join(root, "packages/lane-fixture/drizzle/0001_items.sql"), ddl);
  fs.writeFileSync(path.join(root, "docs/autopilot/sql-sync-allowlist.json"), "[]");

  const result = checkSqlSync({
    root,
    laneSqlFiles: ["packages/lane-fixture/drizzle/0001_items.sql"],
    harnessSchemaPath: path.join(root, "packages/lane-harness/src/db/schema.ts"),
  });
  assert.equal(result.ok, true);
});
