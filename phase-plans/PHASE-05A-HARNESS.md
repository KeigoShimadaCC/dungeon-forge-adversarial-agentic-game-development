# PHASE-05A - Harness

## Purpose

Build the headless playthrough harness that runs games, records traces, and produces initial scorecards.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-05-HARNESS-BUILDING`, harness architecture in `02_STRUCTURE_AND_TECH_SPECS.md`, and trace examples in `03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`.

## Target Outcome

A local command or script can run a seeded playthrough with a selected player policy and save generated evidence under `runs/**`.

## In Scope

- Run-playthrough flow.
- Simulate-seed command/script.
- Trace saving.
- Basic scorecard generation from trace facts.
- Invalid action counting.
- Version/run output folders.

## Out Of Scope

- LLM player calls.
- Reviewer critique generation.
- Developer-agent orchestration.
- Dashboard or database storage.

## Technical Spec

Dependencies: `PHASE-03A-MINIMAL-DUNGEON`, `PHASE-04A-ASCII-RENDERER`, and `PHASE-04B-BASELINE-PLAYERS`.

The harness should:

1. Start the game with a seed.
2. Select actions through a player policy.
3. Step the game.
4. Save each turn's state summary, render, action, validity, events, and terminal status.
5. Stop at `WIN`, `LOSS`, or `ABORTED`.
6. Generate a scorecard from trace metrics.

Canonical trace JSON must include:

- `version`.
- `seed`.
- `persona` or baseline policy ID.
- `result`.
- `turns`.
- `steps[]`.

Each `steps[]` entry must include:

- `turn`.
- `render`.
- `available_actions`.
- `chosen_action`.
- `reason` when supplied by the policy/player.
- `valid`.
- `events`.
- `terminalStatus`.

Save outputs under a versioned local path such as `runs/v001/traces/` and `runs/v001/scorecards/`.

The first harness regression matrix should include `seed_001` through `seed_005` from `PHASE-00A`.

## Deliverables

- Harness runner module.
- CLI/script entry point such as `run-playthrough` or `simulate-seed`.
- Trace writer.
- Basic scorecard writer.
- Harness tests.

## Tests And Validation

- Trace file is saved.
- Scorecard file is saved.
- Fixed seed and fixed policy produce reproducible trace output.
- Trace files contain all canonical fields.
- Terminal status is recorded.
- Invalid action count is recorded.
- Harness stops at terminal status or configured max turns.
- Canonical regression seeds can be simulated with at least one baseline policy.

## Acceptance Criteria

- A reviewer or developer can inspect generated evidence without rerunning the game.
- Harness uses the public `GameEngine` protocol only.
- Generated files are treated as derived evidence under `runs/**`.

## AI Coder Handoff Notes

Use local files and deterministic behavior. Do not introduce an external service, database, or UI to solve this phase.
