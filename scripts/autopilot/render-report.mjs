#!/usr/bin/env node
// Daily report skeleton for Autopilot Checker REPORT.
// Usage: node scripts/autopilot/render-report.mjs > docs/autopilot/reports/YYYY-MM-DD.md

import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const today = new Date().toISOString().slice(0, 10);

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const backlog = JSON.parse(await readFile(path.join(root, "docs", "autopilot", "backlog.json"), "utf8"));
const tasks = backlog.tasks ?? [];
let decisions = [];
try {
  decisions = JSON.parse(await readFile(path.join(root, "docs", "autopilot", "decisions.json"), "utf8")).decisions ?? [];
} catch {
  /* empty */
}

const byStatus = (s) => tasks.filter((t) => t.status === s);
const line = (t) => `- ${t.id} — ${t.title}`;
const openDec = decisions
  .filter((d) => d.status === "open")
  .map((d) => ({
    ...d,
    leverage: (d.unblocks ?? []).length,
  }))
  .sort((a, b) => b.leverage - a.leverage);

const commits = sh(`git log --oneline -20 --since='${today}T00:00:00'`);

const out = `# Autopilot report — ${today}

## Shipped & accepted
${byStatus("done").filter((t) => (t.feedback ?? []).some((f) => f.includes(today) || f.includes("merged"))).map(line).join("\n") || "- (see git log / recent merges)"}

## Failed / retrying
${byStatus("ready")
  .filter((t) => (t.retries ?? 0) > 0)
  .map((t) => `${line(t)} — attempt ${t.retries}`)
  .join("\n") || "- (none)"}

## Needs human
${byStatus("needs_human").map(line).join("\n") || "- (none)"}

## Decisions awaiting you (sorted by leverage)
${openDec.map((d) => `- ${d.id} — ${d.title} — unblocks ${(d.unblocks ?? []).length} — recommended: ${d.recommendation ?? "?"}`).join("\n") || "- (none)"}

## Backlog health
ready: ${byStatus("ready").length} · in_progress: ${byStatus("in_progress").length} · in_review: ${byStatus("in_review").length} · blocked: ${byStatus("blocked").length} · needs_human: ${byStatus("needs_human").length} · done: ${byStatus("done").length}

## Commits (recent)
\`\`\`
${commits || "(none)"}
\`\`\`
`;

process.stdout.write(out);
