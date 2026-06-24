# Marketing agent workspace

This folder is **not Orbita platform code**. It holds notes, brand voice, and runbooks so agents can **operate Orbita as a user** (`api.get-orbita.com`, `/admin` for vault).

- **Git:** contents are gitignored (except this README). Do not commit secrets.
- **Setup:** copy structure from `docs/templates/marketing-agent-workspace.md`.
- **Platform docs:** `docs/use-cases/marketing-agent.md`.

Fill in `orbita-connection.md`, `products/`, and `runbooks/` locally.

**MA2 (local):** `products/self-host-devs/`, `runbooks/weekly-content.md`, `scripts/ma2-setup-weekly-job.sh` — weekly cron on prod session (poll mode; agent turn still manual).
