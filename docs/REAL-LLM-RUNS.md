# Real LLM Runs (Phase 14B)

Optional credential-gated LLM player and reviewer runs sit behind explicit CLI flags. Default gameplay, tests, CI, and `pnpm run check` remain credential-free.

## Environment variables

Documented in `.env.example`:

| Variable | Required | Purpose |
| --- | --- | --- |
| `DUNGEON_FORGE_LLM_API_KEY` | For real runs | Primary API key |
| `OPENAI_API_KEY` | Alternate | Accepted if the primary key is unset |
| `DUNGEON_FORGE_LLM_BASE_URL` | No | OpenAI-compatible API base (default `https://api.openai.com/v1`) |
| `DUNGEON_FORGE_LLM_MODEL` | No | Chat model name (default `gpt-4o-mini`) |

Do not commit `.env` or real secrets.

## CLI flags

| Flag | Commands | Effect |
| --- | --- | --- |
| `--use-llm-player` / `--llm-player` | `run-version`, `simulate-seed` | Use provider-backed LLM player personas |
| `--use-llm-reviewer` / `--llm-reviewer` | `run-version` | Generate reviews via provider JSON (with validation + fallback) |
| `--use-llm` | `run-version` | Enables both player and reviewer |

Without credentials, these flags fail with a clear `LlmCredentialsMissingError` message instead of crashing mid-request.

## Examples

Credential-free default (unchanged):

```bash
pnpm run run-version -- --version v001 --runs-root .
```

Single-seed LLM player smoke (requires API key in env):

```bash
export DUNGEON_FORGE_LLM_API_KEY=your_key_here
pnpm run simulate-seed -- --seed seed_001 --policy careful_player --use-llm-player
```

Version evidence with LLM player + reviewer:

```bash
export DUNGEON_FORGE_LLM_API_KEY=your_key_here
pnpm run run-version -- --version v014 --runs-root /tmp/df-llm-runs --use-llm --on-existing overwrite
```

## Validation and fallbacks

- Player output must include `action_id` and `action_type` matching an available action.
- Invalid JSON, wrong id/type, timeouts, and client errors fall back to deterministic safe actions.
- Original model `reason` is preserved in trace `decision_metadata.model_reason` when a fallback occurs.
- Reviewer output is parsed and validated; failures fall back to the deterministic trace-grounded critic.

## Architecture

- `src/harness/llm-provider-config.ts` — credential resolution
- `src/harness/llm-provider.ts` — OpenAI-compatible chat adapter
- `src/harness/llm-player.ts` — action validation + trace metadata
- `src/harness/llm-reviewer.ts` — review validation + fallback metadata
- `src/harness/llm-run-options.ts` — wires optional LLM modes into version runs

Tests use mocked provider responses only; no required gate depends on external LLM services.
