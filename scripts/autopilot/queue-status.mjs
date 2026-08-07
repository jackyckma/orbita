#!/usr/bin/env node
// Deterministic queue-health snapshot for the autopilot Planner. No dependencies.
//
// Prints a small report + a REFILL_NEEDED flag when the ready queue is running low,
// so the Planner knows whether to decompose the next epic into fresh tasks.
//
// Threshold via env READY_MIN (default 2). Exit code always 0.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const READY_MIN = Number.parseInt(process.env.READY_MIN ?? "2", 10);

const backlog = JSON.parse(await readFile(path.join(root, "docs", "autopilot", "backlog.json"), "utf8"));
const tasks = Array.isArray(backlog.tasks) ? backlog.tasks : [];

let decisions = [];
try {
  const parsed = JSON.parse(await readFile(path.join(root, "docs", "autopilot", "decisions.json"), "utf8"));
  decisions = Array.isArray(parsed.decisions) ? parsed.decisions : [];
} catch {
  decisions = [];
}

const doneIds = new Set(tasks.filter((t) => t.status === "done").map((t) => t.id));
const actionableReady = tasks.filter(
  (t) => t.status === "ready" && (t.deps ?? []).every((d) => doneIds.has(d)),
);
const count = (s) => tasks.filter((t) => t.status === s).length;
const openDecisions = decisions.filter((d) => d.status === "open");

// Recent feedback from done/blocked/needs_human tasks — signal for the Planner.
const recentFeedback = tasks
  .filter((t) => (t.feedback ?? []).length > 0)
  .flatMap((t) => (t.feedback ?? []).slice(-1).map((f) => `${t.id}: ${f}`))
  .slice(-12);

const refillNeeded = actionableReady.length < READY_MIN;

const out = [
  `READY_MIN=${READY_MIN}`,
  `actionable_ready=${actionableReady.length} (${actionableReady.map((t) => t.id).join(", ") || "none"})`,
  `ready=${count("ready")} in_progress=${count("in_progress")} in_review=${count("in_review")} blocked=${count("blocked")} needs_human=${count("needs_human")} done=${count("done")}`,
  `open_decisions=${openDecisions.length} (${openDecisions.map((d) => d.id).join(", ") || "none"})`,
  `REFILL_NEEDED=${refillNeeded}`,
  "recent_feedback:",
  ...recentFeedback.map((f) => `  - ${f}`),
].join("\n");

process.stdout.write(out + "\n");
