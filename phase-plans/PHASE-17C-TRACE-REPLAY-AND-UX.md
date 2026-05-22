# PHASE-17C - Trace Replay And UX

## Purpose

Make existing traces easier to replay, inspect, and use for debugging reviewer or human experiences.

## Source Context

Derived from trace evidence requirements in `PHASE-12A`, reviewer evidence guidance in `01_NORTH_STAR_AND_VISION.md`, and human UI goals in `PHASE-17A`.

## Target Outcome

Developers, reviewers, and human testers can replay a saved trace step by step and inspect action history, state summaries, and notable events.

## In Scope

- Trace replay command or UI mode.
- Step-by-step render, action, event, and scorecard context.
- Readable state diffs or turn summaries.
- Text/ASCII UX polish for replay readability.

## Out Of Scope

- Video capture.
- Animation requirements.
- Browser dashboard analytics.
- Editing traces during replay.

## Technical Spec

Dependencies: all `PHASE-16*` phases.

Replay must treat trace files as evidence and should not mutate game state or generated artifacts unless explicitly writing a derived replay report.

## Deliverables

- Trace replay tool or mode.
- Replay report format if useful.
- Tests for replaying valid and malformed traces.
- Documentation for using replay during review.

## Tests And Validation

- Valid trace can be replayed to terminal status.
- Malformed trace reports clear diagnostics.
- Replay output includes chosen actions, reasons, events, and rendered states.
- Replay does not alter original evidence files.

## Acceptance Criteria

- Trace evidence is inspectable without rerunning the game.
- Replay helps diagnose reviewer confusion and softlocks.
- Original trace artifacts remain unchanged.

## AI Coder Handoff Notes

Prioritize evidence readability over UI polish.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
