# PHASE-09A - Automated Patch Pipeline And Worktrees

## Purpose

Move from manual developer-agent handoff toward a safer automated patch pipeline using isolated worktrees and strict validation gates.

## Source Context

Use the developer-loop and future-layer notes from `concept-and-ideas/02_STRUCTURE_AND_TECH_SPECS.md` and the human-governance role in `concept-and-ideas/03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`.

## Target Outcome

Reviewer critiques can be turned into scoped coding-agent tasks executed in isolated worktrees, then validated before acceptance into the main line.

## In Scope

- Worktree creation convention.
- Developer-agent prompt/task generation.
- Validation command sequence.
- Artifact collection from candidate versions.
- Accept/reject workflow.
- Version tags for accepted versions.

## Out Of Scope

- Removing human governance.
- Letting coding agents bypass tests.
- Fully automatic production deployment.
- Arbitrary rewrite permissions.

## Technical Spec

Pipeline shape:

1. Select accepted reviewer issue(s).
2. Generate scoped developer task with allowed and forbidden changes.
3. Create isolated worktree from current accepted version.
4. Run coding agent in that worktree.
5. Run typecheck, tests, regression seeds, and reviewer/harness validation.
6. Save candidate artifacts.
7. Accept by merging/tagging or reject with reasons.

Validation must be deterministic where possible. The candidate cannot be accepted based only on the coding agent's summary.

Worktree naming should include target version and short task slug, for example `worktrees/v004-item-clarity`.

## Deliverables

- Patch-pipeline documentation.
- Script or command template for creating worktrees.
- Developer prompt generator or template.
- Candidate validation checklist.
- Accepted/rejected artifact conventions.

## Tests And Validation

- Dry-run pipeline on a small scoped change.
- Confirm candidate validation fails when tests fail.
- Confirm rejected candidate preserves reason and artifacts.
- Confirm accepted candidate can be tagged or otherwise identified.

Required checks:

- Working tree cleanliness before worktree creation.
- No unrelated files are included in candidate diff.
- Phase 00A forbidden features are checked before acceptance.

## Acceptance Criteria

- A coding agent can implement a scoped change without touching the main worktree directly.
- Broken candidates are rejected with evidence.
- Accepted candidates preserve the version artifact trail.
- Human owner can still decide which reviewer suggestions become tasks.

## AI Coder Handoff Notes

Automate the boring parts, not the product judgment. The first version of this pipeline can be mostly scripts and templates.
