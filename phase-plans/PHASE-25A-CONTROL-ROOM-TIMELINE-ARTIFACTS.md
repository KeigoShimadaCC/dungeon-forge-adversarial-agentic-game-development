# PHASE-25A - Control Room Timeline Artifacts

## Purpose

Define the local artifact model that will let a future browser control room show the human-facing history of the adversarial game-development loop.

## Source Context

Derived from the existing version evidence under `runs/**`, `PHASE-15C-LOOP-COORDINATOR`, `PHASE-18A-VERSION-DASHBOARD`, `PHASE-18C-STATIC-DEMO-PUBLISHING`, the local-file storage invariant in `PHASE-00A`, and the user request for a chat-like frontend showing game-dev and reviewer transitions across versions.

## Target Outcome

The repo can store and load a deterministic control-room timeline that explains how a game idea moves through versions, developer summaries, reviewer summaries, human comments, prepared next steps, and non-destructive base-version selection.

## In Scope

- Local control-room session artifact format.
- Timeline event records for `human_idea`, `developer_summary`, `reviewer_summary`, `human_comment`, `version_selected_as_base`, and `prepared_next_step`.
- Version-linked references to existing trace, review, scorecard, changelog, developer notes, comparison, acceptance, and summary artifacts.
- Deterministic sorting, stable IDs, schema/version metadata, and missing-evidence labels.
- Read-only loading helpers that never infer evidence that is absent from disk.

## Out Of Scope

- Browser UI.
- Running local commands, LLM calls, or coding agents.
- Changing game engine, content, reviewer behavior, or version-loop behavior.
- Destructive rollback, deletion, or archive of later versions.
- Branching timelines or multi-user collaboration.

## Technical Spec

Dependencies: `PHASE-24B`.

Add a small control-room artifact layer under an appropriate local boundary, reusing existing harness/dashboard artifact conventions where practical. The preferred storage location is under `runs/control-room/` so generated timeline state stays with other loop evidence.

The timeline schema must be explicit, serializable, and deterministic. It should include:

- Session ID, schema version, creation/update timestamps, and runs root.
- Optional initial game idea text.
- Active base version, if selected.
- Ordered timeline events with IDs, event type, timestamp, actor label, optional version ID, summary text, evidence paths, and missing-evidence notes.
- A clear distinction between human-authored comments, AI summaries, and raw artifact references.

The loader must tolerate absent optional artifacts and record them as missing. It must reject malformed required timeline records with actionable diagnostics.

For automation parallelism, keep implementation inside the `PHASE-25A` allowed paths. Do not add shared control-room barrel exports or shared UI files in this phase; later dependent phases should perform cross-module wiring.

## Deliverables

- Control-room timeline types and artifact read/write helpers.
- Deterministic JSON serialization for timeline artifacts.
- Fixture or test helper data representing `v001 -> v002 -> v003`.
- Documentation or command notes explaining the artifact boundary.

## Tests And Validation

- Focused tests for creating a timeline from a human idea and existing version artifact paths.
- Tests for deterministic ordering and stable serialization.
- Tests for missing evidence being labeled rather than fabricated.
- Tests for malformed timeline records returning actionable diagnostics.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `git diff --check`

## Acceptance Criteria

- A future UI can render `v001 -> v002 -> v003` as a high-level timeline without reading raw JSON directly.
- Human comments are stored as human input, not as reviewer trace evidence.
- Missing traces, reviews, scorecards, or summaries are represented honestly.
- No browser UI or command execution is introduced in this phase.

## AI Coder Handoff Notes

Keep this as the data foundation only. Prefer small deterministic helpers over a general database or event-sourcing framework. Keep files in the timeline-specific control-room boundary so `PHASE-25B` can run in parallel.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
