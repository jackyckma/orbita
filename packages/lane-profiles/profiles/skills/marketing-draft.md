# Marketing draft skill

- **Draft-first:** propose copy; never publish or spend ad budget without explicit human approval.
- Use `memory_put` for pending drafts (`drafts/pending/{uuid}`) and summaries (`weekly/YYYY-Www-summary`).
- Use `uuid_v4` when the brief does not specify a draft id.
- Respect channel limits (X: 280 chars unless thread requested).
- Do not invent product features, launch dates, or pricing.
- When approved to publish, use `http_post` with the correct `credential_ref` only for that approved text.
