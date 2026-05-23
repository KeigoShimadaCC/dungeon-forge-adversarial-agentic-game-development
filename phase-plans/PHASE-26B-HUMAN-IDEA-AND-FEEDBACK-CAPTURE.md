# PHASE-26B - Human Idea And Feedback Capture

## Purpose

Let the human enter the initial game idea and later add comments that the developer agent can treat like human review input.

## Source Context

Derived from `PHASE-26A-CONTROL-ROOM-WEB-SHELL`, `PHASE-25A-CONTROL-ROOM-TIMELINE-ARTIFACTS`, human playtest trace concepts, and the user request that a human can intervene or comment while the game dev considers the comment like review feedback.

## Target Outcome

The control room can capture a game idea and per-version human comments, store them in the timeline artifact, and show them alongside developer/reviewer/narrator events.

## In Scope

- Initial game idea input.
- Per-version human comment input.
- Timeline persistence for human-authored events.
- Basic validation for empty and oversized text.
- Prepared context fields that later developer handoffs can consume.
- UI display of human comments in the chat-like timeline.

## Out Of Scope

- Free-form gameplay commands.
- Automatic code edits or agent execution.
- Treating human comments as trace-backed reviewer evidence.
- Multi-user identity.
- Rich text, attachments, or media uploads.

## Technical Spec

Dependencies: `PHASE-26A`.

Extend the control-room web shell and timeline artifact helpers so user-authored text can be added locally. The implementation should clearly label human-authored content and preserve exact text after lightweight normalization.

Validation should reject empty comments and enforce a reasonable maximum length. Oversized or invalid comments must fail with a clear UI/API diagnostic and must not corrupt the timeline artifact.

Human input should be available to later prepared handoff logic as structured context: initial idea, selected version, comment text, timestamp, and optional target version.

## Deliverables

- UI controls for initial idea and per-version comments.
- Timeline artifact write path for human-authored events.
- Validation and diagnostics for invalid input.
- Tests for persistence, rendering, and prepared-context shape.

## Tests And Validation

- Tests verify an initial idea becomes a timeline event.
- Tests verify a per-version human comment is attached to the intended version.
- Tests verify empty/oversized input is rejected without partial writes.
- Tests verify human comments are not counted as reviewer trace evidence.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `git diff --check`

## Acceptance Criteria

- The human can start the loop with a general game idea.
- The human can intervene on a version with a visible comment.
- Human-authored feedback is preserved and distinguishable from AI summaries and raw evidence.
- No local commands or agents are executed by this phase.

## AI Coder Handoff Notes

Keep comments plain text and local. The important behavior is durable, clearly attributed human feedback that later phases can pass into prepared developer context.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
