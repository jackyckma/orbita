---
status: planned
maintained_by: ai-agents
created: 2026-06-20
last_updated: 2026-06-20
purpose: Boundary contract for Lane 2 — Profiles & Skills (not yet implemented).
---

# Lane 2 — Profiles & Skills INTERFACE

## Summary

Static `agent_profile` bundles: model config, skill file set, tool permissions. Bound at session creation; **immutable for session lifetime** (prompt cache constraint).

## Planned endpoints

- Consumed internally by session creation — no public CRUD in v1 beyond profile listing

## See also

- Design spec Section 7
- Wave W1 in `docs/product-architecture.md`
