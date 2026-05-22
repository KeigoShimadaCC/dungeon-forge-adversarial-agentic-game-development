# PHASE-15B - Worktree Agent Orchestration

## Purpose

Package bounded coding-agent tasks for isolated worktrees and collect results without granting automatic merge authority.

## Source Context

Derived from `PHASE-08A-DEVELOPER-AGENT-WORKFLOW`, structured patch proposals from `PHASE-15A`, and repo workflow guidance in `AGENTS.md`.

## Target Outcome

The project can create an implementation task bundle for a coding agent, run or document it in an isolated worktree, and collect diff, tests, and artifact evidence for human review.

## In Scope

- Worktree task package format.
- Allowed paths, forbidden paths, validation commands, and evidence requirements.
- Result summary format for diffs, tests, blockers, and risks.
- Read-only auditor task format.

## Out Of Scope

- Automatic merge, push, or PR creation by the orchestrator command.
- Sending secrets or `.env` files to coding agents.
- Replacing local validation after agent output.
- Multi-agent scheduling service.

## Technical Spec

Dependencies: all `PHASE-14*` phases.

Use the existing developer-task and patch-proposal artifacts as inputs. Worktree orchestration should be reproducible and should preserve the orchestrator as reviewer of diffs, tests, and scope.

## Deliverables

- Worktree task bundle format.
- Result summary format.
- Documentation for implementation and read-only audit passes.
- Tests for task package validation.

## Tests And Validation

- Task package includes phase, evidence, allowed paths, forbidden paths, and validation commands.
- Missing scope or evidence blocks package validation.
- Result summary distinguishes pass, fail, blocked, and not-run checks.
- Local repo gates still run outside the delegated agent report.

## Acceptance Criteria

- Coding-agent work can be delegated without losing human governance.
- Agent reports are treated as advisory until verified by files and tests.
- Secrets and unrelated private files are excluded from task context.

## AI Coder Handoff Notes

Respect host sandbox approval rules. This phase defines orchestration structure, not unrestricted tool authority.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
