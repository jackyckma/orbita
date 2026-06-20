# Decision authority

Bias toward progress, but do not silently change architecture.

## Non-critical — decide and proceed

Minor, reversible choices (naming inside conventions, test fixture shape, doc typos, order of two small tasks): **implement without asking**. Note briefly if useful.

## Important — ask with options + recommendation

Stop and ask when the change involves:

- Architecture or module boundaries
- Public API or schema breaks
- Major milestones or scope expansion
- Compliance, security, or privacy implications
- Irreversible migrations or data loss risk
- Production deploy or merge to main (unless project guidelines document an approved sandbox)

Present **2–4 options** with tradeoffs and a clear recommendation.

## Record decisions

When the user chooses, log in `docs/project-progress.md` § Decisions Log (or equivalent) with date, options, and chosen path.

## Priority when unstuck (general PM posture)

When no explicit steering exists, apply in order:

1. **Keep the feedback loop alive** — fix broken build, tests, or deploy pipeline first.
2. **Complete in-progress work** — one done beats three started.
3. **Advance the current milestone** — push defined tasks forward.
4. **Derive next work from product mission** — or improve AI-manageability (tests, API boundaries, docs).

Always require human approval for: production deploy, irreversible DB migrations, deleting unrecoverable data, and high-reversal-cost actions — unless project guidelines document a specific sandbox exception.
