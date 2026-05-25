# PHASE-00A - Plan Standards And Global Invariants

## Goal

Define the phase-plan format and project-wide invariants future phases must preserve.

## Scope

Documentation-only standards for phase authoring and validation.

## Allowed Paths

- `phase-plans/**`
- `concept-and-ideas/**`
- `PROGRESS.md`

## Forbidden Paths

- `.env`
- `.env.*`
- `runs/**`

## Tasks

- Define required phase-plan sections.
- Define validation and evidence expectations.
- Define forbidden project-wide changes.

## Acceptance Criteria

- Future phase plans can be implemented by another agent without guessing scope.
- Global invariants are explicit.
- Validation expectations are concrete.

## Required Validation

- `git diff --check`

## Risks

- Standards that are too vague will weaken later deterministic gates.

## Out of Scope

- Implementing application source code.
