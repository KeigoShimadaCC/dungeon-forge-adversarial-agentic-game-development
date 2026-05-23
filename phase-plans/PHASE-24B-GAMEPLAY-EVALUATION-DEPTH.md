# PHASE-24B - Gameplay Evaluation Depth

## Purpose

Improve tactical evaluation, balance problem-run handling, enemy/map metrics, and bounded content-depth analysis.

## Source Context

Derived from `PHASE-09A` through `PHASE-10B`, `PHASE-13C`, `PHASE-16A` through `PHASE-16C`, `PHASE-18B`, current balance analytics, trace diagnostics, challenge modes, scenario packs, enemies, maps, items, and the North Star definition of meaningful improvement.

## Target Outcome

Evaluation artifacts better explain why runs succeed, fail, stall, or feel shallow, and they expose tactical depth across enemies, maps, items, traps, resources, and scenario packs.

## In Scope

- Add or refine metrics for enemy pressure, map/navigation friction, tactical item value, trap/resource interaction, scenario depth, and problem-run categories.
- Improve handling and reporting of failed, stalled, or degenerate runs.
- Add tests for metric calculation and diagnostic summaries.
- Document how humans should interpret deeper evaluation output.

## Out Of Scope

- Large new content packs.
- Core engine rewrite.
- Changing acceptance to be fully automated by metrics.
- Requiring browser UI or real LLM runs.
- Infinite or open-ended gameplay.

## Technical Spec

Dependencies: `PHASE-24A`.

Use existing traces, scorecards, balance analytics, and diagnostics as the data source. New metrics must be derived from actual run evidence, not design intent alone.

Problem-run reporting should separate bugs/protocol failures, expected hard losses, balance outliers, softlocks, reviewer/player policy issues, and missing evidence.

## Deliverables

- Deeper evaluation metrics and summaries.
- Problem-run categorization improvements.
- Tests covering metric and category behavior.
- Documentation for interpreting evaluation results.

## Tests And Validation

- Focused metric and diagnostics tests.
- Regression tests for problem-run categories.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `git diff --check`

## Acceptance Criteria

- Evaluation identifies more than win/loss and scorecard averages.
- Problem runs are classified with actionable reasons.
- Metrics remain trace-backed and reproducible.
- Human acceptance remains the final gate for creative quality.

## AI Coder Handoff Notes

This phase deepens evaluation; it should not hide poor gameplay by inventing optimistic metrics. Preserve honest failure evidence.
