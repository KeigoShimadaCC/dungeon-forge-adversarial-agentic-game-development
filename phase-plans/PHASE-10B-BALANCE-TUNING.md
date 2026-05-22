# PHASE-10B - Balance Tuning

## Purpose

Add balance evaluation across fixed seeds, baseline players, and selected reviewer runs.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-10B-BALANCETUNING-BUILDING`, scorecard guidance in `02_STRUCTURE_AND_TECH_SPECS.md`, and version comparison examples in `03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`.

## Target Outcome

Batch simulation produces balance summaries that help compare version difficulty, fairness, and reliability.

## In Scope

- Batch runs over fixed seeds.
- Batch runs over baseline player policies.
- Optional selected LLM reviewer runs when credentials are available.
- Summary metrics and version-to-version comparison.
- Failed-seed reporting.

## Out Of Scope

- Requiring LLM calls for balance checks.
- Automatic balance patch generation.
- Dashboard UI.
- Treating win rate as the only quality signal.

## Technical Spec

Dependencies: `PHASE-07A-VERSION-LOOP`; preferably after `PHASE-09A`, `PHASE-09B`, and `PHASE-09C`.

Compute metrics such as:

- Win rate.
- Average turns.
- Death floor.
- Item usage.
- Damage taken.
- Enemies defeated.
- Invalid actions.
- Abort/softlock count.

Use deterministic baseline players first. LLM reviewer runs are more expensive and should be selective, optional, and clearly labeled.

The default balance batch should include the canonical regression seeds from `PHASE-00A` and all baseline players from `PHASE-04B`. Selected LLM reviewer runs should use the initial personas from `PHASE-06A` when credentials are available.

## Deliverables

- Batch simulation command/script.
- Balance summary artifact under `runs/vXXX/`.
- Version comparison updates.
- Tests for summary shape and failure reporting.

## Tests And Validation

- Batch simulation runs.
- Balance summary is saved.
- Failed seeds are reported.
- Version-to-version balance comparison works.
- Canonical regression seed summaries are included.
- Runs do not require API credentials unless explicitly selecting LLM reviewer mode.

## Acceptance Criteria

- Balance evidence can guide scoped developer-agent improvements.
- Fixed seeds remain reproducible.
- Failures are visible instead of hidden in aggregate metrics.

## AI Coder Handoff Notes

This phase can run in parallel with `PHASE-10A` after the version loop and preferably after gameplay-depth phases. Keep the first summaries small and readable.
