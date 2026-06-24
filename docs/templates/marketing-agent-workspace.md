# Marketing agent workspace — template

Copy this structure into **`marketing-agent/`** at the repo root (gitignored).  
Agents read this folder to **use Orbita as a caller** — not to modify `packages/*` or `apps/orbita-api`.

**Secrets:** never in this folder. Store channel tokens in Orbita `/admin` credentials vault; reference by vault entry name only.

---

## Suggested layout

```text
marketing-agent/
  README.md                 # optional stub (may be the only committed file)
  orbita-connection.md      # API base, client_ids, profiles (no keys)
  decisions.md              # product decisions (draft-only, channels, etc.)
  products/
    <product-slug>/
      brand-voice.md
      channels.md
      notes.md              # campaigns, angles, links
  runbooks/
    weekly-content.md       # prompts / scheduler intent for Orbita sessions
    draft-approve-publish.md  # MA3: draft → approve → X API
    seo-report.md
  scripts/
    ma2-setup-weekly-job.sh
    ma3-setup-channel.sh    # HTTP allow-list + optional x_api vault
  .env.local.example
```

---

## `orbita-connection.md` (example)

```markdown
# Orbita connection

- API base: https://api.get-orbita.com
- Admin: https://api.get-orbita.com/admin (human only)

## Client IDs (memory + credentials scope)

| client_id | Product | Profile | Notes |
|-----------|---------|---------|-------|
| marketing-project-a | Project A | default or custom | draft-only |

## Credentials vault (names only — secrets in /admin)

| name | client_id | Used for |
|------|-----------|----------|
| x_api | marketing-project-a | X posting (when approved) |

## HTTP allow-list

Configured in /admin deployment settings — list domains agents may http_get/post.
```

---

## `products/<slug>/brand-voice.md` (example)

```markdown
# Brand voice — Project A

- Tone: …
- Never mention: …
- One-liner: …
- Competitors: mention only when …
```

---

## `runbooks/weekly-content.md` (example)

```markdown
# Weekly content — Project A

1. Session: `client_id=marketing-project-a`, profile `default`
2. Prompt: Generate 3 post drafts for [channels]; store summary in memory key `calendar/YYYY-Www`
3. Human approves in … before any http_post to publish hosts
```

---

## Agent rules

- Read `marketing-agent/` before marketing tasks.
- Do **not** add marketing business logic to the Orbita platform repo.
- Use Bearer API key from env or ask user to use `/admin` — never commit keys.

See also: `docs/use-cases/marketing-agent.md`, `docs/api-as-product.md` §應用層邊界.
