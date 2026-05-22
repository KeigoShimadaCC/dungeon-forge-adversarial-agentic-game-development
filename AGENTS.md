# AGENTS.md

## Repository Purpose

This repo defines and will implement a bounded adversarial game-development loop. A developer agent builds and improves a small text/ASCII turn-based game; a reviewer/player agent plays through a stable interface and critiques trace evidence.

## Setup

No app scaffold exists yet. Do not run install commands until `package.json` exists.

Planned Phase 01A setup:
- TypeScript
- Node.js
- pnpm
- Vitest

## Common Commands

Current:
- `git status --short --branch`
- `rg "<term>" concept-and-ideas phase-plans`
- `find . -maxdepth 3 -type f -print | sort`

Planned after scaffold:
- `pnpm test`
- `pnpm run typecheck` if present
- harness regression seed command once Phase 03A defines it

No canonical lint, build, e2e, Docker, or CI command exists yet.

## Architecture

Planned boundaries:
- `src/game/**`: game engine, types, RNG, map, enemies, items, combat, render.
- `src/harness/**`: playthrough runner, traces, scorecards, reviewer client, validation.
- `src/agents/prompts/**`: reviewer/developer prompt templates.
- `content/**`: static game data.
- `tests/**`: contract, engine, and regression-seed tests.
- `runs/**`: derived traces, reviews, scorecards, changelogs, patch plans, acceptance decisions.

## Coding Rules

- Start from the active phase plan.
- Preserve `GameEngine` and terminal-state semantics.
- Keep gameplay finite, turn-based, text/ASCII, seedable, serializable, and structured-action based.
- Do not add browser-only, image-only, audio, real-time, infinite, or external-service gameplay requirements.
- Do not broaden a phase into roadmap scope unless requested.
- Prefer small deterministic modules over clever generation.

## Testing Rules

- Add tests with behavior changes.
- Contract tests must cover start/render/actions/step/terminal status.
- Randomness changes must verify same seed means same result.
- Harness changes must verify trace and scorecard shape.
- Reviewer-agent changes must test malformed and invalid action outputs.
- Never remove tests to pass a phase.

## Security Rules

- Do not commit secrets or local `.env` files.
- If API credentials are introduced, document variable names in `.env.example`.
- LLM calls may support reviewer behavior, but gameplay must run without API credentials.
- Validate model JSON before using it.
- Do not allow reviewer output to mutate game state directly.

## Data / Artifacts

- Treat `concept-and-ideas/` and `phase-plans/` as design truth.
- Treat `runs/**` as generated evidence.
- Do not hand-edit generated comparisons if they can be regenerated from traces/scorecards.
- Preserve rejected-version artifacts and reasons.

## PR Checklist

- Active phase named in summary.
- Scope limited to phase.
- Tests/checks run or blocker explained.
- Invariants preserved.
- Docs/artifacts updated when behavior changes.
- No secrets or unrelated churn.
- Known risks listed.

## Known Pitfalls

- Do not critique from design docs only; reviewer must play first.
- Do not change `GameEngine` casually.
- Do not add open-ended LLM gameplay.
- Do not make UI the source of truth.
- Do not treat scorecards as proof without trace evidence.
- Do not skip regression seeds once harness exists.
