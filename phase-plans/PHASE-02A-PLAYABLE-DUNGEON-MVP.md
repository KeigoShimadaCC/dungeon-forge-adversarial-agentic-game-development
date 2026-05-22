# PHASE-02A - Playable Dungeon MVP

## Purpose

Build the first playable version of the micro Mystery Dungeon game, "Seven Floors to Dawn."

## Source Context

Use the north-star game constraints from `concept-and-ideas/01_NORTH_STAR_AND_VISION.md`, the MVP game design from `concept-and-ideas/02_STRUCTURE_AND_TECH_SPECS.md`, and the v0.1 example from `concept-and-ideas/03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`.

## Target Outcome

A human or deterministic policy can play a complete finite dungeon through the stable `GameEngine` interface. The game has a clear objective, hazards, items, ASCII rendering, and explicit win/loss/abort endings.

## In Scope

- Grid map generation using seeded randomness.
- Player position, HP, inventory, and floor tracking.
- Basic enemies, starting with a simple slime.
- Basic item support, starting with a potion.
- Stairs and final shrine objective.
- Turn-based movement, melee attack, pickup, item use, descend, wait, inspect as applicable.
- ASCII render with map, HUD, inventory, recent log, and available action labels.
- Max-turn abort condition.
- Seeded procedural variation sufficient that different seeds produce meaningfully different maps, placements, or pressure.

## Out Of Scope

- Reviewer agent calls.
- Developer loop automation.
- Browser UI.
- Multiple reviewer personas.
- Complex story, NPCs, dialogue trees, or procedural narrative.

## Technical Spec

The game should start simple:

- Name: Seven Floors to Dawn.
- Initial target: 5 finite floors.
- Grid: small, readable map such as 8x8 or 10x10.
- Win: reach the final shrine or final-floor exit.
- Loss: HP reaches 0.
- Abort: max turn limit is reached or invalid state is detected.

Gameplay rules must stay deterministic for a seed. Enemy and item placement may vary by seed, but repeat runs with the same seed must match.

The first version should be random enough to produce non-identical runs across seeds, but bounded enough that the harness can still evaluate it reliably.

Action generation must only expose currently valid actions. Invalid submitted actions should not crash the engine; they should return `valid: false` or a safe error result without corrupting state.

## Deliverables

- Playable dungeon implementation behind the Phase 01A game contract.
- Map, enemy, item, combat, render, and engine modules as needed.
- Content data files if useful, but keep the first implementation lightweight.
- Tests covering key dungeon mechanics.

## Tests And Validation

- `pnpm test`
- `pnpm run typecheck` if available.

Required tests:

- Player can start on a valid walkable tile.
- Movement respects walls and map bounds.
- Enemy turns are deterministic for a fixed seed.
- Potion can be picked up and used.
- HP reaching 0 creates `LOSS`.
- Reaching final objective creates `WIN`.
- Max turns creates `ABORTED`.
- Render includes map, HP, floor, turn, inventory, and recent log.
- A simple random policy can run for many turns without crashing.

## Acceptance Criteria

- The game is playable from start to terminal state with only structured actions.
- No crashes occur for normal available actions.
- The stable engine interface from Phase 01A is unchanged.
- The result is shallow but complete enough for a reviewer to critique.

## AI Coder Handoff Notes

Prefer simple, testable mechanics over clever generation. The first game should be intentionally improvable so later reviewer/developer phases have meaningful critique to act on.
