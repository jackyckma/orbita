# Model orchestration

Rules for dividing work across models, subagents, and effort levels. Goal:
expensive contexts plan and decide; cheap contexts grind; nobody verifies
their own work.

**Applies when** your environment can dispatch subagents or parallel tasks
(e.g. Claude Code Task tool, Cowork agents, Codex parallel tasks). If it
cannot, follow §7 Degraded mode — the contracts still apply, the dispatch
mechanics change.

---

## 1. Model table — verify, never assume

Do not write model names from memory. At session start (or first dispatch),
check what is actually available in this environment (model picker, CLI
config, API listing) and use those names.

Keep a table in the project's `docs/AGENT_ENV.md` (add the section if
missing):

```markdown
## Models available (verified YYYY-MM-DD)

| Tier | Model name here | Use for |
|------|-----------------|---------|
| cheap | e.g. haiku | scans, batch edits, mechanical fixes |
| mid | e.g. sonnet | implementation, tests, docs |
| high | e.g. opus | architecture, debugging dead ends, review of high-risk changes |
```

If the table's `verified` date is older than ~30 days or a listed name
errors, re-verify and update the table before dispatching.

## 2. The commander stays out of the trenches

The main conversation is for planning, decisions, and integration. Dispatch
to a subagent instead of doing inline:

- Reading many files / scanning a repo for a pattern
- Web research and documentation lookup
- Batch mechanical edits (rename, apply a known fix across N files)
- Running tests or builds with long output; log analysis

Tripwire: if you are about to pull more than ~100 lines of raw file, log, or
web content into the main context, stop — dispatch it and take back only the
conclusion.

## 3. Dispatch contract — every dispatch has three parts

1. **Goal and motivation** — what to produce and why it matters to the
   parent task (one short paragraph; enough context to make good local
   decisions without asking back).
2. **Acceptance criteria** — how the result will be checked, observable
   pass/fail.
3. **Report format** — exactly what to return and a length cap.

Plus: state the **model tier and effort** explicitly, using the §1 table.
Default: cheap for mechanical, mid for implementation, high only when §5
escalates.

## 4. Report contract — what comes back

- Conclusion first, then evidence as `file:line` references.
- Deviations, uncertainties, and anything skipped: flagged explicitly.
- Long artifacts (reports, diffs, generated code) are written to files;
  return the **path**, not the content.
- Never paste whole files back into the parent context.

## 5. Escalation and de-escalation ladder

| Situation | Action |
|-----------|--------|
| Cheap-tier result fails acceptance once | Redo on mid tier (don't retry cheap) |
| Mid tier fails the **same subtask** twice | Escalate to high tier **with the full failure trail**: each attempt, its error, your hypothesis why |
| High tier cracked it | Extract the reusable pattern; batch-apply remaining similar cases on cheap tier |
| Any tier, two full retry rounds spent | Stop; escalate or ask the user — never a third round. Inside an autonomous loop: mark the issue blocked and move on (`autonomous-loop.md`) |

Never retry with an identical prompt. Every retry changes at least one of:
model, approach, or the context provided.

## 6. Verification is never done by the author

The context that produced a change does not get to declare it done.

- **Files / docs:** a fresh context reads the file back from disk and checks
  it against the acceptance criteria.
- **Code:** run the tests or execute the code. Verification levels
  (L0–L5) are defined in `local-vs-cloud-agents.md` (framework repo:
  `compatibility/`; bootstrapped projects: `.agents/compatibility/`);
  the project's actual commands live in `docs/AGENT_ENV.md`. Passing
  output is the claim; the test run is the proof.
- **High-risk judgment calls** (architecture, security-adjacent, anything on
  the `decision-authority.md` Tier 3 block-and-ask list): get a second
  opinion in a fresh context, or generate 2–3 candidate answers and have a
  separate context pick with reasons.

Cheapest acceptable verifier wins: a test run beats a model review; a model
review beats nothing.

## 7. Degraded mode — no subagent support

Some tools (single-context Cursor or Codex sessions) cannot dispatch. Keep
the contracts, change the mechanics:

- Write the acceptance criteria down **before** starting the work.
- Verify in a separated pass: finish, then re-read every changed file from
  disk and check against the criteria as if you had not written it.
- Note in the session handoff that fresh-context verification was
  unavailable, so the next session knows the review was same-context.

## 8. Examples

**Good dispatch** (to cheap tier):

> Goal: find every route handler missing input validation, so we can batch-fix
> before the security pass. Scan `src/routes/**`. Acceptance: every handler
> listed with file:line and the unvalidated parameter named; no false
> positives from handlers using `validateBody()`. Report: one line per
> finding, `path:line — param`, max 50 lines; if more, write to
> `docs/scan-results.md` and return the path.

**Bad dispatch** (do not copy):

> "Check the routes for validation problems and tell me what you find."

No acceptance criteria (what counts as a problem?), no report cap (invites a
context flood), no model/effort choice, and the subagent cannot tell when it
is finished.
