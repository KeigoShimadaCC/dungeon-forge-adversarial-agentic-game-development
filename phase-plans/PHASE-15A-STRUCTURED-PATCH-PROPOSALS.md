# PHASE-15A - Structured Patch Proposals

## Purpose

Introduce structured, validated patch proposals that translate reviewer critique into bounded candidate changes before any code is edited.

## Source Context

Derived from future-layer guidance in `02_STRUCTURE_AND_TECH_SPECS.md`, patch-plan artifacts in `PHASE-07A`, developer workflow in `PHASE-08A`, and human governance guidance in `03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`.

## Target Outcome

Reviewer issues can produce machine-readable proposed changes with scope, evidence, risks, allowed paths, forbidden changes, and validation commands.

## In Scope

- Patch-proposal JSON schema.
- Validation against global invariants and forbidden features.
- Linkage to trace, review, scorecard, and acceptance evidence.
- Non-mutating proposal generation command or helper.

## Out Of Scope

- Applying patches automatically.
- Letting reviewer output mutate source files.
- Free-form game design expansion outside bounded proposals.
- Automatic merge or release decisions.

## Technical Spec

Dependencies: all `PHASE-14*` phases.

Patch proposals should be generated as evidence-backed planning artifacts. They may feed the developer-task workflow but must remain separate from implementation authority.

## Deliverables

- Patch-proposal schema and validator.
- Proposal generation or assembly command.
- Tests for valid, invalid, forbidden, and incomplete proposals.
- Documentation of how proposals feed developer tasks.

## Tests And Validation

- Valid proposal references existing evidence artifacts.
- Forbidden features are rejected or flagged as blockers.
- Missing evidence prevents proposal acceptance.
- Generated developer task can consume a valid proposal.

## Acceptance Criteria

- A proposal cannot claim a change without evidence and scope.
- Human owner can choose, reject, or revise proposals before implementation.
- Protocol and gameplay invariants remain explicit.

## AI Coder Handoff Notes

This phase creates planning artifacts only. Do not implement automatic patch application.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
