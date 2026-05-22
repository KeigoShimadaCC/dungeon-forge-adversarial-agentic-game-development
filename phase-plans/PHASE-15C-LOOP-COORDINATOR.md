# PHASE-15C - Loop Coordinator

## Purpose

Create a human-governed coordinator for the adversarial loop from run evidence through proposal, task, validation, and acceptance.

## Source Context

Derived from the core loop in `01_NORTH_STAR_AND_VISION.md`, harness flow in `02_STRUCTURE_AND_TECH_SPECS.md`, demo sequence in `PHASE-12A`, and automation future-layer guidance.

## Target Outcome

A documented command or runbook can guide one full loop iteration while keeping implementation, acceptance, and merge decisions explicit.

## In Scope

- Orchestration runbook or lightweight command.
- Ordered steps for run, review, proposal, developer task, validation, and acceptance.
- Checkpoint output for blockers and required human decisions.
- Integration with existing version-loop and acceptance artifacts.

## Out Of Scope

- Fully autonomous game studio behavior.
- Automatic code editing or merging.
- Required LLM provider calls in default loop.
- Dashboard UI.

## Technical Spec

Dependencies: all `PHASE-14*` phases.

The coordinator should chain existing commands where practical and stop at decision points. It should record what was run, what evidence exists, and what human choice is needed next.

## Deliverables

- Loop coordinator runbook or command.
- Decision-checkpoint format.
- Tests or scripted dry-run coverage for command sequencing.
- Documentation for blocked, partial, accepted, and rejected loop outcomes.

## Tests And Validation

- Coordinator detects missing run evidence.
- Coordinator detects missing proposal or developer task where required.
- Coordinator records validation blockers without fabricating success.
- Credential-free path works with deterministic baseline evidence.

## Acceptance Criteria

- A future operator can run one loop without re-deriving command order.
- Human decisions remain explicit.
- The loop preserves trace, review, scorecard, changelog, and acceptance artifacts.

## AI Coder Handoff Notes

Stop on blockers. Do not hide missing evidence behind optimistic summaries.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
