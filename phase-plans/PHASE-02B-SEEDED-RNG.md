# PHASE-02B - Seeded RNG

## Purpose

Implement deterministic randomness for reproducible game setup, procedural generation, and baseline-player behavior.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-02B-SEEDEDRNG-BUILDING`, seeded randomness constraints in `01_NORTH_STAR_AND_VISION.md`, and regression-seed expectations in `02_STRUCTURE_AND_TECH_SPECS.md`.

## Target Outcome

A small RNG utility provides deterministic integer, float, shuffle, and weighted-choice operations from a seed.

## In Scope

- Seed-to-RNG initialization.
- Random float and bounded integer helpers.
- Deterministic shuffle.
- Deterministic weighted choice.
- Tests proving same seed means same sequence.

## Out Of Scope

- Full map generation.
- Cryptographic randomness.
- Runtime use of `Math.random()` inside game logic.
- Non-deterministic content loading.

## Technical Spec

Dependencies: `PHASE-01A-PROJECT-STRUCTURE`.

Add `src/game/rng.ts` or equivalent. The API should be simple enough for game logic, content placement, enemy behavior, map generation, and baseline policies to share.

Any function that needs randomness must receive an RNG or seed-derived state explicitly. Avoid hidden global RNG state unless it is serializable and restored through `GameState`.

## Deliverables

- Seeded RNG module.
- Unit tests for deterministic sequences.
- Guidance in comments or docs that game logic must not call `Math.random()` directly.

## Tests And Validation

- Same seed produces the same float sequence.
- Same seed produces the same integer sequence.
- Different seeds usually produce different sequences.
- Shuffle is deterministic.
- Weighted choice is deterministic for a fixed seed and weights.

## Acceptance Criteria

- Re-running a fixed seed can reproduce initial state and procedural decisions.
- RNG helpers are easy to inject into later game systems.
- No game module introduced in this phase uses `Math.random()` directly.

## AI Coder Handoff Notes

Prefer a small known deterministic algorithm over clever abstractions. Keep the API stable and test behavior rather than exact implementation internals.
