# Local Cursor vs Cloud Agents

One GitHub repo can be worked on from **local Cursor** and **Cloud Agents** (Cursor Cloud, Claude Code Cloud, Codex Cloud) — but not with identical environments. Design for **shared git + layered verification + explicit handoff**.

## The constraint

Cloud sandboxes typically:

- Start from a **clean clone** each session
- Inject secrets via **UI**, not your local `.env`
- May lack Docker, local DB, VPN, simulators, or long-running dev servers
- Have varying MCP/browser/network policies

**Implication:** Cloud Agents should not be required to run your full local stack. They should excel at **L0–L1 verification + code changes**, while **deployed staging** (e.g. Zeabur) provides L4 integration smoke.

## Verification ladder

Document levels in each project's `docs/AGENT_ENV.md`:

| Level | What | Local Cursor | Cloud Agent | CI |
|-------|------|:------------:|:-------------:|:--:|
| **L0** | lint / typecheck / format | ✅ | ✅ | ✅ |
| **L1** | unit tests (mocked externals) | ✅ | ✅ | ✅ |
| **L2** | integration (DB, Redis, …) | ✅ | ⚠️ needs devcontainer | ⚠️ |
| **L3** | full stack dev server | ✅ | ❌ usually | ❌ |
| **L4** | HTTP smoke on **deployed staging URL** | ✅ | ✅ | ✅ |
| **L5** | browser E2E | ✅ MCP | ⚠️ | optional |

### Default paths by environment

| Environment | Run before session end |
|-------------|-------------------------|
| **Cloud Agent** | L0 → L1 → push → (optional) L4 after Zeabur deploy |
| **Local Cursor** | L0 → L1 → L2/L3 as needed |
| **CI** | L0 → L1 (L2 if docker available) |

## Making projects more cloud-compatible

1. **`scripts/agent-verify.sh`** — runs L0+L1 only; no local DB required. Cloud Agents run this before handoff.
2. **`docs/AGENT_ENV.md`** — capability matrix: what is local-only vs cloud-safe.
3. **Stub/fixture-first** — external APIs and LLMs mocked in unit tests (`data/fixtures/`).
4. **Zeabur staging** — shared runtime both environments can hit via HTTPS.
5. **`setup-cloud-agent-env.sh`** — installs CLIs, aliases secret env names, runs agent-verify.
6. **Handoff `Verified in` section** — see [session-handoff.md](../instructions/session-handoff.md).

## Workflow diagram

```text
┌─────────────────┐     push      ┌──────────────────┐
│ Local Cursor    │ ────────────► │ GitHub           │
│ L2/L3 when needed│              │ CI: L0+L1        │
└─────────────────┘               └────────┬─────────┘
        ▲                                  │ merge
        │ SESSION_HANDOFF.md               ▼
┌───────┴─────────┐               ┌──────────────────┐
│ Cloud Agent     │ ◄── clone ─── │ Zeabur staging   │
│ L0+L1 + code    │               │ L4 HTTP smoke    │
└─────────────────┘               └──────────────────┘
```

## When to mark local-only

Document in `AGENT_ENV.md` when tasks **must not** be assigned to Cloud Agents:

- Mobile simulators / GPU workloads
- Corporate VPN or private network resources
- Interactive UI without browser MCP
- First-time monorepo install exceeding sandbox timeouts

## Bootstrap

Copy [agent-capability-matrix.template.md](agent-capability-matrix.template.md) to `docs/AGENT_ENV.md` and fill in project specifics.

Run [setup-cloud-agent-env.sh](../scripts/setup-cloud-agent-env.sh) in Cloud Agent bootstrap scripts.

See [cloud-bootstrap.env.example](cloud-bootstrap.env.example) for env var names (no secret values).
