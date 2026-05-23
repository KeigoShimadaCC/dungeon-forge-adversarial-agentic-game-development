# PHASE-23C - Longitudinal Improvement Benchmark

## Purpose

Prove repeated improvement beyond the fixed v001-v003 demo evidence with a reproducible benchmark workflow.

## Source Context

Derived from `PHASE-12A-DEMO-LOOP`, `PHASE-18B-BALANCE-ANALYTICS`, existing `runs/v001` through `runs/v003`, comparison artifacts, acceptance reports, and the North Star requirement for measurable improvement over multiple versions.

## Target Outcome

The repo can run a bounded benchmark that compares multiple versions or generated version candidates over fixed seeds/personas and produces repeatable longitudinal evidence.

## In Scope

- Define a benchmark command or documented workflow over canonical seeds and reviewer personas.
- Produce aggregate trend artifacts for completion, win/loss, turns, damage, item use, invalid actions, softlocks, scorecards, and acceptance status.
- Mark regressions, unchanged metrics, and missing evidence explicitly.
- Add tests for benchmark artifact shape and failure reporting.
- Document how the benchmark differs from the existing demo loop.

## Out Of Scope

- Requiring live LLM credentials for the required benchmark gate.
- Automatically accepting versions solely from benchmark scores.
- Generating arbitrary new gameplay content.
- Changing the core `GameEngine` contract.
- Browser visualization of benchmark results.

## Technical Spec

Dependencies: `PHASE-23B`.

The benchmark should use existing local evidence and deterministic harness paths where possible. If it can generate fresh evidence, it must write to explicit output directories and preserve rejected/problematic runs for inspection.

Metrics must be trace-backed and should not treat scorecards as proof without trace evidence. Acceptance remains human-governed.

## Deliverables

- Benchmark runner or documented reproducible workflow.
- Longitudinal summary artifact format.
- Tests for summary shape, missing evidence, and regression reporting.
- Documentation describing commands, outputs, and interpretation.

## Tests And Validation

- Focused tests for benchmark summaries and missing/regression states.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `git diff --check`

## Acceptance Criteria

- A user can produce or inspect trend evidence across at least three versions.
- Regression and missing-evidence states are visible.
- Required benchmark flow runs without API credentials.
- Evidence is grounded in traces and acceptance artifacts.

## AI Coder Handoff Notes

Do not overfit the benchmark to make the existing v001-v003 story look good. The value is honest longitudinal evidence, including flat or negative results.
