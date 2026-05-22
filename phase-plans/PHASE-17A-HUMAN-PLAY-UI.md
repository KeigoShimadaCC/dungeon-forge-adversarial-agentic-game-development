# PHASE-17A - Human Play UI

## Purpose

Add a human-playable interface over the existing engine while keeping the harness and game protocol as source of truth.

## Source Context

Derived from TypeScript/browser future-shape guidance in `02_STRUCTURE_AND_TECH_SPECS.md`, human playtesting future layer, and text/ASCII invariants in `PHASE-00A`.

## Target Outcome

A human can play the current finite dungeon locally through a terminal or browser UI that uses structured actions and existing render/state APIs.

## In Scope

- Minimal local human-play UI.
- Structured action selection from `getAvailableActions`.
- Display of render output, recent log, HP, inventory, and terminal status.
- Saveable play trace when practical.

## Out Of Scope

- Making UI the source of truth.
- Image-only or audio-required gameplay.
- Real-time input.
- Production deployment.

## Technical Spec

Dependencies: all `PHASE-16*` phases.

The UI must call the same game core used by the harness. It may present buttons, keyboard shortcuts, or terminal choices, but it must not introduce unstructured gameplay commands.

## Deliverables

- Local human-play interface.
- Documentation for running it.
- Tests or smoke checks for action flow.
- Evidence that core engine tests still pass.

## Tests And Validation

- Human UI starts a seeded game.
- UI action choices come from available structured actions.
- UI reaches and displays terminal states.
- Core harness commands still pass.

## Acceptance Criteria

- Human play is possible without weakening agent-play protocol.
- UI does not bypass game-state validation.
- Text/ASCII play remains fully supported.

## AI Coder Handoff Notes

Prefer the smallest useful interface. Do not add a dashboard in this phase.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
