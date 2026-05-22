# PHASE-01A - Project Scaffold And Game Contract

## Purpose

Create the TypeScript project skeleton and the stable game contract that all future game versions, harnesses, and agents will use.

## Source Context

Use `concept-and-ideas/02_STRUCTURE_AND_TECH_SPECS.md` sections 2-6 and 14-15. Preserve the project direction from `PHASE-00A`.

## Target Outcome

The repo has a minimal TypeScript/Vitest setup, core game types, a seedable RNG utility, and contract tests proving that a placeholder game engine can start, render, expose actions, step, and terminate safely.

## In Scope

- Set up `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`, and Vitest config if needed.
- Create a small `src/game/` core with types, engine contract, and RNG.
- Establish the intended top-level repo shape for future `src/harness/`, `src/agents/prompts/`, `content/`, `tests/`, `runs/`, and `docs/` folders without overbuilding them.
- Add minimal contract tests.
- Add basic docs or comments only where they clarify protocol boundaries.

## Out Of Scope

- Full dungeon generation.
- Reviewer API integration.
- Version folders and scorecard generation.
- Browser UI.

## Technical Spec

Create a stable `GameEngine` interface with these behaviors:

- `start(seed, config?)` returns a valid active state.
- `getAvailableActions(state)` returns explicit structured actions.
- `step(state, action)` applies exactly one turn and returns events.
- `render(state)` returns non-empty text.
- `isTerminal(state)` detects `WIN`, `LOSS`, and `ABORTED`.

Core data should be JSON-serializable and include at minimum:

- `GameState`: version, seed, turn, floor, terminal status, player data, map data, enemies, items, log, metadata.
- `PlayerAction`: id, type, label, optional payload.
- `StepResult`: next state, events, validity, optional error.
- `TerminalStatus`: `ACTIVE`, `WIN`, `LOSS`, `ABORTED`.

Implement deterministic RNG from string seed. The same seed must produce the same initial placeholder state.

## Deliverables

- Project scaffold for TypeScript, pnpm, and Vitest.
- `src/game/` contract and type definitions.
- Seeded RNG helper.
- Minimal placeholder engine or fixtures sufficient for contract tests.
- Tests for start/render/actions/step/terminal/RNG behavior.
- Placeholder directories or documentation for later harness, agent prompt, content, run artifact, and docs areas when useful.

## Tests And Validation

- `pnpm install` if dependencies are not installed.
- `pnpm test`
- `pnpm run typecheck` if a typecheck script exists or is added.

Required tests:

- Starting with a seed returns a serializable state.
- Rendering returns a non-empty string.
- Available actions have ids, labels, and allowed action types.
- Every returned available action can be passed to `step`.
- Terminal status is one of the allowed values.
- Fixed seed produces reproducible initial state.

## Acceptance Criteria

- Tests pass.
- The public game contract is stable and documented enough for later phases.
- No implementation depends on images, audio, browser APIs, external services, or real-time input.

## AI Coder Handoff Notes

Keep this phase deliberately small. The goal is to create a contract that later phases cannot casually break, not to build the full game.
