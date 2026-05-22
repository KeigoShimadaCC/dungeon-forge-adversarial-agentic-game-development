# PHASE-07A - Version Loop

## Purpose

Create a complete versioned evaluation loop that stores traces, reviews, scorecards, patch plans, changelog, developer notes, and acceptance status per version.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-07-VERSIONLOOP-BUILDING`, version artifact rules in `01_NORTH_STAR_AND_VISION.md`, and version-folder examples in `03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`.

## Target Outcome

Each game version has a consistent local evidence folder and can be summarized or compared against another version.

## In Scope

- `runs/vXXX/` folder creation.
- Trace, review, scorecard, patch plan, changelog, developer notes, and acceptance paths.
- Scripts/commands for new version, run version, summarize version, and compare versions.
- Version comparison report format.

## Out Of Scope

- Automated code patching.
- Final acceptance gate enforcement.
- Dashboard UI.
- Git tagging automation unless minimal and clearly optional.

## Technical Spec

Dependencies: `PHASE-06A-LLM-PLAYER`, `PHASE-06B-REVIEWER-CRITIC`, and `PHASE-06C-SCORECARD`.

Version folders should follow:

```text
runs/
  v001/
    traces/
    reviews/
    scorecards/
    patch_plan.md
    changelog.md
    developer_notes.md
    acceptance.md
```

A version is not only a git commit. It is the evidence bundle proving that a version was played, reviewed, scored, planned, changed, and accepted or rejected.

The default multi-persona evidence set should support:

- `traces/seed_001_careful_player.json`.
- `traces/seed_002_naive_player.json`.
- `traces/seed_003_bug_hunter.json`.
- Matching review and scorecard artifacts for those runs.

## Deliverables

- Version folder helper.
- Version run and summary scripts.
- Version comparison script/report.
- Patch plan artifact template or path convention.
- Tests for output paths and comparison shape.

## Tests And Validation

- Version folder is created.
- Traces save under the correct version.
- Reviews save under the correct version.
- Scorecards save under the correct version.
- Patch plan, changelog, and developer notes paths are present.
- Comparison report can be generated.

## Acceptance Criteria

- A future developer can inspect why a version exists and what changed.
- A future developer can inspect the intended patch before reading the changelog.
- Rejected versions can remain as evidence with reasons.
- Version artifacts are local, deterministic where possible, and not hand-edited when regenerable.

## AI Coder Handoff Notes

Preserve evidence. Do not delete rejected-version artifacts just because a later version improves on them.
