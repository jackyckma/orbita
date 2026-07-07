---
status: active
maintained_by: jacky
created: 2026-07-07
source: https://jackyma.info/blog/ai-transition-infrastructure/
---

# Project registry (PA0 seed)

Canonical list for `frontmatter.project` on notes and `projects/{slug}/summary` memory keys.

| slug | Name | URL / note | Pace |
|------|------|------------|------|
| `agent-mindset` | 《Agent 思維》 | Book — framework & language for agent systems | active |
| `orbita` | Orbita | https://get-orbita.com — Agent System Backend (this repo) | active |
| `at-io` | ai-transformation.io | https://ai-transformation.io — org insider cockpit | active |
| `at-org` | ai-transformation.org | https://ai-transformation.org — knowledge commons; Orbita dogfood | active |
| `apprenticeship` | AI 時代學徒計畫 | https://jackyma.info/blog/ai-era-apprenticeship | planned |
| `powerhouse` | Powerhouse | https://powerhouse.zeabur.app — capability signals / matching | active |
| `ai-business-life` | AI Business Life | https://ai-business.live — SME ↔ builder specs | paused (post AT loop) |
| `vios` | ViOS | https://github.com/jackyckma/ViOS (private / slow background) | background |
| `jackyma-site` | jackyma.info | Personal site & essays | active |
| `melody-thesis` | 曲調論文 | Music / melody research writing (PA0 dogfood candidate) | active |

## Shared narrative

From [AI Transition Infrastructure](https://jackyma.info/blog/ai-transition-infrastructure/): book → Orbita infra → apprenticeship, Powerhouse, AI Business Life, AT io/org — **one transition infrastructure**, multiple interfaces.

Store this as a steward note (suggested idempotent seed):

- **Note title:** `AI transition infrastructure map`
- **frontmatter:** `{ "type": "registry", "tags": ["meta", "portfolio"] }`
- **body:** link to blog + table above

## Cross-project queries (examples)

- "What did I write about agent memory?" → `note_search` query `agent memory`
- "Anything on ViOS related to UI?" → search + `frontmatter.project: vios`
- "Summarize Orbita vs AT org boundary" → graph from registry note + `orbita` / `at-org` project summaries
