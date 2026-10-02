#!/usr/bin/env node
/**
 * Offline guard: lane drizzle SQL + harness schema.ts must be reflected in init.sql.
 * No database required.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { globSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

/** @typedef {{ tables: Set<string>, columns: Map<string, Set<string>>, indexes: Set<string> }} SqlSnapshot */

/** @returns {SqlSnapshot} */
export function emptySnapshot() {
  return { tables: new Set(), columns: new Map(), indexes: new Set() };
}

/**
 * @param {string} content
 * @returns {SqlSnapshot}
 */
export function parseSqlStatements(content) {
  const snap = emptySnapshot();
  const normalized = content.replace(/--[^\n]*/g, "");

  for (const m of normalized.matchAll(
    /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+"([^"]+)"\s*\(([\s\S]*?)\)\s*;/gi,
  )) {
    const table = m[1];
    snap.tables.add(table);
    if (!snap.columns.has(table)) snap.columns.set(table, new Set());
    const body = m[2];
    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("CONSTRAINT")) continue;
      const col = trimmed.match(/^"([^"]+)"/);
      if (col) snap.columns.get(table).add(col[1]);
    }
  }

  for (const m of normalized.matchAll(
    /ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+"([^"]+)"/gi,
  )) {
    const table = m[1];
    const column = m[2];
    snap.tables.add(table);
    if (!snap.columns.has(table)) snap.columns.set(table, new Set());
    snap.columns.get(table).add(column);
  }

  for (const m of normalized.matchAll(
    /CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+"([^"]+)"/gi,
  )) {
    snap.indexes.add(m[1]);
  }

  return snap;
}

/**
 * @param {string} content
 * @returns {SqlSnapshot}
 */
export function parseHarnessSchemaTs(content) {
  const snap = emptySnapshot();
  const pgTableRe = /pgTable\s*\(\s*"([^"]+)"\s*,\s*\{/g;
  let match;
  while ((match = pgTableRe.exec(content)) !== null) {
    const table = match[1];
    snap.tables.add(table);
    if (!snap.columns.has(table)) snap.columns.set(table, new Set());
    const start = match.index + match[0].length;
    const rest = content.slice(start);
    const close = findMatchingBrace(rest);
    const block = rest.slice(0, close);
    const colRe =
      /(?:uuid|text|boolean|jsonb|timestamp|integer|serial|bigint|real|doublePrecision)\(\s*"([^"]+)"/g;
    let col;
    while ((col = colRe.exec(block)) !== null) {
      snap.columns.get(table).add(col[1]);
    }
  }

  for (const m of content.matchAll(/uniqueIndex\s*\(\s*"([^"]+)"/g)) {
    snap.indexes.add(m[1]);
  }

  return snap;
}

/** @param {string} s starting after opening `{` */
function findMatchingBrace(s) {
  let depth = 1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return s.length;
}

/**
 * @param {SqlSnapshot} target
 * @param {SqlSnapshot} source
 */
export function mergeInto(target, source) {
  for (const t of source.tables) target.tables.add(t);
  for (const [table, cols] of source.columns) {
    if (!target.columns.has(table)) target.columns.set(table, new Set());
    for (const c of cols) target.columns.get(table).add(c);
  }
  for (const idx of source.indexes) target.indexes.add(idx);
}

/**
 * @param {SqlSnapshot} lane
 * @param {SqlSnapshot} init
 * @returns {{ missingTables: string[], missingColumns: string[], missingIndexes: string[] }}
 */
export function diffLaneAgainstInit(lane, init) {
  const missingTables = [];
  const missingColumns = [];
  const missingIndexes = [];

  for (const table of lane.tables) {
    if (!init.tables.has(table)) missingTables.push(table);
  }

  for (const [table, cols] of lane.columns) {
    const initCols = init.columns.get(table);
    if (!initCols) {
      for (const c of cols) missingColumns.push(`${table}.${c}`);
      continue;
    }
    for (const c of cols) {
      if (!initCols.has(c)) missingColumns.push(`${table}.${c}`);
    }
  }

  for (const idx of lane.indexes) {
    if (!init.indexes.has(idx)) missingIndexes.push(idx);
  }

  missingTables.sort();
  missingColumns.sort();
  missingIndexes.sort();
  return { missingTables, missingColumns, missingIndexes };
}

/**
 * @param {object} [options]
 * @param {string} [options.root]
 * @param {string} [options.initPath]
 * @param {string} [options.allowlistPath]
 * @param {string[]} [options.laneSqlFiles]
 * @param {string} [options.harnessSchemaPath]
 * @param {boolean} [options.quiet]
 */
export function checkSqlSync(options = {}) {
  const root = options.root ?? REPO_ROOT;
  const initPath = options.initPath ?? path.join(root, "apps/orbita-api/migrations/init.sql");
  const allowlistPath =
    options.allowlistPath ?? path.join(root, "docs/autopilot/sql-sync-allowlist.json");

  let skipFiles = new Set();
  if (fs.existsSync(allowlistPath)) {
    const raw = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
    if (Array.isArray(raw)) {
      skipFiles = new Set(raw.map((p) => path.normalize(p)));
    } else if (raw && Array.isArray(raw.skipFiles)) {
      skipFiles = new Set(raw.skipFiles.map((p) => path.normalize(p)));
    }
  }

  const initSnap = parseSqlStatements(fs.readFileSync(initPath, "utf8"));

  const laneSqlFiles =
    options.laneSqlFiles ??
    globSync("packages/*/drizzle/*.sql", { cwd: root }).sort();

  const laneSnap = emptySnapshot();
  const scannedFiles = [];

  for (const rel of laneSqlFiles) {
    const norm = path.normalize(rel);
    if (skipFiles.has(norm)) continue;
    scannedFiles.push(rel);
    const content = fs.readFileSync(path.join(root, rel), "utf8");
    mergeInto(laneSnap, parseSqlStatements(content));
  }

  const harnessPath =
    options.harnessSchemaPath ??
    path.join(root, "packages/lane-harness/src/db/schema.ts");
  if (fs.existsSync(harnessPath)) {
    mergeInto(laneSnap, parseHarnessSchemaTs(fs.readFileSync(harnessPath, "utf8")));
    scannedFiles.push(path.relative(root, harnessPath));
  }

  const lanesWithoutDrizzle = listLanesWithoutDrizzle(root);

  const { missingTables, missingColumns, missingIndexes } = diffLaneAgainstInit(
    laneSnap,
    initSnap,
  );

  const ok =
    missingTables.length === 0 &&
    missingColumns.length === 0 &&
    missingIndexes.length === 0;

  return {
    ok,
    missingTables,
    missingColumns,
    missingIndexes,
    scannedFiles,
    lanesWithoutDrizzle,
  };
}

/** @param {string} root */
function listLanesWithoutDrizzle(root) {
  const packagesDir = path.join(root, "packages");
  if (!fs.existsSync(packagesDir)) return [];
  const out = [];
  for (const name of fs.readdirSync(packagesDir)) {
    if (!name.startsWith("lane-")) continue;
    const drizzleDir = path.join(packagesDir, name, "drizzle");
    if (name === "lane-harness") continue;
    if (!fs.existsSync(drizzleDir)) out.push(name);
  }
  out.sort();
  return out;
}

export function main(argv = process.argv.slice(2)) {
  const quiet = argv.includes("--quiet");
  const result = checkSqlSync({ quiet });

  if (!quiet && result.lanesWithoutDrizzle.length > 0) {
    console.log(
      "Lanes with no packages/<lane>/drizzle SQL (DDL may live only in init.sql):",
    );
    for (const lane of result.lanesWithoutDrizzle) {
      console.log(`  - ${lane}`);
    }
  }

  if (result.ok) {
    if (!quiet) {
      console.log(
        `SQL sync OK (${result.scannedFiles.length} lane source file(s) checked against init.sql)`,
      );
    }
    return 0;
  }

  console.error("SQL sync check failed — lane schema not fully reflected in init.sql:");
  for (const t of result.missingTables) console.error(`  missing table: ${t}`);
  for (const c of result.missingColumns) console.error(`  missing column: ${c}`);
  for (const i of result.missingIndexes) console.error(`  missing index: ${i}`);
  return 1;
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  process.exit(main());
}
