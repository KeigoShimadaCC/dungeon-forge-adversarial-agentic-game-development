# AGENTS.md

## Repository Purpose

This repo defines and will implement a bounded adversarial game-development loop. A developer agent builds and improves a small text/ASCII turn-based game; a reviewer/player agent plays through a stable interface and critiques trace evidence.

## Setup

Phase 01A scaffold exists:
- TypeScript
- Node.js
- pnpm
- Vitest
- ESLint

## Progress Coordination (`PROGRESS.MD`)

Read `PROGRESS.MD` at the start of every phase-related session. It is the live handoff between agents—not design truth.

| Section | Agent action |
| --- | --- |
| Active Phase | Confirm phase plan, branch, and status before editing |
| Task queue | Add granular tasks before work; move `[ ]` → `[~]` → `[x]` |
| Phase checklist | Tick deliverables/acceptance only when verified |
| Future backlog | Record out-of-scope ideas with suggested phase; do not implement silently |
| Validation log | Append commands, results, commits, PRs, blockers |
| Phase archive | Read-only history; rotate when a phase completes |

When a phase finishes: archive summary, clear queue/log, update Active Phase and checklist per `PROGRESS.MD` → “Rotating to a new phase”.

## Cursor Agent CLI

Use Cursor Agent CLI as a delegated worker or auditor when the user requests Cursor, Composer, or maximum automation.

Standing user approval:
- The user has explicitly approved sending this repository/worktree context to Cursor Agent / Composer 2.5 for bounded repo tasks.
- This approval is limited to this project and does not allow sending secrets, local `.env` files, credentials, or unrelated private files.
- Still obey the host sandbox/approval system. If escalation is required, request it with a persistent prefix rule for the Cursor command instead of treating this note as a sandbox override.

Default model:
- `composer-2.5`

Default non-interactive pattern:

```bash
agent --print --trust --model composer-2.5 --workspace <worktree-path> "<bounded prompt>"
```

For read-only audits, prefer `--mode=ask` with explicit instructions not to edit, install, or commit. In this environment, `--mode=plan` may exit successfully with empty output; if that happens, sanity-check `--print` with a tiny prompt and rerun the audit in `--mode=ask`.

Cursor delegation rules:
- Start with a preflight: `agent --list-models` to confirm `composer-2.5`, `git status --short --branch`, and the active phase in `PROGRESS.MD`.
- Give Cursor one bounded task with clear ownership, allowed paths, forbidden paths, and verification expectations.
- Split phase work into separate Cursor passes when useful: progress seeding, implementation, then read-only verification.
- Keep the orchestrator responsible for reviewing Cursor output, inspecting diffs, running checks, updating `PROGRESS.MD`, committing, pushing, and opening PRs.
- Treat Cursor's report as advisory until verified from files, diffs, command output, or tests.
- `agent status` or `agent models` may require elevated access because macOS keychain access can fail inside the sandbox.
- If Cursor runs checks, rerun the relevant gates locally before claiming completion or opening a PR.
- After a PR is merged, remove temporary worktrees and verify `git worktree list`.

## Common Commands

Current:
- `git status --short --branch`
- `rg "<term>" concept-and-ideas phase-plans`
- `find . -maxdepth 3 -type f -print | sort`
- `pnpm test`
- `pnpm run typecheck`
- `pnpm run lint`

Planned after later phases:
- harness regression seed command once Phase 03A defines it

No canonical build, e2e, Docker, or CI command exists yet.

## Architecture

Planned boundaries:
- `src/game/**`: game engine, types, RNG, map, enemies, items, combat, render.
- `src/harness/**`: playthrough runner, traces, scorecards, reviewer client, validation.
- `src/agents/prompts/**`: reviewer/developer prompt templates.
- `content/**`: static game data.
- `tests/**`: contract, engine, and regression-seed tests.
- `runs/**`: derived traces, reviews, scorecards, changelogs, patch plans, acceptance decisions.

## Coding Rules

- Read and update `PROGRESS.MD` when doing phase-scoped work (task queue, checklist, validation log).
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

- `PROGRESS.MD` reflects current phase status, completed checklist items, and validation evidence.
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
- Do not start phase work without reading `PROGRESS.MD`; do not leave the next agent without an updated task queue or log.
