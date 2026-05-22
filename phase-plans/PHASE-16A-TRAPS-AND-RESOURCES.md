# PHASE-16A - Traps And Resources

## Purpose

Add bounded tactical pressure through finite traps and lightweight resource systems.

## Source Context

Derived from allowed developer additions in `01_NORTH_STAR_AND_VISION.md`, trap-heavy canonical seed guidance in `PHASE-00A`, and future gameplay-depth examples in `02_STRUCTURE_AND_TECH_SPECS.md`.

## Target Outcome

The dungeon has additional tactical decisions beyond enemies and items while remaining finite, seedable, turn-based, and structured-action based.

## In Scope

- Finite seeded traps with clear text/ASCII feedback.
- Optional lightweight resource pressure such as hunger, torch, or fatigue if kept simple.
- Trace-visible trap/resource events.
- Tests for determinism, valid actions, terminal behavior, and scorecard impact.

## Out Of Scope

- Real-time traps or timing challenges.
- Infinite survival mode.
- Hidden mechanics that cannot be inspected through traces.
- Large simulation or crafting systems.

## Technical Spec

Dependencies: all `PHASE-15*` phases.

Traps and resources should use existing content validation and seeded generation patterns. Any new resource must be serializable in `GameState` and visible enough for human and reviewer decisions.

## Deliverables

- Trap/resource content definitions.
- Engine integration and render/log feedback.
- Trace and scorecard metrics.
- Focused tests and deterministic smoke evidence.

## Tests And Validation

- Same seed produces same trap/resource placements and outcomes.
- Available actions remain structured and valid.
- Trap/resource events are recorded in traces.
- Game still reaches `WIN`, `LOSS`, or `ABORTED`.

## Acceptance Criteria

- New systems create observable tactical choices.
- Reviewer confusion does not increase due to invisible rules.
- Core protocol remains stable.

## AI Coder Handoff Notes

Favor one or two small systems over broad roguelike complexity.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
