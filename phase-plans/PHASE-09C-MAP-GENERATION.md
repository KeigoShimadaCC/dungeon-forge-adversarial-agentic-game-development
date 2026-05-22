# PHASE-09C - Map Generation

## Purpose

Improve seeded procedural dungeon generation while preserving validity, reachability, and determinism.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-09C-MAPGENERATION-BUILDING`, seeded constraints in `01_NORTH_STAR_AND_VISION.md`, and regression-seed guidance in `02_STRUCTURE_AND_TECH_SPECS.md`.

## Target Outcome

Generated floors have rooms, corridors, valid spawn points, item placement, enemy placement, stairs placement, and floor difficulty scaling.

## In Scope

- Seeded room/corridor generation.
- Valid player, enemy, item, and stairs placement.
- Reachability checks.
- Floor difficulty scaling.
- Regression seed tests.

## Out Of Scope

- Infinite floors.
- Open-world travel.
- Non-deterministic generation.
- Renderer or engine contract rewrites.

## Technical Spec

Dependencies: `PHASE-02B-SEEDED-RNG`, `PHASE-03A-MINIMAL-DUNGEON`, and `PHASE-07A-VERSION-LOOP`.

Every generated floor must satisfy:

- Player spawn is on a valid tile.
- Stairs are reachable from player spawn.
- Enemies and items spawn on valid tiles.
- Generated layout is deterministic by seed.
- Generation failure has a bounded retry/fallback path that cannot loop forever.

Use the shared seeded RNG and keep map output serializable in `GameState`.

## Deliverables

- Map generation module.
- Reachability/validation helpers.
- Spawn placement integration.
- Regression seed tests.

## Tests And Validation

- Same seed produces the same map.
- Different seeds produce different maps.
- Stairs are reachable.
- Player spawn is valid.
- Enemies and items spawn on valid tiles.
- Fixed regression seeds pass.
- Generation cannot hang indefinitely.

## Acceptance Criteria

- Procedural variation improves replayability while preserving finite game rules.
- Map failures become `ABORTED` or deterministic fallback behavior, not crashes or hangs.
- The harness can reproduce trace evidence by seed.

## AI Coder Handoff Notes

Can run in parallel with `PHASE-09A` and `PHASE-09B` after `PHASE-07A`. Reachability and determinism are higher priority than elaborate layouts.
