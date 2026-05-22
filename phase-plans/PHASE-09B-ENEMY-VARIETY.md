# PHASE-09B - Enemy Variety

## Purpose

Add varied enemy types so combat and movement are less repetitive.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-09B-ENEMYVARIETY-BUILDING` and bounded gameplay expansion guidance in `01_NORTH_STAR_AND_VISION.md`.

## Target Outcome

The dungeon includes several enemy types with distinct, deterministic behaviors and traceable actions.

## In Scope

- Enemies such as Bat, Shell, Thief, or Ghost.
- Content records for each enemy.
- Simple deterministic AI behaviors.
- Spawn integration.
- Render/log/trace support.
- Tests for behavior and determinism.

## Out Of Scope

- Complex real-time combat.
- Open-ended enemy scripting through LLM calls during play.
- Large bestiary expansion.
- Breaking Slime or existing combat semantics.

## Technical Spec

Dependencies: `PHASE-03A-MINIMAL-DUNGEON` and `PHASE-07A-VERSION-LOOP`.

Each enemy should define:

- Stable ID.
- Display name and symbol.
- HP or relevant stats.
- Behavior rule.
- Trace event shape.

Enemy AI should create distinct tactical pressure while remaining simple and deterministic. Examples: Bat moves quickly, Shell has high defense or waits, Thief targets items, Ghost ignores some terrain if that can be implemented safely.

## Deliverables

- New enemy content records.
- Enemy behavior implementation.
- Spawn/render/log/trace updates.
- Tests.

## Tests And Validation

- Each enemy can spawn.
- Each enemy can act.
- Behavior is deterministic under seed.
- Enemy actions are recorded in trace.
- Enemy behavior does not crash the game.
- Fixed regression seeds still reach terminal states.

## Acceptance Criteria

- Encounters are more varied without increasing protocol complexity.
- Enemy behavior remains finite and inspectable.
- Reviewer traces can explain what each enemy did.

## AI Coder Handoff Notes

Can run in parallel with `PHASE-09A` and `PHASE-09C` after `PHASE-07A`. Keep enemy behavior small and test each rule directly.
