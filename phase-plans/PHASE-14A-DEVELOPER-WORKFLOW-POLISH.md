# PHASE-14A - Developer Workflow Polish

## Purpose

Make developer-agent handoffs easier to use, validate, and audit without making the coding agent autonomous.

## Source Context

Derived from `PHASE-08A-DEVELOPER-AGENT-WORKFLOW`, human-governed workflow guidance in `03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`, and backlog items `F-08A-001` through `F-08A-004`.

## Target Outcome

Developer-task artifacts are readable, repo-relative, help-discoverable, and capable of reporting multiple diagnostics at once.

## In Scope

- Repo-relative artifact paths where possible.
- `--help` or usage output for developer workflow commands.
- Optional writing of `patch_plan.md` and `changelog.md` templates.
- Categorized validation diagnostics for allowed, proposed, forbidden, warning, and blocker conditions.

## Out Of Scope

- Automatic code patching.
- Automatic commit, merge, or PR creation.
- Replacing human selection of reviewer recommendations.
- Real LLM provider integration.

## Technical Spec

Dependencies: all `PHASE-13*` phases.

Improve the existing developer workflow command and generated artifacts while preserving the current human-governed model: the task can be handed to a coding agent, but the harness and human acceptance remain authoritative.

## Deliverables

- Polished developer-task output.
- Optional companion template generation.
- Usage/help output.
- Multi-diagnostic validation result shape.

## Tests And Validation

- Developer task uses repo-relative paths when the runs root is inside the repo.
- Template-writing option creates expected markdown files.
- Help output documents required and optional flags.
- Validation reports multiple diagnostics without hiding hard blockers.

## Acceptance Criteria

- A developer agent can start work from the generated task without guessing artifact paths.
- Forbidden changes are visible before implementation.
- The workflow remains human-governed and evidence-backed.

## AI Coder Handoff Notes

Keep this as workflow polish. Do not introduce a fully autonomous agent pipeline in this phase.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
