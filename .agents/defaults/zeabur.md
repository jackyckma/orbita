# Zeabur defaults (optional)

## Typical setup

- Source code on **GitHub**
- **Zeabur** managed service linked to the repo (auto-deploy on push to deploy branch, usually `main`)
- Environment variables configured in Zeabur dashboard (not in git)

## Agent workflow

1. **Load Zeabur skills** when available (Cursor plugin or vendored [zeabur/agent-skills](https://github.com/zeabur/agent-skills)).
2. Read project-specific Zeabur config from `.agents/instructions/project-guidelines.md` (service ID, project ID, deploy branch, public URL).
3. If IDs or URLs are missing → **ask the founder**. Do not create a new Zeabur project unless explicitly requested.
4. Prefer **deploy logs + public health URL** for verification over assuming container exec access.

## Common operations

| Task | Approach |
|------|----------|
| Deploy | Push to deploy branch → Zeabur auto-builds |
| Logs | Zeabur skill `zeabur-deployment-logs` or dashboard |
| Env vars | Zeabur skill `zeabur-variables` |
| Domain binding | Zeabur skill `zeabur-domain-url`; DNS may be Cloudflare (see [cloudflare.md](cloudflare.md)) |
| Restart | Zeabur skill `zeabur-restart` |

## Project overlay skill (recommended)

For repos with fixed service IDs, add a project-specific Cursor skill (e.g. `.cursor/skills/myapp-zeabur/SKILL.md`) that wraps upstream Zeabur skills with your IDs and URLs.

## Verification ladder

Cloud agents often cannot run the full local stack. After deploy:

1. Hit staging/production URL (HTTP smoke)
2. Check build/runtime logs if smoke fails
3. Document result in `docs/SESSION_HANDOFF.md`

See [compatibility/local-vs-cloud-agents.md](../compatibility/local-vs-cloud-agents.md).
