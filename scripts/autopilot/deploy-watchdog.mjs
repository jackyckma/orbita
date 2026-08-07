#!/usr/bin/env node
// Post-merge prod health check for Autopilot Checker WATCHDOG.
 // No npm dependencies.
//
 // Configure via env or docs/autopilot/project-hooks.json:
 //   PROD_SMOKE_CMD  — shell command; exit 0 = healthy
 // If unset, records current origin/main sha and PASSes (no prod check).
 //
 // On FAIL: sets pause-state.json paused=true, by=deploy-watchdog.
 // On PASS: updates watchdog-state.json last_checked_sha; clears watchdog pause.
 //
 // Usage: node scripts/autopilot/deploy-watchdog.mjs

import { readFile, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ap = (p) => path.join(root, "docs", "autopilot", p);

async function loadJson(p, fallback) {
  try {
    return JSON.parse(await readFile(p, "utf8"));
  } catch {
    return fallback;
  }
}

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const hooks = await loadJson(ap("project-hooks.json"), {});
const smokeCmd =
  process.env.PROD_SMOKE_CMD?.trim() ||
  hooks.prod_smoke_cmd?.trim() ||
  "";

const sha = sh("git rev-parse origin/main") || sh("git rev-parse HEAD");
let ok = true;
let detail = "no prod smoke configured — recorded sha only";

if (smokeCmd) {
  console.log(`▶ prod smoke\n  $ ${smokeCmd}`);
  try {
    execSync(smokeCmd, { cwd: root, stdio: "inherit", shell: true });
    detail = "prod smoke PASS";
  } catch {
    ok = false;
    detail = "prod smoke FAIL";
  }
} else {
  console.log(`▶ ${detail}`);
}

const watchPath = ap("watchdog-state.json");
const pausePath = ap("pause-state.json");

if (ok) {
  await writeFile(
    watchPath,
    JSON.stringify({ last_checked_sha: sha, checked_at: new Date().toISOString(), detail }, null, 2) + "\n",
  );
  const pause = await loadJson(pausePath, { paused: false });
  if (pause.paused && pause.by === "deploy-watchdog") {
    await writeFile(
      pausePath,
      JSON.stringify({ paused: false, reason: null, since: null, by: null }, null, 2) + "\n",
    );
  }
  console.log(`PASS sha=${sha}`);
  process.exit(0);
}

await writeFile(
  pausePath,
  JSON.stringify(
    {
      paused: true,
      reason: detail,
      since: new Date().toISOString(),
      by: "deploy-watchdog",
    },
    null,
    2,
  ) + "\n",
);
console.error(`FAIL — loop paused (by=deploy-watchdog). Investigate main deploy, then re-run watchdog.`);
process.exit(1);
