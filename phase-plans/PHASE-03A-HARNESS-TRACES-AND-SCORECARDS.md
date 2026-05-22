# PHASE-03A - Harness, Traces, And Scorecards

## Purpose

Build the deterministic harness that runs games, records playthrough evidence, and generates scorecards without relying on a developer agent's self-report.

## Source Context

Use `concept-and-ideas/02_STRUCTURE_AND_TECH_SPECS.md` sections 9.3, 11-15, and `concept-and-ideas/03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md` sections 5-7.

## Target Outcome

The repo can run seeded playthroughs using a deterministic policy, save complete traces under `runs/`, and produce machine-readable scorecards for comparing versions.

## In Scope

- CLI or script to run a playthrough by version, seed, persona/policy, and max turns.
- Deterministic random or simple heuristic player policy.
- Crash-resistant random-policy simulation for fuzzing available actions.
- Trace serialization.
- Scorecard generation.
- Regression seed command covering canonical seeds.
- Local file storage under `runs/`.

## Out Of Scope

- LLM reviewer actions.
- Coding-agent patch automation.
- Database storage.
- Browser playback UI.

## Technical Spec

Trace files should capture:

- version
- seed
- persona or policy name
- terminal result
- turn count
- per-step render or state summary
- available actions
- chosen action
- reason when available
- events
- invalid action count

Scorecards should capture:

- version and seed
- result
- turns
- floors reached
- damage taken
- items used
- enemies defeated
- invalid actions
- softlocks or aborts
- basic reviewer score placeholders if no LLM review exists yet

Canonical regression seeds:

- `seed_001`: normal balanced seed
- `seed_002`: enemy-heavy seed
- `seed_003`: item-sparse seed
- `seed_004`: stairs-far seed
- `seed_005`: trap/item-heavy seed, even if traps are not implemented yet

## Deliverables

- Harness runner script.
- Trace writer.
- Scorecard writer.
- Regression seed simulation command.
- Tests for trace and scorecard shape.

## Tests And Validation

- `pnpm test`
- Run a single seeded simulation.
- Run all regression seeds.
- Confirm output files are created in the expected `runs/` structure.

Required tests:

- A simulation reaches `WIN`, `LOSS`, or `ABORTED`.
- Random-policy simulations across regression seeds do not crash the game.
- Trace steps are ordered by turn.
- Every chosen action appears in that turn's available actions unless the test intentionally covers invalid input.
- Scorecard metrics are consistent with the trace.

## Acceptance Criteria

- Harness can run without LLM/API credentials.
- Saved traces and scorecards are readable JSON.
- A broken game contract causes validation failure instead of silent acceptance.
- The game interface remains unchanged.

## AI Coder Handoff Notes

This phase creates the evidence layer. Keep the runner deterministic and boring; later phases depend on its output to judge whether the game improved.
