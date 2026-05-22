# PHASE-03A - Minimal Dungeon

## Purpose

Build the first complete playable finite dungeon using the stable contract, seeded RNG, and initial content.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-03-MINIMALDUNGEON-BUILDING`, the MVP game design in `02_STRUCTURE_AND_TECH_SPECS.md`, and examples in `03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`.

## Target Outcome

The game can start from a seed, run through structured actions, and reach `WIN`, `LOSS`, or `ABORTED`.

## In Scope

- Grid map with walls and floors.
- Player position, HP, inventory, turn, floor, and objective.
- Stairs and finite floor progression.
- Slime enemy.
- Potion pickup/use.
- Movement, melee attack, wait, pickup, use item, and descend actions.
- Max-turn abort.

## Out Of Scope

- Advanced procedural map generation.
- Tactical item variety beyond Potion.
- Enemy variety beyond Slime.
- LLM player/reviewer integration.
- Browser UI.

## Technical Spec

Dependencies: `PHASE-02A-GAME-CONTRACT`, `PHASE-02B-SEEDED-RNG`, and `PHASE-02C-CONTENT-DATA`.

Implement a small game such as `Seven Floors to Dawn`:

- 5 finite floors.
- 8x8 or 10x10 grid.
- Win by reaching final stairs/shrine.
- Loss when HP reaches 0.
- Abort when max turns is reached or invalid state is detected.

All actions must come from `getAvailableActions`. `step` must update state immutably or in a controlled serializable way and emit traceable events. The same seed should reproduce the same initial dungeon setup.

## Deliverables

- Game engine implementation under `src/game/**`.
- Basic combat, item, movement, and floor progression modules as needed.
- Engine tests for terminal and mechanic behavior.

## Tests And Validation

- Player can move to valid tiles.
- Player cannot move through walls.
- Invalid actions are handled safely.
- Slime can act.
- Combat changes HP.
- Potion restores HP.
- Stairs advance floor.
- Final floor can produce `WIN`.
- HP 0 produces `LOSS`.
- Max turns produces `ABORTED`.

## Acceptance Criteria

- The dungeon is complete, finite, playable, seedable, and testable.
- The engine preserves the `GameEngine` contract.
- No forbidden MVP scope is introduced.

## AI Coder Handoff Notes

Fun is secondary in this phase. Stability and complete terminal behavior matter more than richness.
