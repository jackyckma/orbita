# AI provider defaults (optional)

## Available providers

These API keys are typically available across founder projects:

| Provider | Canonical env var | Notes |
|----------|-------------------|--------|
| **Minimax** (default) | `MINIMAX_API_KEY` | Preferred for cost efficiency |
| OpenAI | `OPENAI_API_KEY` | GPT models |
| Google Gemini | `GEMINI_API_KEY` or `GOOGLE_API_KEY` | Project-specific naming |
| Anthropic | `ANTHROPIC_API_KEY` | Claude API |
| OpenRouter | `OPENROUTER_API_KEY` | Multi-model gateway |

## Default routing policy

1. **Default to Minimax** for implementation, review, and batch tasks unless the user specifies otherwise.
2. Use OpenAI / Anthropic when the task explicitly needs those models or Minimax fails quality bar.
3. Use OpenRouter for model experiments or fallback routing.

Document per-project overrides in `.agents/instructions/project-guidelines.md`.

## Cloud agent secret aliases

Hosted sandboxes (Codex Cloud, Claude Code Cloud) often inject secrets under non-standard names. The bootstrap script [scripts/setup-cloud-agent-env.sh](../scripts/setup-cloud-agent-env.sh) promotes common aliases:

| Injected name | Canonical |
|---------------|-----------|
| `minimax_api_key`, `MMINIMAX_API_KEY` | `MINIMAX_API_KEY` |
| `openrouter_api_key`, `openrouter_api` | `OPENROUTER_API_KEY` |

Add project-specific aliases in `project-guidelines.md` if needed.

## Agent rules

- Never print secret values in logs, handoff, or commits.
- Prefer env vars over hardcoded keys.
- When adding LLM calls, make provider + model configurable via env.
- For tests, use fixtures/mocks — do not call live APIs in unit tests unless explicitly requested.
