# PHASE-28B - Control Room Polish And Scalability

## Purpose

Polish the control room after the core timeline, capture, handoff, narration, and base-selection flows work.

## Source Context

Derived from `PHASE-28A-NONDESTRUCTIVE-VERSION-BASE-SELECTION`, all `PHASE-25*` through `PHASE-27*` control-room phases, existing dashboard/static-demo patterns, and the user request for persona choice, prompt inspection, AI/model choice, quick version summaries, and scalability after first functionality.

## Target Outcome

The local control room feels coherent as a human-facing command center: it shows quick summaries, persona/model controls, prompt inspection, version context, and clear ready/blocked states without taking over execution.

## In Scope

- Persona chooser UI wired to role/persona metadata.
- Model chooser UI for prepared handoff metadata.
- Prompt inspection panels with safe visibility rules.
- Compact per-version summary cards.
- Improved empty, loading, blocked, and missing-evidence states.
- Browser smoke coverage for the full read-only/prepared-command flow.
- Documentation for the complete local control-room workflow.

## Out Of Scope

- Actual command execution from the browser.
- Launching AI agents or provider-backed loops automatically.
- Hosted deployment, authentication, accounts, or database storage.
- Branching/forking timelines.
- Replacing existing dashboard/static-demo/harness commands.

## Technical Spec

Dependencies: `PHASE-28A`.

Refine the existing control-room UI and supporting helpers without changing the core artifact contracts unless a small backward-compatible extension is necessary.

The polished UI should make these workflows obvious:

- Start from a human idea.
- Inspect developer/reviewer/narrator summaries by version.
- Read full evidence when needed.
- Add human comments.
- Choose reviewer persona/model metadata for the next prepared handoff.
- Select an older base version without losing later evidence.
- See the exact next prepared commands/tasks and why they are ready or blocked.

## Deliverables

- Polished control-room UI states and controls.
- Persona/model/prompt inspection integration.
- Quick version summary cards.
- End-to-end local workflow documentation.
- Browser smoke or equivalent UI verification.

## Tests And Validation

- Browser smoke covers loading fixture data, selecting persona/model metadata, inspecting prompt metadata, selecting a base version, adding a comment, and viewing a prepared handoff.
- Focused tests cover any helper changes.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `git diff --check`

## Acceptance Criteria

- A human can understand the iteration history from one page.
- Persona/model choices affect prepared handoff metadata, not live execution.
- Prompt inspection is useful and safe.
- The full flow remains local, evidence-backed, and non-destructive.

## AI Coder Handoff Notes

Polish should improve clarity without broadening authority. Keep the control room a human-facing layer over evidence and prepared handoffs; do not turn it into autonomous execution.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
