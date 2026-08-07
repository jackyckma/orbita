---
status: proposed
maintained_by: jacky
created: 2026-08-07
purpose: Mid-line product direction — Orbita as multi-project central hub (reports in, instructions out).
related: docs/personal-steward/, docs/autopilot/roadmap.json (E-07), docs/DEVELOPMENT_LANES.md
---

# Portfolio hub (mid-line)

Sketch: [portfolio-hub-sketch.png](./portfolio-hub-sketch.png)

## Intent

Reduce founder mental load across portfolio projects by making Orbita the **agent-facing hub**:

1. **Collect** — daily (or on-demand) project *reports* land in one place (`personal-jacky` notes / memory).
2. **Brief** — you talk to Claude/ChatGPT; they read Orbita and summarize what happened / what needs you.
3. **Dispatch** — approved *agent instructions* become Autopilot fuel in each project repo; Cursor Autopilot implements → deploy → product.

This is **not** near-term Autopilot fuel (see E-02…E-04). Capture here so stages can be approved later without re-deriving intent.

## Open design choices

| Topic | Options (sketch) | Lean |
|-------|------------------|------|
| Report ingest | Pull (Orbita harness/HTTP) vs push (project webhook / email / script POST) | Start **push** from one dogfood project; add pull later |
| Instruction write | Orbita API writes into repo vs chatbot opens PR vs Autopilot Maker only reads Orbita inbox | Prefer **Orbita stores instruction artifact**; a thin per-repo sync (or human-approved PR) writes `docs/autopilot/backlog.json` — avoid silent force-push to foreign mains |
| Scope of “project” | Live site vs git repo vs both | Treat **repo Autopilot** and **runtime report** as two edges of one slug (see `project-registry.md`) |

## Suggested stages (later approval)

| Stage | Outcome | Depends on |
|-------|---------|------------|
| **H0** | Convention: `frontmatter.type=report\|instruction`, project slug, dated notes | PA0 + Claude connector ✅ |
| **H1** | One project pushes a daily report note into `personal-jacky` | Any one repo + API key |
| **H2** | Chatbot brief skill: “summarize reports since …” via MCP/notes search | H0–H1 + note_search healthy |
| **H3** | Instruction notes → approved Autopilot tasks in *that* repo (human gate first) | Per-repo Autopilot scaffolds |
| **H4** | Optional Orbita-hosted dispatch (create PR / update backlog) with audit trail | H3 + GitHub app or PAT policy |

## Non-goals (for now)

- Replacing per-repo Autopilot with one mega-Maker across all remotes
- Auto-deploy orchestration owned by Orbita (keep deploy in each project’s CI)
- AT editorial L2 loop as the only report source (it is *one* project edge)
