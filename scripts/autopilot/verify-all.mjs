#!/usr/bin/env node
// Full-suite verifier for Autopilot Checker (verification-not-by-author).
 // No npm dependencies.
//
// Default: runs ./scripts/agent-verify.sh from repo root (L0+L1 per AGENT_ENV).
// Override with AUTOPILOT_VERIFY_CMD env (single shell command).
//
// Usage:
//   node scripts/autopilot/verify-all.mjs
//   AUTOPILOT_VERIFY_CMD='npm test' node scripts/autopilot/verify-all.mjs
//
// Exit: 0 green; 1 fail; 2 harness error.

import { access } from "node:fs/promises";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const listOnly = process.argv.includes("--list");

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

const custom = process.env.AUTOPILOT_VERIFY_CMD?.trim();
const defaultScript = path.join(root, "scripts", "agent-verify.sh");
const cmd = custom || (await exists(defaultScript) ? "./scripts/agent-verify.sh" : null);

if (!cmd) {
  console.error(
    "verify-all: no AUTOPILOT_VERIFY_CMD and scripts/agent-verify.sh missing.\n" +
      "Add agent-verify.sh (methodology bootstrap) or set AUTOPILOT_VERIFY_CMD.",
  );
  process.exit(2);
}

if (listOnly) {
  console.log(`would-run: ${cmd}`);
  process.exit(0);
}

console.log(`▶ verify-all\n  $ ${cmd}`);
try {
  execSync(cmd, { cwd: root, stdio: "inherit", shell: true });
  process.exit(0);
} catch {
  process.exit(1);
}
