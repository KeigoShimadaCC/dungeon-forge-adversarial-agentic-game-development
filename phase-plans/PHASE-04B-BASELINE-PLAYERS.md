# PHASE-04B - Baseline Players

## Purpose

Add deterministic non-LLM automated players for cheap smoke testing before reviewer agents exist.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-04B-BASELINEPLAYERS-BUILDING` and the harness flow in `02_STRUCTURE_AND_TECH_SPECS.md`.

## Target Outcome

Baseline policies can choose valid actions and run games to `WIN`, `LOSS`, or `ABORTED` without crashing.

## In Scope

- Random valid-action player.
- Stairs-seeking player.
- Cautious low-HP player.
- Greedy item-picker player.
- Deterministic policy RNG where needed.

## Out Of Scope

- LLM player integration.
- Optimal pathfinding requirements.
- Human UI.
- Changing the game engine contract for policy convenience.

## Technical Spec

Dependencies: `PHASE-03A-MINIMAL-DUNGEON`.

Place policies under `src/harness/**` or another clear non-game-engine boundary. Each policy receives the current rendered/state context and available actions, then returns one available `PlayerAction` or action ID.

Policies must choose only from `getAvailableActions(state)` and be deterministic for a fixed seed and state sequence.

The first smoke matrix should run each baseline policy against the canonical regression seeds from `PHASE-00A`: `seed_001` through `seed_005`.

## Deliverables

- Baseline player modules.
- Tests proving valid action selection.
- Minimal runner helper if needed for policy smoke tests.

## Tests And Validation

- Each baseline player can run.
- Baseline players only choose valid actions.
- A game driven by a baseline player reaches `WIN`, `LOSS`, or `ABORTED`.
- Baseline runs do not crash.
- Fixed policy seed produces reproducible choices.
- Canonical regression seeds complete without undefined terminal states.

## Acceptance Criteria

- The project has cheap crash and softlock detection before LLM costs are introduced.
- Baseline players do not mutate game state directly.
- Gameplay remains structured-action based.

## AI Coder Handoff Notes

These players are not meant to be smart. They are test instruments for stability, determinism, and trace generation.
