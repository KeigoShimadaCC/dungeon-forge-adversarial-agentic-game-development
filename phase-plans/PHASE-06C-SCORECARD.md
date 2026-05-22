# PHASE-06C - Scorecard

## Purpose

Create comparable objective and subjective scorecards for runs and versions.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-06C-SCORECARD-BUILDING`, scorecard format in `02_STRUCTURE_AND_TECH_SPECS.md`, and comparison examples in `03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`.

## Target Outcome

Scorecards can be generated from traces alone and enriched with reviewer scores when available.

## In Scope

- Objective metrics from traces.
- Subjective score merge from reviewer output.
- Scorecard JSON writer.
- Required-field validation.
- Tests for trace-only and trace-plus-review cases.

## Out Of Scope

- Treating scorecards as proof without trace evidence.
- Complex analytics dashboard.
- Blocking scorecard generation when subjective scores are missing.
- Human acceptance decisions.

## Technical Spec

Dependencies: `PHASE-05A-HARNESS` and `PHASE-06B-REVIEWER-CRITIC`.

Objective metrics include:

- Result.
- Turns.
- Floors reached.
- Damage taken.
- Enemies defeated.
- Items used.
- Invalid actions.
- Softlocks or abort reasons.

Subjective metrics include:

- Fun.
- Clarity.
- Fairness.
- Tactical depth.
- Replay value.

Canonical scorecard JSON must include:

- `version`.
- `seed`.
- `persona` or baseline policy ID.
- `result`.
- `turns`.
- `floors_reached`.
- `damage_taken`.
- `items_used`.
- `enemies_defeated`.
- `invalid_actions`.
- `softlocks`.
- `reviewer_scores.fun`.
- `reviewer_scores.clarity`.
- `reviewer_scores.fairness`.
- `reviewer_scores.tactical_depth`.
- `reviewer_scores.replay_value`.
- Source trace path or ID.
- Source review path or ID when available.

Missing subjective scores should be `null` or omitted consistently, but missing objective fields are validation failures.

## Deliverables

- Scorecard generation module.
- Scorecard schema/type.
- Scorecard writer under `runs/vXXX/scorecards/`.
- Tests.

## Tests And Validation

- Scorecard can be generated from trace only.
- Required objective fields exist.
- Canonical scorecard fields validate.
- Subjective fields merge when review data is available.
- Missing subjective scores do not crash generation.
- Scorecard is saved to file.

## Acceptance Criteria

- Version comparisons have consistent metrics.
- Scorecards remain tied to trace evidence.
- Scorecard generation is deterministic for the same trace and review inputs.

## AI Coder Handoff Notes

Keep scorecards simple and inspectable. They are comparison aids, not a replacement for reading traces and reviews.
