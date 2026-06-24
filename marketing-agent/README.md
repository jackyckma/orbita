# Marketing agent workspace

This folder is **not Orbita platform code**. It holds notes, brand voice, and runbooks so agents can **operate Orbita as a user** (`api.get-orbita.com`, `/admin` for vault).

- **Git:** contents are gitignored (except this README). Do not commit secrets.
- **Setup:** copy structure from `docs/templates/marketing-agent-workspace.md`.
- **Platform docs:** `docs/use-cases/marketing-agent.md`.

Fill in `orbita-connection.md`, `products/`, and `runbooks/` locally.

**MA2:** `products/self-host-devs/`, `runbooks/weekly-content.md`, `scripts/ma2-setup-weekly-job.sh`.

**MA3:** `runbooks/draft-approve-publish.md`, `scripts/ma3-setup-channel.sh` — X HTTP allow-list on prod; set `MARKETING_X_API_BEARER` to store `x_api` vault entry.

**MA4:** Use agent profile `marketing` on new sessions; `memory_put`/`memory_get` tools ship on API (w14). Weekly: `scripts/ma2-run-weekly-draft.sh`.
