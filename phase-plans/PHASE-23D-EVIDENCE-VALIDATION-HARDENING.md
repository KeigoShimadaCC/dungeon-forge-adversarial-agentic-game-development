# PHASE-23D - Evidence Validation Hardening

## Purpose

Consolidate deferred validation and test-hardening backlog items into one implementation phase.

## Source Context

Derived from `PROGRESS.MD` Future Backlog entries around CLI/browser smokes, dashboard checks, replay smoke coverage, JSON output assertions, deterministic report regeneration, PHASE-13B validation docs, and PHASE-21A/22A autopilot safety work.

## Target Outcome

The repo has stronger evidence validation around generated artifacts, CLI outputs, static HTML, replay commands, governance JSON, and deterministic report behavior.

## In Scope

- Add focused tests for deferred validation gaps that still apply.
- Add or document small CLI smokes for replay, dashboard/static demo, content-governance JSON, and acceptance evidence.
- Harden generated artifact checks where missing evidence can currently look healthy.
- Preserve clear blocker reporting for environment-dependent validation.
- Update validation docs and progress backlog status.

## Out Of Scope

- Rewriting the full CI system.
- Introducing hosted browser testing or external services.
- Making real LLM runs mandatory.
- Changing gameplay balance or content.
- Implementing PHASE-24A browser play UI.

## Technical Spec

Dependencies: `PHASE-23C`.

Start from the Future Backlog and re-verify which items are still relevant. Convert valid backlog entries into focused tests or documented smokes. Mark obsolete entries explicitly in `PROGRESS.MD` rather than silently leaving them stale.

All validation should remain local-first and credential-free unless explicitly optional.

## Deliverables

- Focused tests or smokes for the selected validation gaps.
- Updated validation documentation.
- Updated `PROGRESS.MD` Future Backlog statuses.
- Validation log with exact commands and blockers.

## Tests And Validation

- Focused tests for newly hardened paths.
- `pnpm run check`
- `git diff --check`

If browser validation is added, include a documented local command and a non-browser fallback for environments that cannot launch a browser.

## Acceptance Criteria

- Deferred validation backlog is triaged and materially reduced.
- New checks fail clearly on missing or malformed evidence.
- Required validation stays credential-free.
- No generated artifact is treated as proof without trace or source evidence.

## AI Coder Handoff Notes

Treat this as test and validation hardening, not feature expansion. Keep each added check small and tied to an existing gap.
