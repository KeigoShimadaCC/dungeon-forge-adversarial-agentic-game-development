# PHASE-18A - Version Dashboard

## Purpose

Add a local viewer for versions, traces, reviews, scorecards, changelogs, comparisons, and acceptance status.

## Source Context

Derived from dashboard future-layer guidance in `02_STRUCTURE_AND_TECH_SPECS.md`, demo evidence in `PHASE-12A`, and human inspection needs from `PHASE-17*`.

## Target Outcome

A local dashboard or static viewer lets humans inspect the adversarial loop without reading raw JSON first.

## In Scope

- Local-only dashboard or static viewer.
- Version list and artifact status.
- Evidence-backed version leaderboard or ranking view.
- Trace/review/scorecard/changelog/acceptance detail views.
- Links to persisted summary and comparison artifacts.

## Out Of Scope

- Hosted production deployment.
- Database-backed analytics.
- Authentication.
- Editing game state or generated evidence from the dashboard.

## Technical Spec

Dependencies: all `PHASE-17*` phases.

The dashboard must read local artifacts and treat them as source data. It should not become the source of truth for gameplay, acceptance, or reviews.

## Deliverables

- Local viewer implementation.
- Artifact loading and missing-artifact states.
- Documentation for launching the viewer.
- Tests or browser smoke checks if a browser UI is used.

## Tests And Validation

- Viewer loads a sample version folder.
- Missing artifacts are shown clearly.
- Version leaderboard entries link back to scorecards, comparisons, and acceptance evidence.
- Trace, review, scorecard, changelog, and acceptance artifacts are inspectable.
- Core harness and tests still pass.

## Acceptance Criteria

- Humans can inspect version evidence from one local surface.
- Dashboard does not mutate evidence by default.
- The text/ASCII and headless harness path remains fully usable.

## AI Coder Handoff Notes

Keep this local and evidence-focused. Do not add deployment or user accounts.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
