# PHASE-11A - Acceptance Gate

## Purpose

Add version acceptance and rejection checks so each improvement is governed by tests, traces, reviews, and invariants.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-11-ACCEPTANCEGATE-BUILDING`, version acceptance rules in `02_STRUCTURE_AND_TECH_SPECS.md`, and human-governance guidance in `03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`.

## Target Outcome

Each version can generate `runs/vXXX/acceptance.md` summarizing checks, blockers, risks, and the final human decision.

## In Scope

- Deterministic acceptance checks.
- Typecheck/test command execution or recorded blocker.
- Fixed-seed simulation checks.
- Reviewer-play evidence checks.
- Changelog and artifact presence checks.
- Forbidden-feature checklist.
- Acceptance report generation.

## Out Of Scope

- Developer agent self-certification.
- Replacing human final approval.
- Automatic merging/deployment.
- Hiding missing evidence behind scorecards.

## Technical Spec

Dependencies: `PHASE-07A-VERSION-LOOP` and `PHASE-08A-DEVELOPER-AGENT-WORKFLOW`.

Acceptance checks include:

- Typecheck passes.
- Tests pass.
- Fixed seeds simulate.
- Reviewer can play when reviewer layer is available.
- Terminal state is reached.
- Trace, review, scorecard, and changelog exist as required for the version.
- Patch plan or developer task exists for reviewer-driven versions.
- No forbidden MVP feature is introduced.

The generated `acceptance.md` should distinguish pass, fail, warning, skipped, and blocked states. Human owner remains final product governor.

## Deliverables

- Acceptance checker/report generator.
- `runs/vXXX/acceptance.md` format.
- Tests for pass/fail/missing-artifact cases.

## Tests And Validation

- Acceptance report is generated.
- Failing tests cause rejection status.
- Missing changelog causes rejection or explicit blocker.
- Missing patch plan causes rejection or explicit blocker for reviewer-driven versions.
- Invalid terminal state causes rejection.
- Missing traces/reviews are flagged.
- Forbidden feature checklist appears in the report.

## Acceptance Criteria

- A version cannot be called accepted without evidence.
- Developer-agent changes are checked against global invariants.
- Blockers are concrete and actionable.

## AI Coder Handoff Notes

Mostly deterministic checks are preferred. When judgment is needed, report the evidence and leave final acceptance to the human owner.
