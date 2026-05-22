# PHASE-00A - Plan Standards And Global Invariants

## Purpose

Define the shared implementation-brief format and non-negotiable rules for every later phase.

## Source Context

Based on `concept-and-ideas/01_NORTH_STAR_AND_VISION.md`, `02_STRUCTURE_AND_TECH_SPECS.md`, `03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`, and `04_HIGH_LEVEL_PROJECT_PHASES.md`.

## Target Outcome

Future AI coders can implement phases independently while preserving the same bounded adversarial loop: a developer agent improves a small playable game after a reviewer/player agent actually plays it and critiques trace evidence.

## In Scope

- Standardize the phase-plan section format.
- Record the planned MVP stack and repository boundaries.
- Record global game protocol and artifact invariants.
- Name forbidden MVP scope that later phases must not require.

## Out Of Scope

- Writing application source code.
- Choosing exact dependency versions.
- Installing packages before a scaffold exists.
- Adding browser UI, databases, dashboards, external-service gameplay, or production deployment.

## Technical Spec

Dependencies: None.

Every phase doc must use these sections:

1. Purpose
2. Source Context
3. Target Outcome
4. In Scope
5. Out Of Scope
6. Technical Spec
7. Deliverables
8. Tests And Validation
9. Acceptance Criteria
10. AI Coder Handoff Notes

Planned stack:

- TypeScript
- Node.js
- pnpm
- Vitest
- Local-file storage for traces, reviews, scorecards, changelogs, patch plans, and acceptance decisions

Planned repository boundaries:

- `src/game/**`: game engine, types, RNG, map, enemies, items, combat, render.
- `src/harness/**`: playthrough runner, trace saving, scorecards, reviewer client, validation.
- `src/agents/prompts/**`: reviewer and developer prompt templates.
- `content/**`: items, enemies, floor rules, events, and other static data.
- `tests/**`: contract, engine, harness, content, and regression-seed tests.
- `runs/**`: generated version evidence.

Canonical regression seeds:

- `seed_001`: normal balanced seed.
- `seed_002`: enemy-heavy seed.
- `seed_003`: item-sparse seed.
- `seed_004`: stairs-far seed.
- `seed_005`: trap/item-heavy seed.

Initial reviewer personas:

- `careful_player`: reads state carefully and tries to win.
- `naive_player`: plays plausibly but misses some tactical detail.
- `bug_hunter`: probes edge cases, invalid choices, and unclear states.

Global invariants:

- The game is finite.
- Terminal states are explicit: `ACTIVE`, `WIN`, `LOSS`, `ABORTED`.
- Output is text/ASCII first.
- Player input is structured through available actions.
- Play is turn-based.
- Randomness is seeded and reproducible.
- Game state is serializable and inspectable.
- Reviewer critique must be grounded in actual playthrough traces.
- Gameplay must run without API credentials.
- Reviewer output must never mutate game state directly.
- Every accepted version stores trace, review, scorecard, patch plan or developer task, changelog, developer notes, and acceptance decision artifacts.

Definition of improvement:

- Reviewer completion becomes more reliable, or failures become more explainable.
- Bugs, invalid actions, protocol failures, and softlocks decrease.
- Win/loss rate moves closer to the intended target.
- Tactical item/enemy/map systems appear in traces and are used meaningfully.
- Reviewer confusion decreases or moves from basic usability complaints to deeper design critique.
- Prior high-severity critique is explicitly addressed.
- The game remains finite, playable, seedable, structured-action based, and compatible with the harness.

Forbidden MVP features:

- Real-time combat or timing-sensitive input.
- Image-only output.
- Required audio, voice, or generated media assets.
- Infinite floors or no-ending sandbox play.
- Arbitrary free-text gameplay commands.
- Arbitrary LLM-generated world/story changes during play.
- External API dependency during gameplay.
- Engine rewrites that break the stable game/harness protocol.

## Deliverables

- This standards file.
- A complete granular phase-plan set from `PHASE-01A` through `PHASE-12A`.

## Tests And Validation

- Every phase has all 10 required sections.
- Every phase names dependencies, deliverables, tests/checks, and acceptance criteria.
- No phase requires forbidden MVP scope.
- `git diff -- phase-plans` shows documentation-only changes.

## Acceptance Criteria

- The standards are clear enough for another AI coder to follow without rereading all concept docs.
- Later phases can reference this file as the shared contract.
- The MVP loop remains small, finite, seedable, inspectable, and evidence-driven.

## AI Coder Handoff Notes

Before implementing any phase, re-read this file and that phase's source context. If a reviewer or developer request conflicts with these invariants, translate it into a bounded allowed implementation or reject it in acceptance notes.
