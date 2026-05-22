# PHASE-08A - Browser Playable UI

## Purpose

Add an optional browser-playable interface for humans while preserving the headless game engine and harness as the authoritative core.

## Source Context

Use the future-layer direction from `concept-and-ideas/01_NORTH_STAR_AND_VISION.md` and the TypeScript rationale in `concept-and-ideas/02_STRUCTURE_AND_TECH_SPECS.md`.

## Target Outcome

A human can play the current game version in a lightweight browser UI using the same `GameEngine` contract, while automated harness and reviewer flows remain unchanged.

## In Scope

- Lightweight web app or local UI shell.
- Render current ASCII/text game state.
- Present available actions as buttons or keyboard-accessible controls.
- Show log, inventory, HP, floor, and terminal result.
- Allow starting by seed.

## Out Of Scope

- Replacing ASCII output with required image rendering.
- Real-time gameplay.
- Multiplayer.
- Dashboard analytics.
- Production hosting.

## Technical Spec

The UI must call the same game core used by tests and harness. It should not fork rules or maintain separate gameplay logic.

Required UI behaviors:

- Start new game with a seed.
- Render state after every step.
- Disable or omit invalid actions.
- Show terminal result clearly.
- Support replay/reset without page refresh if practical.

Text/ASCII remains valid primary rendering. Visual styling may improve readability but must not become required for reviewer or harness play.

## Deliverables

- Browser UI project files using the existing TypeScript setup or a minimal compatible framework.
- UI integration with `GameEngine`.
- Basic UI tests or component tests if the stack supports them.
- Documentation for running the UI locally.

## Tests And Validation

- `pnpm test`
- `pnpm run typecheck` if available.
- UI smoke test if a browser test stack is added.
- Manual local playthrough from seed to terminal state.

Required validation:

- UI actions map exactly to available action ids.
- Headless tests still pass.
- No gameplay logic is duplicated in UI-only code.

## Acceptance Criteria

- Human play is possible through the browser.
- The harness remains the source of truth for automated evaluation.
- UI does not introduce forbidden real-time, image-only, or external-service gameplay dependencies.

## AI Coder Handoff Notes

Treat this as presentation over the existing engine. If UI complexity starts driving game architecture, stop and simplify.
