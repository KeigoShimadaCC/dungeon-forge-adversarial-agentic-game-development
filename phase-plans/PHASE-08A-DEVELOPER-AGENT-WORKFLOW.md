# PHASE-08A - Developer Agent Workflow

## Purpose

Define the repeatable workflow that turns reviewer evidence into scoped coding-agent implementation tasks.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-08-DEVELOPERAGENT-WORKFLOW-BUILDING`, developer-agent guidance in `02_STRUCTURE_AND_TECH_SPECS.md`, and handoff examples in `03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`.

## Target Outcome

A human can generate or assemble a bounded developer-agent task using the previous review, scorecard, allowed/forbidden changes, target scope, and test commands.

## In Scope

- Developer task template.
- Reviewer-to-developer handoff format.
- Allowed/forbidden change checklist.
- Patch plan template.
- Changelog template.
- Test command checklist.
- Prompt templates under `src/agents/prompts/**` or docs.

## Out Of Scope

- Fully autonomous patch pipeline.
- Letting reviewer output directly edit code.
- Broad roadmap expansion.
- Accepting changes without tests and evidence.

## Technical Spec

Dependencies: `PHASE-07A-VERSION-LOOP`.

Developer tasks must include:

- Previous review path.
- Previous scorecard path.
- Target version.
- Target scope.
- Allowed changes.
- Forbidden changes.
- Required test commands.
- Required patch plan path.
- Required changelog path.
- Expected implementation summary.

Start manual: the human owner can copy the task into Codex CLI, Claude Code, or another coding agent. Automation can come later.

Patch plans should record:

- Review issues being addressed.
- Proposed one to three scoped changes.
- Files/modules expected to change.
- Tests/checks to add or rerun.
- Explicit non-goals and forbidden changes.

## Deliverables

- Developer task template.
- Handoff generator or documented manual format.
- Patch plan template.
- Changelog template.
- Tests for generated task shape if a generator is implemented.

## Tests And Validation

- Developer task can be generated from review/scorecard inputs.
- Task includes allowed and forbidden changes.
- Task includes test commands.
- Task requires a patch plan path.
- Task requires a changelog path.
- Task preserves global invariants and phase scope.

## Acceptance Criteria

- A coding agent can implement a scoped improvement without guessing product direction.
- The task blocks protocol-breaking requests such as changing `GameEngine`, removing seed determinism, or adding infinite floors.
- The workflow remains human-governed.

## AI Coder Handoff Notes

Do not over-automate orchestration yet. The valuable artifact is a precise, bounded task with evidence and tests.
