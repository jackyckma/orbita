#!/usr/bin/env node
// Decision-SLA enforcer for the autopilot loop. No npm dependencies.
//
// Keeps multi-day runs flowing when the founder is away: an OPEN decision that
// carries a non-null `default_if_silent` and has been open longer than `sla_days`
// (default 3) is auto-applied — marked decided with an [auto-SLA] note (still
// founder-vetoable). Decisions with default_if_silent=null NEVER auto-apply.
//
// Run by the Planner automation. Mutates decisions.json unless --dry-run.
//
// Usage:
//   node scripts/autopilot/apply-decision-defaults.mjs            # apply + write
//   node scripts/autopilot/apply-decision-defaults.mjs --dry-run  # report only
//   SLA_DEFAULT_DAYS=5 node scripts/autopilot/apply-decision-defaults.mjs
//
// Prints the ids it applied (or would apply). Exit 0 always.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const decisionsPath = path.join(root, "docs", "autopilot", "decisions.json");
const dryRun = process.argv.includes("--dry-run");
const SLA_DEFAULT_DAYS = Number.parseInt(process.env.SLA_DEFAULT_DAYS ?? "3", 10);
const DAY_MS = 24 * 60 * 60 * 1000;

const doc = JSON.parse(await readFile(decisionsPath, "utf8"));
const decisions = Array.isArray(doc.decisions) ? doc.decisions : [];
const now = Date.now();

const applied = [];
const waiting = [];

for (const d of decisions) {
  if (d.status !== "open") continue;

  // Never auto-apply high-stakes decisions (default_if_silent must be a real option id).
  if (d.default_if_silent == null) {
    waiting.push(`${d.id} — requires explicit answer (no default)`);
    continue;
  }

  const slaDays = Number.isFinite(d.sla_days) ? d.sla_days : SLA_DEFAULT_DAYS;
  const openedAt = d.opened_at ? Date.parse(d.opened_at) : NaN;
  if (Number.isNaN(openedAt)) {
    waiting.push(`${d.id} — no valid opened_at; skipping SLA (set opened_at)`);
    continue;
  }

  const ageDays = (now - openedAt) / DAY_MS;
  if (ageDays <= slaDays) {
    waiting.push(`${d.id} — ${ageDays.toFixed(1)}/${slaDays}d, will auto-apply "${d.default_if_silent}" when SLA passes`);
    continue;
  }

  // SLA passed → apply the default.
  d.status = "decided";
  d.decided_option = d.default_if_silent;
  const note = `[auto-SLA] ${new Date().toISOString().slice(0, 10)}: no answer within ${slaDays}d, applied default_if_silent=${d.default_if_silent}. Founder may veto.`;
  d.decided_note = d.decided_note ? `${d.decided_note} ${note}` : note;
  applied.push(`${d.id} → ${d.default_if_silent} (unblocks ${(d.unblocks ?? []).length})`);
}

if (applied.length > 0 && !dryRun) {
  await writeFile(decisionsPath, JSON.stringify(doc, null, 2) + "\n");
}

process.stdout.write(`SLA_DEFAULT_DAYS=${SLA_DEFAULT_DAYS}${dryRun ? " (dry-run)" : ""}\n`);
process.stdout.write(`auto-applied (${applied.length}):\n${applied.map((a) => `  - ${a}`).join("\n") || "  (none)"}\n`);
process.stdout.write(`still open (${waiting.length}):\n${waiting.map((w) => `  - ${w}`).join("\n") || "  (none)"}\n`);
if (applied.length > 0) {
  process.stdout.write(
    `\nNOTE: ${applied.length} decision(s) auto-decided. Flip their unblocks tasks to ready in backlog.json and commit.\n`,
  );
}
