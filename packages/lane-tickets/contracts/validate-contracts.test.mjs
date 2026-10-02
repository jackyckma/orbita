import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const contractsDir = __dirname;
const repoRoot = path.resolve(__dirname, "../../..");
const simulatorPath = path.join(
  repoRoot,
  "data/simulators/lane-tickets/mandate-epic-task-chain.json",
);

async function collectSchemaFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSchemaFiles(full)));
    } else if (entry.name.endsWith(".schema.json")) {
      files.push(full);
    }
  }
  return files.sort();
}

function collectRefs(node, refs = new Set()) {
  if (node === null || typeof node !== "object") return refs;
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, refs);
    return refs;
  }
  if (typeof node.$ref === "string") refs.add(node.$ref);
  for (const value of Object.values(node)) collectRefs(value, refs);
  return refs;
}

function resolveRef(ref, fromFile, schemaTextByPath) {
  const [filePart, hashPart] = ref.includes("#") ? ref.split("#", 2) : [ref, ""];
  const pointer = hashPart ? `#${hashPart}` : "";
  let targetFile = fromFile;
  if (filePart) {
    targetFile = path.normalize(path.join(path.dirname(fromFile), filePart));
  }
  const text = schemaTextByPath.get(targetFile);
  if (!text) {
    throw new Error(`Unresolved $ref target file: ${ref} (from ${fromFile})`);
  }
  if (!pointer || pointer === "#") return;
  const doc = JSON.parse(text);
  const segments = pointer.slice(1).split("/").filter(Boolean);
  let cur = doc;
  for (const seg of segments) {
    const key = seg.replace(/~1/g, "/").replace(/~0/g, "~");
    cur = cur?.[key];
    if (cur === undefined) {
      throw new Error(`Unresolved $ref pointer ${pointer} in ${targetFile}`);
    }
  }
}

test("every *.schema.json parses and local $ref resolves", async () => {
  const files = await collectSchemaFiles(contractsDir);
  assert.ok(files.length >= 10, `expected many schema files, got ${files.length}`);

  const schemaTextByPath = new Map();
  for (const file of files) {
    const text = await readFile(file, "utf8");
    JSON.parse(text);
    schemaTextByPath.set(file, text);
  }

  for (const file of files) {
    const doc = JSON.parse(schemaTextByPath.get(file));
    for (const ref of collectRefs(doc)) {
      if (ref.startsWith("http://") || ref.startsWith("https://")) continue;
      resolveRef(ref, file, schemaTextByPath);
    }
  }
});

test("golden simulator fixture validates against ticket and breach schemas", async () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const files = await collectSchemaFiles(contractsDir);
  for (const file of files) {
    const schema = JSON.parse(await readFile(file, "utf8"));
    const id = schema.$id ?? path.relative(contractsDir, file);
    ajv.addSchema(schema, id);
  }

  const ticketValidate = ajv.getSchema("https://orbita.dev/schemas/lane-tickets/ticket.schema.json");
  const breachValidate = ajv.getSchema(
    "https://orbita.dev/schemas/lane-tickets/soft-breach-event.schema.json",
  );
  const gitErrValidate = ajv.getSchema(
    "https://orbita.dev/schemas/lane-tickets/errors.schema.json#/definitions/git_read_only",
  );

  assert.ok(ticketValidate && breachValidate && gitErrValidate, "core validators missing");

  const fixture = JSON.parse(await readFile(simulatorPath, "utf8"));
  for (const ticket of fixture.tickets) {
    assert.ok(ticketValidate(ticket), JSON.stringify(ticketValidate.errors, null, 2));
  }
  assert.ok(breachValidate(fixture.sample_soft_breach));
  assert.ok(gitErrValidate(fixture.sample_git_read_only_error));
});
