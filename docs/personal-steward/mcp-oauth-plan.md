---
status: active
maintained_by: jacky
created: 2026-07-15
purpose: PA1.5 — MCP OAuth for Claude Desktop Custom Connector (RFC 9728/8414 + PKCE).
related: docs/personal-steward/connectors-claude.md, packages/lane-oauth
---

# PA1.5 — MCP OAuth (Claude Custom Connector)

## Problem

Claude Desktop **Custom Connector** (Settings → Connectors) connects from Anthropic cloud via **OAuth 2.1 + PKCE**. It does not accept static Bearer API keys or `x-orbita-client-id` headers.

PA1 `/v1/mcp` (API key auth) works for Cursor and Claude Code CLI only.

## Solution

Add OAuth authorization server endpoints on `api.get-orbita.com`. MCP accepts **either** OAuth access tokens **or** existing API keys.

## Endpoints

| Path | Purpose |
|------|---------|
| `GET /.well-known/oauth-protected-resource` | RFC 9728 PRM (always 200) |
| `GET /.well-known/oauth-authorization-server` | RFC 8414 AS metadata |
| `POST /oauth/register` | Dynamic Client Registration (RFC 7591) |
| `GET /oauth/authorize` | Consent screen (authorization code + PKCE) |
| `POST /oauth/authorize` | Approve consent (API key verifies tenant) |
| `POST /oauth/token` | Code exchange + refresh |
| `ALL /v1/mcp` | 401 + `WWW-Authenticate` when unauthenticated; Bearer OAuth JWT or API key |

## User flow (Claude Desktop)

1. Add connector: Name `Orbita`, URL `https://api.get-orbita.com/v1/mcp`, OAuth fields **empty** (DCR).
2. Claude hits `/v1/mcp` → 401 → reads PRM → starts OAuth.
3. Browser opens `/oauth/authorize` → user enters Orbita API key → approves.
4. Claude receives tokens; subsequent MCP calls use `Authorization: Bearer <jwt>`.

## Token claims (JWT access token)

- `iss`: `https://api.get-orbita.com`
- `aud`: `https://api.get-orbita.com/v1/mcp`
- `sub`: Orbita `client_id` (e.g. `personal-jacky`)
- `scope`: `sessions:use`

## Coexistence

| Client | Auth |
|--------|------|
| Cursor / scripts | API key + `x-orbita-client-id` (unchanged) |
| Claude Code CLI | `--header` (unchanged) |
| Claude Custom Connector | OAuth (new) |

## Out of scope (PA1.5)

- Full user accounts / W17 billing OAuth
- `client_credentials` grant (Claude Connector does not support it)
