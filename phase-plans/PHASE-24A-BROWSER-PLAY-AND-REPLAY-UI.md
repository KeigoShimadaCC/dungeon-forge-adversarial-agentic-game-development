# PHASE-24A - Browser Play And Replay UI

## Purpose

Add a local browser-playable and replay-inspection surface over the existing structured action and trace systems.

## Source Context

Derived from `PHASE-17A-HUMAN-PLAY-UI`, `PHASE-17B-HUMAN-PLAYTEST-TRACES`, `PHASE-17C-TRACE-REPLAY-AND-UX`, `PHASE-18A-VERSION-DASHBOARD`, current `src/human-play/**`, trace replay modules, and the North Star desire for human-inspectable evidence.

## Target Outcome

Humans can play the existing finite text/ASCII game and inspect recorded trace replays in a local browser UI without making the browser the gameplay source of truth.

## In Scope

- Local browser UI for structured-action play.
- Replay inspection over existing trace artifacts.
- Clear terminal-state, action, inventory, map, and event display.
- Save/export path for play traces compatible with the harness.
- Browser smoke or component tests if a browser UI is added.

## Out Of Scope

- Hosted production deployment.
- Accounts, authentication, databases, or cloud storage.
- Image-only, audio, or real-time gameplay.
- Free-form text commands as the required play interface.
- Mutating historical trace artifacts from replay mode.

## Technical Spec

Dependencies: `PHASE-23D`.

Reuse the existing game engine and human-play/session modules. The browser layer must call structured actions and render state; it must not define independent game rules.

Replay mode should read trace artifacts, provide step navigation, and label missing or malformed trace data clearly.

## Deliverables

- Local browser play UI.
- Replay inspection UI.
- Documentation for launching and using the local UI.
- Tests or browser smoke evidence for play, replay, and terminal states.

## Tests And Validation

- Focused unit tests for UI/session adapters where practical.
- Browser smoke for starting a game, taking an action, reaching or displaying terminal state, and loading a replay.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `git diff --check`

## Acceptance Criteria

- Browser play uses the same structured actions as the harness.
- Replay inspection is read-only with respect to existing traces.
- The headless harness and terminal human-play path remain usable.
- UI labels distinguish game state from acceptance or reviewer evidence.

## AI Coder Handoff Notes

Keep the browser as an inspection and play surface, not a new engine. Preserve text/ASCII-first gameplay and trace-backed evidence.
