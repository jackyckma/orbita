# Founder defaults (optional)

These files describe **common but optional** infrastructure defaults for projects by this founder. They are **not required** to use the methodology bundle.

Agents should read the relevant default file when the user mentions deploy, DNS, email, or LLM APIs — and **ask for missing credentials** rather than guessing.

| File | When to load |
|------|--------------|
| [zeabur.md](zeabur.md) | Deploy, logs, env vars, Zeabur service config |
| [cloudflare.md](cloudflare.md) | DNS records, email, domain management |
| [ai-providers.md](ai-providers.md) | LLM API keys, model routing, cost defaults |

## Override per project

Each target project's `.agents/instructions/project-guidelines.md` (from template) should list:

- Which defaults apply
- Project-specific IDs (Zeabur service ID, domain names)
- Which secrets the agent must ask for

Do **not** commit secrets. Use `.env.example` and cloud UI secret injection.
