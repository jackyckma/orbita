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

## Autopilot line (T-0051) — implementation notes

- Package: `@orbita/portfolio` — pure `normalizeRepoReport` + GitHub fetch + note writer.
- Schedule: harness template `portfolio-git-collect@v1` with `application.collector=portfolio_git` (same cron/idempotency path as AT1b; no new scheduler).
- Setup: `./scripts/portfolio-git-collect-setup-harness.sh` (client `personal-jacky`, credential name `github_read`).
- Registry file is copied into the API image (`docs/personal-steward/portfolio-registry.json`) and also bundled under `packages/lane-portfolio/data/` as fallback.
- Private-repo GitHub 404 → report `status=failed` (never an empty success).

## Zeabur deploy line (T-0052) — GraphQL discovery

Endpoint: `https://api.zeabur.com/graphql`  
Auth header: `Authorization: Bearer <key>` (vault name `zeabur_api` under `personal-jacky`).

Public docs list `projects`, `buildLogs`, and `runtimeLogs`, but **not** the deployment listing query. Apollo Explorer SDL requires login; unauthenticated introspection on the endpoint returns an error. Canonical field names used here come from the official **zeabur/cli** GraphQL client (`pkg/model/deployment.go`, `pkg/api/deployment.go`, `pkg/api/log.go`) — do not invent alternate spellings.

### Queries recorded for the collector

**1. Discover owners (personal + teams)**

```graphql
query MeAndTeams {
  me { _id username }
  teams { _id name myRole }
}
```

**2. List projects (omit `ownerID` for personal; pass team `_id` for team-owned)**

```graphql
query Projects($ownerID: ObjectID, $skip: Int, $limit: Int) {
  projects(ownerID: $ownerID, skip: $skip, limit: $limit) {
    edges { node { _id name } }
    pageInfo { hasNextPage }
  }
}
```

Match `node.name` to registry `zeabur_project_name` (case-insensitive).

**3. Environments + services**

```graphql
query Environments($projectID: ObjectID!) {
  environments(projectID: $projectID) { _id name }
}

query Services($projectID: ObjectID!, $skip: Int, $limit: Int) {
  services(projectID: $projectID, skip: $skip, limit: $limit) {
    edges { node { _id name } }
    pageInfo { hasNextPage }
  }
}
```

**4. List deployments (the previously undocumented listing query)**

```graphql
query Deployments($serviceID: ObjectID!, $environmentID: ObjectID!, $perPage: Int) {
  deployments(serviceID: $serviceID, environmentID: $environmentID, perPage: $perPage) {
    edges {
      node {
        _id
        projectID
        serviceID
        environmentID
        status
        commitSHA
        commitMessage
        repoName
        ref
        createdAt
        startedAt
        finishedAt
      }
    }
  }
}
```

`commitSHA` is the join key to the git/autopilot line. If a deployment has an empty `commitSHA`, the report sets `sha_confidence: "timestamp"` and does **not** invent a sha.

**5. Build logs — failed deployments only**

CLI signature (preferred; matches `zeabur deployment log -t build`):

```graphql
query BuildLogs($deploymentID: ObjectID!) {
  buildLogs(deploymentID: $deploymentID) {
    message
    timestamp
  }
}
```

(Public docs also show `buildLogs(projectID, deploymentID, timestampCursor)` — the collector uses the CLI form above.)

### Scheduling

Harness template `portfolio-zeabur-collect@v1` with `application.collector=portfolio_zeabur`. Setup: `./scripts/portfolio-zeabur-collect-setup-harness.sh`. Read-only: never trigger, redeploy, or roll back.
