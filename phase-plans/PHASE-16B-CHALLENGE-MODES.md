# PHASE-16B - Challenge Modes

## Purpose

Add finite challenge configurations and bounded replayability without introducing endless play.

## Source Context

Derived from replayability guidance in `01_NORTH_STAR_AND_VISION.md`, scenario examples in `03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`, and the rejection of infinite floors in all concept docs.

## Target Outcome

Players and reviewers can evaluate alternate finite challenge setups with explicit endings and reproducible seeds.

## In Scope

- Challenge seed presets.
- Alternate item, enemy, floor, or event tables.
- Optional bounded extended-floor mode with explicit final floor.
- Version-loop and scorecard labels for challenge mode runs.

## Out Of Scope

- Endless dungeon mode.
- Open-world sandbox play.
- Unbounded procedural content.
- Challenge modes that require new external services.

## Technical Spec

Dependencies: all `PHASE-15*` phases.

Challenge modes should be selected through explicit config or CLI options and recorded in trace, scorecard, summary, and acceptance artifacts.

## Deliverables

- Challenge mode config format.
- At least two finite challenge presets.
- Harness support for recording selected challenge mode.
- Tests for deterministic and terminal challenge runs.

## Tests And Validation

- Each challenge mode reaches an explicit terminal state.
- Same seed and challenge mode reproduce the same initial setup.
- Summary and comparison artifacts include challenge mode labels.
- Default mode remains unchanged unless explicitly selected.

## Acceptance Criteria

- Replayability increases without sacrificing bounded evaluation.
- Challenge evidence is distinguishable from default evidence.
- No infinite/no-ending mode is introduced.

## AI Coder Handoff Notes

If a reviewer asks for more replayability, translate it into finite seeded variations.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
