# PHASE-17B - Human Playtest Traces

## Purpose

Capture human playtest sessions in the same evidence model as agent playthroughs.

## Source Context

Derived from human playtesting future-layer guidance, trace formats in `02_STRUCTURE_AND_TECH_SPECS.md`, and artifact invariants in `PHASE-00A`.

## Target Outcome

Human sessions can produce trace, scorecard, notes, and acceptance-adjacent evidence comparable to agent runs.

## In Scope

- Human policy/persona labeling.
- Trace capture from human-selected structured actions.
- Optional human notes or post-run feedback artifact.
- Scorecard generation from human traces.

## Out Of Scope

- User accounts.
- Remote telemetry.
- Competitive player leaderboard.
- Replacing reviewer-agent evidence.

## Technical Spec

Dependencies: all `PHASE-16*` phases.

Human traces should use the existing trace schema with clear metadata distinguishing human runs from baseline and LLM runs.

## Deliverables

- Human trace capture path.
- Human run metadata fields.
- Scorecard support for human traces.
- Tests or smoke checks for trace shape.

## Tests And Validation

- Human-like scripted fixture produces a valid trace.
- Scorecard can be generated from a human trace.
- Human run metadata appears in summaries.
- Agent run behavior remains unchanged.

## Acceptance Criteria

- Human playtesting can be compared with agent playtesting.
- Captured actions remain structured and replayable.
- No private user data is required.

## AI Coder Handoff Notes

Keep personal data out of artifacts unless the user explicitly requests a labeled local run.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
