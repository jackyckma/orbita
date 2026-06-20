---
status: planned
maintained_by: ai-agents
created: 2026-06-20
last_updated: 2026-06-20
purpose: Boundary contract for Lane 3 — Sessions (not yet implemented).
---

# Lane 3 — Sessions INTERFACE

## Summary

Session CRUD, message history, polling (`GET .../messages?since=`), compression trigger. Byte-stable history serialization for prompt cache.

## Planned endpoints

- `POST /v1/sessions`
- `GET /v1/sessions/{id}`
- `GET /v1/sessions/{id}/messages?since=...`
- `POST /v1/sessions/{id}/messages`
- `POST /v1/sessions/{id}/compress`
- `DELETE /v1/sessions/{id}`

## See also

- Design spec Sections 4–5
