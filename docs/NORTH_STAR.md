# North Star

Canonical product intent lives in `concept-and-ideas/01_NORTH_STAR_AND_VISION.md`. This file summarizes the current implemented system without replacing that concept document.

## One-sentence concept

Build a small playable game through an adversarial loop where a **Game Developer Agent** improves the game while a **Game Player / Reviewer Agent** plays it, critiques trace evidence, and pressures better versions.

## North Star question

> Can an adversarial developer/reviewer agent loop improve a small playable game over multiple versions, while preserving a stable game protocol and producing measurable evidence of improvement?

## Current system summary

Dungeon Forge now contains an implemented local TypeScript system around a finite, text/ASCII-first, turn-based dungeon game. The game exposes a stable structured-action `GameEngine` interface, deterministic seeded runs, serializable state, explicit terminal states, and traceable mechanics for movement, combat, enemies, items, traps/resources, dialogue/events, challenge modes, scenario packs, and extension packs.

The harness can run deterministic baseline players, save traces and scorecards, generate reviews and developer handoffs, compare versions, run balance analytics, validate acceptance evidence, replay traces, build a read-only version dashboard (`pnpm run version-dashboard`), export static demo bundles (`pnpm run export-static-demo`), and coordinate phase automation. Existing `runs/v001` through `runs/v003` evidence demonstrates the fixed local demo loop and comparisons.

Optional LLM player/reviewer paths exist behind explicit credentials and validated model output. Gameplay and default validation do not require API credentials, and reviewer output cannot directly mutate game state.

## Preserved product boundaries

- Gameplay remains finite, turn-based, text/ASCII-first, seedable, serializable, and structured-action based.
- Trace evidence remains the primary proof of what happened during play.
- Scorecards, reviews, comparisons, dashboards, and static demos must point back to generated evidence.
- Human acceptance remains in charge; automation and scorecards are decision aids.
- Browser play/replay, stronger longitudinal proof, deeper validation, and richer evaluation are roadmap items, not completed outcomes.

## Current roadmap focus

The main gaps identified by `docs/NORTH_STAR_GAP_AUDIT.md` are current-state documentation drift, longitudinal improvement proof beyond the fixed v001-v003 demo, evidence validation hardening, browser play/replay inspection, and deeper gameplay evaluation. PHASE-23B addresses only the documentation drift.
