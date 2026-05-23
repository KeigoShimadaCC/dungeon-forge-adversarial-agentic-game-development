# PHASE-26A - Control Room Web Shell

## Purpose

Add the first local browser control-room shell for reading the adversarial loop timeline and evidence at a human-friendly level.

## Source Context

Derived from `PHASE-25A-CONTROL-ROOM-TIMELINE-ARTIFACTS`, `PHASE-25B-AGENT-ROLES-PERSONAS-AND-MODELS`, `PHASE-18A-VERSION-DASHBOARD`, `PHASE-18C-STATIC-DEMO-PUBLISHING`, and the user request for a chat-like interface that shows two AIs discussing changes when the human does not intervene.

## Target Outcome

A local browser page shows the control-room timeline, version summaries, actor labels, role/persona/model metadata, and evidence links without executing commands or becoming the source of truth.

## In Scope

- Local browser UI shell or static local HTML/app surface.
- Chat-like timeline grouped by version.
- Quick summary strip for each version.
- Actor labels for human, game developer, game reviewer, and narrator.
- Expandable links or panels for trace, review, scorecard, changelog, developer notes, comparison, acceptance, and summary artifacts.
- Prompt/persona/model display from the role catalog.
- Empty and missing-evidence states.

## Out Of Scope

- Running local commands from the browser.
- Launching Cursor, Codex, reviewer agents, or provider-backed LLM calls.
- Capturing human comments.
- Branching timelines.
- Hosted deployment, authentication, accounts, or databases.
- Changing game engine or harness behavior.

## Technical Spec

Dependencies: `PHASE-25A` and `PHASE-25B`.

Build the smallest browser-readable control-room surface that can consume the timeline artifact and role catalog. It may be generated static HTML or a local app, but it must remain local and evidence-backed.

The UI should present:

- A top-level session header with current active base version and runs root.
- A chronological chat/timeline feed.
- Version sections with short summaries and evidence status.
- Role/persona/model panels that are read-only.
- Clear labels distinguishing summary, raw evidence, human comments, and missing evidence.

If a local server is introduced, document the command and keep it optional for the existing headless workflows.

## Deliverables

- Local control-room web shell.
- Loader integration with timeline and role/persona catalog data.
- Documentation for generating or opening the page.
- Focused tests and/or browser smoke for rendering the shell with fixture data.

## Tests And Validation

- Tests verify timeline events render in order.
- Tests verify missing evidence appears as missing.
- Tests verify role/persona/model panels render without secrets.
- Browser smoke or static HTML assertion for the fixture timeline.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `git diff --check`

## Acceptance Criteria

- A human can understand version progression from one local browser surface.
- The UI links back to evidence rather than replacing it.
- The UI does not execute commands or mutate artifacts.
- Existing terminal human-play, dashboard, static-demo, and harness flows remain usable.

## AI Coder Handoff Notes

Optimize for “first it works.” Do not build the full control room yet. Keep styling functional, readable, and consistent with the existing local dashboard/static demo surfaces.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
