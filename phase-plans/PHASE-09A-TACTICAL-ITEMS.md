# PHASE-09A - Tactical Items

## Purpose

Increase gameplay depth through finite tactical items that create meaningful choices.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-09A-TACTICALITEMS-BUILDING` and allowed developer freedom examples in `01_NORTH_STAR_AND_VISION.md` and `03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`.

## Target Outcome

The game has multiple tactical item effects with clear descriptions, valid-use conditions, state changes, render feedback, and trace events.

## In Scope

- Items such as Smoke Bomb, Swap Scroll, Reveal Dust, Fire Seed, or Warp Feather.
- Item definitions in content.
- Item effect handlers.
- Valid-use conditions.
- Render descriptions and log messages.
- Trace events for item use.

## Out Of Scope

- Pure stat-bonus filler as the main improvement.
- Infinite item generation.
- External service content generation.
- Breaking existing Potion behavior or core inventory semantics.

## Technical Spec

Dependencies: `PHASE-03A-MINIMAL-DUNGEON` and `PHASE-07A-VERSION-LOOP`.

Each item should define:

- Stable ID.
- Display name.
- Description.
- Valid use condition.
- Effect.
- Trace event shape.
- Tests.

Items should be finite and deterministic under seed. They should interact with existing movement, enemies, visibility, or positioning without changing the `GameEngine` interface.

## Deliverables

- New item content records.
- Item effect implementation.
- Render/log updates.
- Trace event updates.
- Tests.

## Tests And Validation

- Each item can be used when valid.
- Invalid use is handled safely.
- Item effects change game state as intended.
- Item descriptions render.
- Item usage is recorded in trace.
- Fixed seeds remain reproducible.

## Acceptance Criteria

- Items create tactical decisions visible to a reviewer.
- Gameplay remains finite, turn-based, and structured-action based.
- Version-loop artifacts can show whether item changes improved play.

## AI Coder Handoff Notes

Can run in parallel with `PHASE-09B` and `PHASE-09C` after `PHASE-07A`. Keep write scope coordinated around item/content modules.
