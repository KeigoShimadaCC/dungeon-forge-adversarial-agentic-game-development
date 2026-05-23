# PHASE-27A - Prepared Iteration Handoffs

## Purpose

Prepare the next game-development iteration from timeline evidence without executing commands or launching agents from the frontend.

## Source Context

Derived from `PHASE-26B-HUMAN-IDEA-AND-FEEDBACK-CAPTURE`, `PHASE-15C-LOOP-COORDINATOR`, `PHASE-14A-DEVELOPER-WORKFLOW-POLISH`, structured patch/developer handoff artifacts, and the user decision that the first working control room should prepare commands rather than run them.

## Target Outcome

The control room shows a ready/blocked next-step panel with the selected base version, relevant human comments, reviewer summary, developer context, evidence links, and exact suggested commands or tasks for an orchestrator to run.

## In Scope

- Prepared next-step artifact or view.
- Developer-facing handoff summary built from selected base version, human idea, human comments, reviewer outputs, summaries, and evidence paths.
- Suggested command/task preview using existing repo commands where applicable.
- Status labels: ready, blocked, missing evidence, or needs human decision.
- Timeline event recording that a next step was prepared.

## Out Of Scope

- Browser-triggered command execution.
- Launching Cursor, Codex, or provider-backed LLMs.
- Automatic code edits, commits, PRs, merges, or worktree cleanup.
- Acceptance decisions.
- Branching timelines.

## Technical Spec

Dependencies: `PHASE-26B`.

Add a preparation layer that reads the control-room timeline and current evidence state and produces a bounded handoff. The handoff should be explicit enough for an orchestrator or AI coding session to act on, but it must not perform the action.

The prepared handoff should include:

- Selected base version.
- Human idea and relevant human comments.
- Short version summary and reviewer findings.
- Evidence paths and missing-evidence blockers.
- Suggested next commands or generated developer-task command text.
- A concise human-visible summary explaining what will happen next.

If required evidence is absent, show blockers and do not mark the handoff ready.

For automation parallelism, keep shared-shell wiring out of this phase. It may provide self-contained handoff renderers or panel components under the handoff-specific boundary, but later dependent phases should import them into the main control-room shell.

## Deliverables

- Prepared handoff data structure and renderer.
- Self-contained control-room handoff panel or render model for next-step readiness.
- Timeline event for prepared handoffs.
- Tests for ready and blocked cases.
- Documentation explaining that execution remains human/orchestrator-owned.

## Tests And Validation

- Tests verify a ready handoff includes base version, human comments, reviewer summary, evidence paths, and suggested commands.
- Tests verify missing evidence produces blocked status.
- Tests verify the browser/UI does not execute the suggested commands.
- Tests verify prepared handoff output is deterministic.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `git diff --check`

## Acceptance Criteria

- An orchestrator can start the next coding session from the prepared handoff without guessing context.
- The human can see why the next step is ready or blocked.
- No command, agent, commit, PR, or merge is run from the browser.
- Handoff content remains evidence-backed and local.

## AI Coder Handoff Notes

This phase is about preparation, not automation. The UI may display copyable commands or task text, but it must not execute them. Keep files in the handoff-specific control-room boundary so `PHASE-27B` can run in parallel.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
