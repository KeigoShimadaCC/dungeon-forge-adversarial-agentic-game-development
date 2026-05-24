# North Star

Canonical product intent lives in `concept-and-ideas/01_NORTH_STAR_AND_VISION.md`. This file summarizes the current implemented system without replacing that concept document.

## One-sentence concept

Build a small playable game through an adversarial loop where a **Game Developer Agent** improves the game while a **Game Player / Reviewer Agent** plays it, critiques trace evidence, and pressures better versions.

## North Star question

> Can an adversarial developer/reviewer agent loop improve a small playable game over multiple versions, while preserving a stable game protocol and producing measurable evidence of improvement?

## Current system summary

Dungeon Forge now contains an implemented local TypeScript system around a finite, text/ASCII-first, turn-based dungeon game. The game exposes a stable structured-action `GameEngine` interface, deterministic seeded runs, serializable state, explicit terminal states, and traceable mechanics for movement, combat, enemies, items, traps/resources, dialogue/events, challenge modes, scenario packs, and extension packs.

The harness can run deterministic baseline players, save traces and scorecards, generate reviews and developer handoffs, compare versions, run longitudinal benchmarks, run balance analytics, validate acceptance evidence, replay traces, build a read-only version dashboard (`pnpm run version-dashboard`), export static demo bundles (`pnpm run export-static-demo`), and coordinate phase automation. Existing `runs/v001` through `runs/v003` evidence demonstrates the fixed local demo loop and comparisons.

Optional LLM player/reviewer paths exist behind explicit credentials and validated model output. Gameplay and default validation do not require API credentials, and reviewer output cannot directly mutate game state.

Local inspection surfaces now include terminal human play, browser play/replay, static dashboard/demo exports, and a control-room shell over timeline, role, handoff, narration, and base-selection artifacts. The restricted API coding-agent path exists as a harnessed delegate: the API model only proposes structured JSON intent, while the local harness owns reads, validation, patch application, whitelisted checks, evidence, and gates.

## Preserved product boundaries

- Gameplay remains finite, turn-based, text/ASCII-first, seedable, serializable, and structured-action based.
- Trace evidence remains the primary proof of what happened during play.
- Scorecards, reviews, comparisons, dashboards, and static demos must point back to generated evidence.
- Human acceptance remains in charge; automation and scorecards are decision aids.
- Browser play/replay, longitudinal benchmarking, deeper validation, richer evaluation, control-room views, and restricted-agent delegation remain bounded local capabilities. They are not game-rule authority and do not bypass human acceptance.

## Current roadmap status

The gaps identified by `docs/NORTH_STAR_GAP_AUDIT.md` were planned and implemented through PHASE-24B. Later automation completed the control-room sequence through PHASE-28B and the restricted API coding-agent sequence through PHASE-31B.

Future work should start from the current `automation/phase-state.json`, `PROGRESS.MD`, and the latest phase plans rather than the historical PHASE-23A audit snapshot.
