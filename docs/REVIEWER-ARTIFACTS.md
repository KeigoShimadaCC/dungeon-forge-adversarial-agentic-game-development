# Reviewer artifacts (JSON contract + Markdown reports)

Phase 14C adds persona metadata and human-readable Markdown reports while keeping JSON as the authoritative review contract.

## Roles

| Artifact | Role | Authoritative? |
| --- | --- | --- |
| `runs/<version>/reviews/<seed>_<persona>.json` | Machine-readable `PlaythroughReview` contract used by scorecards, developer handoffs, and comparisons | **Yes** |
| `runs/<version>/reviews/<seed>_<persona>.md` | Human-readable report rendered from validated JSON | No (derived) |
| `runs/<version>/traces/<seed>_<persona>.json` | Turn-by-turn play evidence | Source for review citations |
| `runs/<version>/scorecards/<seed>_<persona>.json` | Objective metrics derived from traces | Source for review citations |

Markdown must never replace or override JSON. Tools that consume reviews should read JSON first; Markdown is for inspection, demos, and PR discussion.

## Persona metadata

Each saved review JSON may include `persona_metadata`:

- `id` — `careful_player`, `naive_player`, or `bug_hunter`
- `display_name` — human label
- `description` — how this persona judges the run
- `emphasis` — priority tags (fairness, clarity, protocol edge cases, etc.)
- `player_policy_hint` — which baseline policy typically drives that persona’s playthrough

Persona differences must be explicit in both JSON (`persona`, `persona_metadata`) and the Markdown **Persona** section.

## Markdown report contents

Generated reports include:

- Persona block (id, display name, description, emphasis)
- Run facts (version, seed, result, turns, evidence quality, trace/scorecard paths)
- Summary paragraph from JSON
- Reviewer scores (1–10)
- Top issues with observation / diagnosis / recommendation and evidence bullets (`turn`, `result`, `invalid`, `event`, `render`, `scorecard`)
- Suggested next changes (max three)
- Optional `review_metadata` when LLM generation or fallback was used

## Validation and malformed output

`savePlaythroughReview` validates review JSON before writing artifacts:

- Invalid reviews throw `ReviewValidationError` and **do not** write JSON or Markdown (no corrupting overwrite).
- `collectReviewValidationDiagnostics` returns categorized `blocker` / `warning` entries for CLI or handoff tooling.
- Developer-task validation reuses the same structural checks via `isReviewStructurallyUsable`.

LLM reviewer output is parsed and validated separately; malformed model JSON falls back to the deterministic reviewer without mutating game state.

## Commands

Version loop writes JSON + Markdown together:

```bash
pnpm run run-version -- --version v001 --runs-root .
```

Inspect a single persona report:

```bash
cat runs/v001/reviews/seed_001_careful_player.md
cat runs/v001/reviews/seed_001_careful_player.json
```

Validate-only developer handoff (includes review structure checks):

```bash
pnpm run developer-task -- --validate-only --review runs/v001/reviews/seed_001_careful_player.json --scorecard runs/v001/scorecards/seed_001_careful_player.json --target-version v002
```
