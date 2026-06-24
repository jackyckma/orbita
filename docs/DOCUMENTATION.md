# Documentation maintenance

Orbita uses a **single source of truth** in git. Public site pages are **generated** from markdown so we do not maintain parallel copies.

## Layers

| Layer | Location | Audience | How it ships |
|-------|----------|----------|--------------|
| **Public docs** | `docs/site/*.md` | get-orbita.com visitors | `./scripts/build-web-docs.sh` → `apps/orbita-web/public/docs/` |
| **Operator / deep dives** | `docs/*.md` | Self-hosters, contributors | GitHub + linked from public docs |
| **Design spec** | `usr/ORBITA_DESIGN.md` | Architecture decisions | Linked from site; not duplicated |
| **API reference** | Live OpenAPI | Integrators | `GET /v1/openapi.json` on each deployment |

## Public docs workflow

1. Edit markdown under `docs/site/` (Setup, Quick Start, Examples, Technical).
2. Run `./scripts/build-web-docs.sh` (also runs before `./scripts/deploy-web.sh`).
3. Deploy static site with `./scripts/deploy-web.sh`.

Generated HTML includes shared nav and styling from `apps/orbita-web/public/styles.css`. Do **not** hand-edit files under `public/docs/` except via the build script.

## When to add a new `docs/site/` page

- User-facing how-to that belongs on the marketing site.
- Keep internal runbooks (`docs/ops-*`, `docs/SESSION_HANDOFF.md`) in `docs/` only — link them from Technical if useful.

## Consistency rules

- **Version strings**: site changelog in `apps/orbita-web/public/updates.html`; API version in `apps/orbita-api/src/index.ts`.
- **URLs**: production API base is always `https://api.get-orbita.com`.
- **Cross-links**: public pages link to GitHub paths for deep docs instead of copying long sections.

## Optional future improvements

- Generate API reference HTML from OpenAPI (Redoc/Swagger UI on Pages).
- Pull selected `docs/*.md` into the site build via allowlist (same renderer, no duplicate files).
