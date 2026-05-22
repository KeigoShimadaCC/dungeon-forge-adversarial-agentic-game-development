# PHASE-13C - Trace Scorecard Diagnostics

## Purpose

Improve trace and scorecard diagnostics so reviewers and balance tools can explain problem runs instead of only reporting aggregate outcomes.

## Source Context

Derived from evidence requirements in `PHASE-00A`, balance work in `PHASE-10B`, demo requirements in `PHASE-12A`, and backlog items `F-09A-001`, `F-09B-001`, `F-09B-002`, `F-09C-001`, `F-09C-002`, and `F-10B-001`.

## Target Outcome

Scorecards and traces expose enough structured data to diagnose enemy behavior, item usage, map-generation edge cases, softlocks, aborts, and repeated problem seeds.

## In Scope

- Scorecard metrics for non-attack enemy behaviors.
- Item-aware baseline policy evidence for tactical item evaluation.
- Map-generation metadata in trace/evidence summaries.
- Clear problem-run categories for aborts, softlocks, impossible placement, and repeated failures.

## Out Of Scope

- Automatic balance patches.
- Large analytics dashboard.
- Changing core gameplay rules except where needed for explicit invalid-state diagnostics.
- External telemetry services.

## Technical Spec

Dependencies: `PHASE-12A-DEMO-LOOP`.

Extend existing trace and scorecard shapes in a backward-compatible way where possible. Problem diagnostics should be structured JSON fields, with human-readable messages as an aid rather than the only evidence.

## Deliverables

- Expanded trace metadata.
- Expanded scorecard metrics.
- Item-aware baseline evaluation coverage.
- Tests for diagnostic fields and problem-run reporting.

## Tests And Validation

- Enemy behavior events aggregate into scorecards.
- Tactical item use opportunities are exercised by at least one deterministic policy or targeted fixture.
- Map-generation metadata is reproducible by seed.
- Problem runs are categorized visibly in balance summaries.

## Acceptance Criteria

- Balance and reviewer reports can explain why a seed failed or aborted.
- New diagnostics preserve JSON serializability and deterministic reruns.
- Existing trace consumers remain usable or receive documented migration behavior.

## AI Coder Handoff Notes

Prefer additive fields over breaking schema changes. If a schema change is unavoidable, document it in the phase output and tests.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
