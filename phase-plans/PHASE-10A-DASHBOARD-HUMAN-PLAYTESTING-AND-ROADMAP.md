# PHASE-10A - Dashboard, Human Playtesting, And Roadmap

## Purpose

Plan post-MVP expansion after the core adversarial loop has been proven: dashboards, human playtesting comparison, richer scenarios, and carefully bounded future media experiments.

## Source Context

Use the long-term vision from `concept-and-ideas/01_NORTH_STAR_AND_VISION.md`, future layers from `concept-and-ideas/02_STRUCTURE_AND_TECH_SPECS.md`, and scenario examples from `concept-and-ideas/03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`.

## Target Outcome

The project can evolve into a small agentic game-studio testbed without losing the core lesson of the MVP: finite, measurable, replayable game improvement through evidence-backed adversarial iteration.

## In Scope

- Version comparison dashboard.
- Human playtest trace ingestion.
- Leaderboard or comparison table of game versions.
- Richer scenario systems for games like The Clockwork Inn and Ashen Caravan.
- Optional exploration of visual/audio layers after headless evaluation remains stable.

## Out Of Scope

- Requiring dashboard for core harness operation.
- Replacing structured actions with open-ended free text.
- Making multimedia assets required for reviewer play.
- Infinite open-world or no-ending modes as the main evaluation target.

## Technical Spec

Dashboard should visualize artifacts already produced by earlier phases:

- traces
- reviews
- scorecards
- changelogs
- acceptance decisions
- version comparisons

Human playtesting should use the same game action protocol and produce comparable traces. Human and reviewer-agent results can then be compared for disagreement, confusion, difficulty, and play style.

Richer scenario systems may include:

- Seven Floors to Dawn challenge seeds, alternate item tables, and optional finite 10-floor mode.
- The Clockwork Inn mystery structure with finite NPC dialogue, clue flags, accusations, and seeded culprit variants.
- Ashen Caravan survival structure with finite party traits, weather/events, route pressure, and turn-based combat options.
- finite NPC dialogue trees
- seeded clue variants
- finite scripted events
- party traits and bounded reactions
- finite challenge modes

Visual/audio experiments must remain optional and cannot be required for headless reviewer/harness evaluation.

## Deliverables

- Roadmap document or dashboard prototype.
- Human playtest artifact format.
- Scenario expansion guidelines.
- Future-experiment constraints for media and richer content.

## Tests And Validation

- Dashboard reads existing artifact formats without changing them.
- Human play traces validate against the same trace schema.
- Scenario extensions preserve finite terminal states.
- Headless harness still runs without browser or media dependencies.

## Acceptance Criteria

- Roadmap additions build on the MVP instead of replacing it.
- Human playtesting and dashboard features improve observability.
- Future experiments remain bounded, optional, and reversible.

## AI Coder Handoff Notes

Do not start this phase until the three-version demo works. This phase exists to keep later ambition organized, not to expand scope before the core proof is real.
