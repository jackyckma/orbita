---
status: active
maintained_by: jacky
created: 2026-08-09
purpose: How the portfolio hub collects reports — three lines, correlation key, how to add a project.
related: portfolio-registry.json, portfolio-hub.md, docs/autopilot/roadmap.json (E-09)
---

# Portfolio collectors

Read [`portfolio-registry.json`](./portfolio-registry.json) first. That file is the founder-owned list of projects the hub watches. Collection lives in **Orbita** (not in each product repo).

## Three report lines

| Line | Source | What it answers |
|------|--------|-----------------|
| **autopilot** (repo edge) | GitHub: `docs/autopilot/*.json` + recent commits on the default branch | What Autopilot shipped, what's blocked, what's waiting on the founder |
| **deploy** | Zeabur GraphQL (projects with `zeabur_project_name`) | Whether the merge actually reached production (failed builds stay visible) |
| **runtime** | Per-project `runtime_report_url` (E-10; all null for now) | Live product signals (signups, queues, …) — only when a product has real users |

Lines 1–2 need **zero work inside product repos**: autopilot state is already committed by Maker/Checker; deploy state is one shared Zeabur credential. Runtime is the only line that needs an app endpoint — deferred until a product has signals worth reporting.

## Correlation key: git commit sha

Join the lines on **git commit sha**, not timestamps.

```text
task / PR  →  merge commit sha  →  Zeabur deployment (built that sha)  →  serving version
```

Without the sha, "T-xxxx merged" and "deploy failed" are only correlated by clock guesswork. Collectors must carry `source_sha` (or equivalent) on each report note so a brief can say: *this task merged as `abc123`, and its deployment failed*.

## How to add a project

1. Append one object to `projects` in `portfolio-registry.json`.
2. Required fields: `slug` (lowercase kebab, stable join key), `display_name`, `github` (`owner/repo`), `github_default_branch`, `zeabur_project_name` (string or `null`), `runtime_report_url` (`null` until E-10), `expected_cadence_hours`, `enabled`, `notes`.
3. Set `enabled: true` only when collectors should include it. Staleness (T-0053) uses `expected_cadence_hours` — absence of a due report is a finding, not an error to hide.
4. Commit on `main`. No migration, no product-repo task — onboarding is a registry row.

Credentials for collectors (GitHub read token, Zeabur API key) are founder-provisioned into the Orbita vault — see autopilot decision D-002. Do not put secrets in this registry file.
