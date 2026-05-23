# PHASE-28A - Nondestructive Version Base Selection

## Purpose

Support “go back to version 5” as choosing an older version as the base for the next iteration without deleting or rewriting later evidence.

## Source Context

Derived from `PHASE-27A-PREPARED-ITERATION-HANDOFFS`, `PHASE-27B-NARRATED-VERSION-SUMMARIES`, existing version evidence conventions, and the user decision that rollback should mean selecting a base version rather than destructive deletion.

## Target Outcome

The control room can mark an older version as the active base for the next prepared handoff while keeping later versions visible as historical evidence.

## In Scope

- Active base version selector.
- Timeline event for base-version selection.
- Clear labels for active base, current latest version, and later historical versions.
- Prepared handoff integration so selected base drives next-step context.
- Validation that selected versions exist in local evidence.

## Out Of Scope

- Deleting, hiding permanently, or rewriting later versions.
- Git reset, git revert, worktree rollback, or branch creation.
- Branching/forked timelines.
- Acceptance or rejection of versions.
- Running commands or agents.

## Technical Spec

Dependencies: `PHASE-27A` and `PHASE-27B`.

Extend the timeline/session artifact with an active base version pointer. The pointer must only reference an existing known version. Updating it should append a timeline event instead of mutating history silently.

The UI should show:

- Active base version.
- Latest known version.
- Historical versions after the active base.
- The prepared handoff target context based on the selected base.

If a selected version is missing required evidence, the UI should still allow inspection but mark prepared handoffs as blocked until required evidence is present.

## Deliverables

- Active base version state and validation.
- UI controls for selecting a base version.
- Timeline event recording base selection.
- Prepared handoff integration.
- Tests for selection, missing version rejection, and history preservation.

## Tests And Validation

- Tests verify selecting `v005` does not remove `v006+`.
- Tests verify selecting an unknown version is rejected.
- Tests verify prepared handoff reads the selected base version.
- Tests verify timeline records base-selection events.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `git diff --check`

## Acceptance Criteria

- The human can choose an older version as the next base.
- Later versions remain inspectable as historical evidence.
- Prepared handoffs clearly state which base version they use.
- No destructive git or filesystem rollback is performed.

## AI Coder Handoff Notes

Do not implement real rollback in this phase. This is a control-room pointer and timeline event only.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
