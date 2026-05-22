# PHASE-07A - Multi Persona Reviewers

## Purpose

Extend the reviewer system from one persona to multiple bounded reviewer personas so the game receives varied but still evidence-grounded criticism.

## Source Context

Use the reviewer role definitions in `concept-and-ideas/01_NORTH_STAR_AND_VISION.md` and the persona examples implied by `concept-and-ideas/03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`.

## Target Outcome

The harness can run and compare several reviewer personas against the same version and seed set, producing persona-specific traces, reviews, and scorecards.

## In Scope

- Persona definitions for normal player, careful player, harsh reviewer, bug hunter, balance analyst, genre-aware critic, and Steam-review-like player.
- Persona-specific prompts.
- Multi-reviewer run orchestration.
- Aggregated comparison summary.

## Out Of Scope

- Letting personas change game rules.
- Unbounded reviewer free-form actions.
- Automatic implementation of every persona suggestion.
- Replacing human governance.

## Technical Spec

Each persona must still:

- Choose from explicit available actions.
- Play before critique.
- Cite trace evidence.
- Produce bounded suggestions that can be accepted, translated, or rejected.

Aggregation should preserve disagreement. The output should show which issues are shared across personas and which are persona-specific.

Suggested personas:

- `normal_player`: plays plainly and reports baseline confusion or enjoyment.
- `careful_player`: prioritizes survival and clarity.
- `harsh_reviewer`: critiques fun and pacing aggressively.
- `bug_hunter`: probes edge cases and invalid states.
- `balance_analyst`: focuses on fairness, difficulty, and resource pressure.
- `genre_critic`: evaluates roguelike/mystery-dungeon expectations.
- `steam_reviewer`: writes concise player-facing feedback about whether the game feels worth replaying.

## Deliverables

- Persona config or prompt files.
- Harness mode for multiple personas.
- Persona-specific review artifacts.
- Aggregated comparison artifact.

## Tests And Validation

- `pnpm test`
- Mocked multi-persona run.
- At least one real or deterministic multi-persona demonstration when feasible.

Required tests:

- Persona id is stored in trace and review artifacts.
- Multiple persona outputs do not overwrite each other.
- Aggregation handles missing or failed persona runs.
- Suggestions remain tied to trace evidence.

## Acceptance Criteria

- The game can be evaluated by multiple personas without changing the game contract.
- Aggregated results help prioritize developer tasks.
- Human owner remains final governor for which changes are implemented.

## AI Coder Handoff Notes

This is a roadmap phase. Implement only after the single-reviewer loop works. Keep persona variety useful, not theatrical.
