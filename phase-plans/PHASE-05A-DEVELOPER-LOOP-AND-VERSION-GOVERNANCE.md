# PHASE-05A - Developer Loop And Version Governance

## Purpose

Define and implement the governed loop where a coding agent receives reviewer evidence, makes one to three scoped improvements, and the harness accepts or rejects the new version.

## Source Context

Use `concept-and-ideas/01_NORTH_STAR_AND_VISION.md` sections 8-11, `concept-and-ideas/02_STRUCTURE_AND_TECH_SPECS.md` sections 9.2 and 15-16, and the developer task examples in `concept-and-ideas/03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`.

## Target Outcome

Each iteration produces a new version record with review input, scoped developer task, developer patch plan, changelog, change summary, tests, harness results, scorecard, and acceptance decision.

## In Scope

- Developer task template.
- Developer patch-plan and change-summary artifact format.
- Allowed/disallowed change policy.
- Changelog and developer-notes artifact format.
- Acceptance decision artifact.
- Version naming convention.
- Manual or semi-automated handoff to a coding agent.

## Out Of Scope

- Fully autonomous worktree orchestration.
- Automatic merging of code changes.
- Dashboard or web review UI.
- Broad engine rewrites.

## Technical Spec

Developer tasks must include:

- Current version and target next version.
- Reviewer summary and evidence.
- Allowed changes.
- Forbidden changes.
- Maximum number of improvements.
- Required test commands.
- Required artifact updates.

Each candidate version should save:

- developer patch plan, written before or during implementation
- changelog, written after implementation
- change summary, explaining what changed relative to the prior accepted version
- developer notes, including rejected alternatives when relevant
- acceptance decision, written after validation

Allowed MVP improvements:

- Items, enemies, traps, simple events, floor rules, and balance changes.
- ASCII/Unicode render clarity.
- Finite NPCs and dialogue trees in later scoped phases.
- Tactical combat actions when still structured and turn-based.

Forbidden changes:

- Breaking `GameEngine`.
- Removing seed determinism.
- Removing terminal states.
- Adding required images/audio.
- Adding infinite play as the main mode.
- Adding arbitrary free-text action systems.
- Depending on external services during gameplay.

## Deliverables

- Developer task template in docs or prompts.
- Developer patch-plan and change-summary templates.
- Version artifact structure under `runs/vNNN/`.
- Changelog and acceptance document conventions.
- Validation command or checklist for accepting/rejecting a version.

## Tests And Validation

- `pnpm test`
- Regression seed simulations.
- Reviewer playthrough, mocked or real.
- Manual forbidden-feature checklist.

Acceptance validation must confirm:

- Typecheck passes.
- Tests pass.
- Fixed-seed simulations run.
- Reviewer can play without protocol failure.
- Terminal result is defined.
- Changelog explains changes.
- Forbidden features were not introduced.

## Acceptance Criteria

- New versions are accepted only after evidence-backed validation.
- Rejected versions preserve artifacts explaining why they failed.
- Developer-agent work remains scoped to one to three improvements per loop.
- The harness, not the developer agent, decides whether protocol checks pass.

## AI Coder Handoff Notes

This phase is about governance more than clever automation. A manual human-selected developer task is acceptable for MVP as long as the artifact trail is complete and enforceable.
