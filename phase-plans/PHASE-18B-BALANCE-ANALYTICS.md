# PHASE-18B - Balance Analytics

## Purpose

Add higher-level balance analytics over batch runs, problem seeds, policies, and version deltas.

## Source Context

Derived from `PHASE-10B-BALANCE-TUNING`, diagnostic expansion in `PHASE-13C`, and analytics/dashboard future-layer guidance.

## Target Outcome

Balance evidence can be analyzed across versions, seeds, policies, challenge modes, and problem-run categories.

## In Scope

- Balance trend summaries.
- Seed and policy cohort breakdowns.
- Problem-run drilldowns.
- Version-to-version metric deltas.
- Version leaderboard/ranking metrics based on explicit scorecard and acceptance evidence.
- Static or dashboard-readable analytics artifacts.

## Out Of Scope

- Automatic balance patching.
- Hosted telemetry.
- Replacing reviewer critique with metrics alone.
- Required LLM runs.

## Technical Spec

Dependencies: all `PHASE-17*` phases.

Analytics should consume persisted balance summaries, traces, and scorecards. Outputs should remain local files that can also be displayed by the dashboard.

## Deliverables

- Balance analytics artifact format.
- Version leaderboard artifact format.
- Analyzer command or module.
- Tests for cohort and delta calculations.
- Viewer integration if `PHASE-18A` exists.

## Tests And Validation

- Analytics compute stable results from fixture runs.
- Problem-run categories are preserved.
- Version deltas are correct for known sample inputs.
- Leaderboard rankings are reproducible and link to underlying evidence.
- Missing data is reported without crashing.

## Acceptance Criteria

- Balance regressions can be spotted from saved evidence.
- Metrics are traceable back to runs and seeds.
- Analytics remain advisory, not automatic proof of fun.

## AI Coder Handoff Notes

Keep subjective review evidence visible beside numeric balance trends.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
