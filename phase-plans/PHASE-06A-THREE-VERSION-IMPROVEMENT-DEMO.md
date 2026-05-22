# PHASE-06A - Three Version Improvement Demo

## Purpose

Demonstrate the core claim: a bounded adversarial agent loop can improve a small playable game over multiple versions while preserving a stable protocol and measurable evidence.

## Source Context

Use the v0.1-v0.3 examples and minimal demo script from `concept-and-ideas/03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`, plus the MVP success criteria from `concept-and-ideas/01_NORTH_STAR_AND_VISION.md`.

## Target Outcome

The repo contains an evidence trail for `v001`, `v002`, and `v003`: playable versions or version tags, traces, reviews, scorecards, changelogs, and acceptance decisions showing meaningful improvement.

## In Scope

- Run v001 as the shallow but complete baseline.
- Use reviewer critique to select scoped v002 improvements.
- Use reviewer critique to select scoped v003 improvements.
- Compare metrics and qualitative reviews across versions.
- Store artifacts in a consistent run/version folder.

## Out Of Scope

- Perfect balance.
- Commercial polish.
- Large narrative systems.
- Automated patch pipeline.
- Browser UI.

## Technical Spec

Expected version arc:

- `v001`: five-floor dungeon, one enemy, one item, stairs, HP, win/loss, ASCII render.
- `v002`: add tactical depth and clarity, such as Smoke Bomb, Bat enemy, and symbol legend.
- `v003`: tune balance and add light narrative clarity, such as item tutorial logs, spawn tuning, objective text, and better ending text.

Each version should include:

- traces for canonical seeds
- reviewer review
- scorecard
- developer patch plan
- changelog
- change summary
- developer notes
- acceptance decision

Comparison should explain both improvements and regressions. For example, v002 may improve tactical depth while harming fairness, and v003 should attempt to recover clarity/fairness without losing tactical depth.

## Deliverables

- Version tags or clearly named version folders.
- Three complete run artifact sets.
- Comparison document or generated summary.
- Demo command sequence documented in the repo.

## Tests And Validation

- `pnpm test`
- Regression seed simulations for each version.
- Reviewer playthrough for at least one seed per version.
- Comparison output generation.

Required validation:

- No version breaks the game contract.
- Each version reaches defined terminal states.
- At least one metric or trace pattern changes meaningfully across versions.
- Reviewer critique for later versions acknowledges changed experience.

## Acceptance Criteria

- The demo can tell a clear before/after story.
- The game improves in at least one evidence-backed dimension.
- All three versions remain finite, seedable, text/ASCII, and turn-based.
- Artifacts are sufficient for a human to audit the loop.

## AI Coder Handoff Notes

Do not hide regressions. If a version improves one dimension but worsens another, record it. The project values measurable iteration more than pretending every change is a clean win.
