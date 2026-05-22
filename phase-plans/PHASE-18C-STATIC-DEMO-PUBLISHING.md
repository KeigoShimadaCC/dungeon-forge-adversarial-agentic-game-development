# PHASE-18C - Static Demo Publishing

## Purpose

Generate shareable static demo bundles from local adversarial-loop evidence.

## Source Context

Derived from demo goals in `PHASE-12A`, dashboard goals in `PHASE-18A`, and the project need to show traceable improvement over versions.

## Target Outcome

The project can produce a static HTML or Markdown evidence bundle that explains the loop, versions, reviewer findings, scorecards, changes, and acceptance decisions.

## In Scope

- Static demo export command.
- Version timeline summary.
- Links or embedded summaries for traces, reviews, scorecards, changelogs, and acceptance.
- Clear labeling of generated, accepted, rejected, blocked, and partial evidence.

## Out Of Scope

- Hosting or deployment.
- Marketing landing page.
- Fabricating missing evidence.
- Interactive gameplay requirements.

## Technical Spec

Dependencies: all `PHASE-17*` phases.

The exporter should read local evidence and write static files that can be inspected without running the harness. Missing evidence must be represented as missing or blocked, not papered over.

## Deliverables

- Static demo export command.
- Exported demo bundle format.
- Tests for complete and incomplete evidence exports.
- Documentation for regenerating the bundle.

## Tests And Validation

- Complete evidence produces a complete static bundle.
- Missing artifacts are called out in the bundle.
- Export does not mutate original evidence.
- Generated bundle includes version comparisons and acceptance status.

## Acceptance Criteria

- A reader can understand how the game improved across versions.
- Claims in the demo trace back to saved artifacts.
- Partial or rejected versions remain visible when included.

## AI Coder Handoff Notes

This is an evidence publisher, not a promotional website. Keep the artifact trail honest.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
