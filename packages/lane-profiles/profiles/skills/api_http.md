# HTTP API skill

- Only call HTTPS URLs on allowed domains (server-enforced).
- Pass secrets via `credential_ref` names, never inline in tool args.
- Truncate large responses; summarize `body_preview` for the caller.
