# PHASE-12A - Demo Loop

## Purpose

Produce the complete end-to-end proof-of-concept adversarial game-development demo.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-12-DEMOLOOP-BUILDING`, the MVP success criteria in `01_NORTH_STAR_AND_VISION.md`, and the minimal demonstration script in `03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`.

## Target Outcome

The repository contains at least three real game versions where reviewer play and critique drive visible, accepted improvements.

## In Scope

- `v001`: basic playable dungeon.
- `v002`: reviewer-driven tactical improvement.
- `v003`: reviewer-driven clarity, balance, or story improvement.
- Traces, reviews, scorecards, patch plans, changelogs, acceptance reports, and comparison summaries for each version.
- Rerunnable demo command or documented sequence.

## Out Of Scope

- Commercial polish.
- Browser dashboard requirement.
- Infinite roadmap expansion.
- Fabricated reviews or scorecards without playthrough traces.

## Technical Spec

Dependencies: `PHASE-01A` through `PHASE-11A`.

The demo should prove:

- Version N was played.
- Version N was criticized.
- Version N+1 changed because of that critique.
- Version N+1 remained playable.
- The difference is visible in trace, review, scorecard, and changelog.

Minimum demo sequence:

1. `v001` game is playable but shallow.
2. Reviewer plays and criticizes it.
3. Developer implements a tactical item and/or ASCII clarity improvement from a patch plan.
4. `v002` is replayed.
5. Reviewer identifies better tactical depth but may identify worse balance.
6. Developer tunes enemy/item balance from a patch plan.
7. `v003` is replayed.
8. Scorecards and reviews show improvement or clearly explain regressions.

Meaningful improvement should be shown by at least one concrete signal:

- Reviewer completes more reliably.
- Invalid actions decrease.
- A prior high-severity issue is addressed.
- Win/loss rate moves closer to target.
- Tactical item usage or new-system usage appears in traces.
- Reviewer confusion decreases in review evidence.
- The later critique becomes more advanced than basic protocol/playability complaints.

Reviewer plays must be actual playthroughs. Developer changes must be actual code or content changes. Comparisons should preserve rejected artifacts and explain decisions.

## Deliverables

- Complete `runs/v001`, `runs/v002`, and `runs/v003` evidence folders.
- Comparison summary.
- Patch plans for reviewer-driven `v002` and `v003` changes.
- Demo run instructions.
- Final acceptance report.

## Tests And Validation

- All three version folders are complete.
- Final game is playable.
- Comparison report exists.
- Demo can be rerun.
- Scorecards show meaningful changes or clearly explain regressions.
- Trace evidence demonstrates the changed system or addressed issue.
- Required tests and fixed-seed simulations pass or blockers are documented.

## Acceptance Criteria

- The MVP adversarial loop is demonstrated with real evidence.
- The final version preserves finite, turn-based, text/ASCII, seeded, structured-action gameplay.
- Improvements are traceable from review to developer change to new scorecard/comparison.

## AI Coder Handoff Notes

Do not fake the loop. If a reviewer run, test, or comparison is blocked, report the blocker and keep the demo partial rather than inventing evidence.
