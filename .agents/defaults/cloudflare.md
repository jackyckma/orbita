# Cloudflare defaults (optional)

## Typical setup

- **DNS** for domains (A/CNAME records pointing to Zeabur or other hosts)
- **Email** (ZSend or Cloudflare Email Routing) when the product sends mail

Zeabur may bind a service domain; Cloudflare often holds the registrar DNS zone.

## When agents need access

Ask the founder for a **scoped API token** when the task requires:

- Creating or updating DNS records
- Email routing or domain verification
- WAF / SSL settings (rare for app dev)

**Never** commit tokens. Store in:

- Cloud agent UI secret injection
- Local `.env` (gitignored)
- Zeabur env vars (if the app needs runtime Cloudflare API access)

## Agent workflow

1. Confirm which domain and zone the project uses (from `project-guidelines.md`).
2. If Cloudflare MCP or skills are available, read tool schemas before calling.
3. Prefer **read-only** token scopes when listing records; escalate for writes.
4. After DNS changes, note TTL and propagation delay in handoff.

## Division of responsibility

| Concern | Typical owner |
|---------|---------------|
| Service public URL | Zeabur domain binding |
| Custom domain DNS | Cloudflare DNS records |
| Transactional email | Cloudflare Email / ZSend + app env vars |

Document the split in each project's `docs/AGENT_ENV.md`.
