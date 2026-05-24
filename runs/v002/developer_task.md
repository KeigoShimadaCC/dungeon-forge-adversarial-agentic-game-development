# Developer Task

## Governance

- Human-governed handoff only; this artifact does not apply patches automatically.
- `autonomous_patch_execution` is forbidden for this workflow.
- Implement at most three scoped changes, then record outcomes in the required patch plan and changelog paths.

## Evidence inputs

- Previous review: `runs/v001/reviews/seed_001_careful_player.json`
- Previous scorecard: `runs/v001/scorecards/seed_001_careful_player.json`
- Review version / seed / persona: `v001` / `seed_001` / `careful_player`
- Scorecard result / turns: `LOSS` / 60
- Top issues in review: 2

## Review summary

As a careful player, the v001 play on seed seed_001 lost before the end in 60 turns (floors reached 1, invalid actions 0). The player lost on floor 1 after 60 turns with 2 damage taken.

## Reviewer scores

- fun: 4
- clarity: 6
- fairness: 5
- tactical_depth: 6
- replay_value: 5

## Evidence-backed review issues

1. [major] The player lost on floor 1 after 60 turns with 2 damage taken.
  - Diagnosis: Early losses can be fair tension, but repeated low-floor deaths suggest onboarding or pressure tuning problems.
  - Recommendation: Tune early enemy pressure, healing cadence, or tutorial log hints without removing LOSS or changing structured actions.
  - result: Playthrough ended with terminal result LOSS after 60 recorded turns. Quote: "LOSS"
  - scorecard: Floors reached 1; damage_taken 2. Quote: "{"invalid_actions":0,"softlocks":0,"floors_reached":1,"result":"LOSS"}"
2. [minor] Notable event "move" occurred during play.
  - Diagnosis: Combat and item events are present, but their impact on player choices should be visible in render and action labels.
  - Recommendation: Surface item and enemy outcomes in the ASCII render or recent log so reviewers can connect events to decisions.
  - event (turn 6): Turn 6 event move: You move to 3,7. Quote: "You move to 3,7."
  - turn (turn 6): Turn 6 inventory: (empty).

## Target

- Target version: `v002`
- Target scope: Reviewer-driven tactical/clarity improvement for v002 responding to v001 trace and review evidence.

## Proposed scoped changes (implement at most 3)

- Show held-item effect summaries and active tactical status in ASCII render and recent log output.
- Expose Smoke Bomb in the target version profile with floor-1 spawn via allowedItemIds.
- Emit a deterministic tutorial log when Smoke Bomb is first picked up.

## Allowed changes

- Adjust demo version profiles and bounded content allow-lists.
- Improve ASCII render/log clarity for items and tactical effects.
- Add deterministic pickup guidance for Smoke Bomb inside existing engine step flow.

## Forbidden changes

- Change or bypass the stable GameEngine interface (start, getAvailableActions, step, render, isTerminal).
- Remove seed determinism or non-reproducible RNG during gameplay.
- Remove or bypass explicit terminal states (ACTIVE, WIN, LOSS, ABORTED).
- Add infinite floors, sandbox main modes without terminal outcomes, or unbounded play.
- Add real-time input, timing-based combat, or non-turn-based play.
- Require images, audio, or other non-text media for core gameplay.
- Replace structured available actions with arbitrary free-text player commands.
- Call external APIs during gameplay or mutate game state directly from reviewer output.
- Let reviewer or developer self-report replace harness validation and trace evidence.
- Do not modify committed v001 trace/review/scorecard JSON artifacts in place.

## Required artifacts

- Patch plan: `runs/v002/patch_plan.md`
- Changelog: `runs/v002/changelog.md`

## Required test commands

- pnpm test
- pnpm run typecheck
- pnpm run lint
- pnpm run build
- git diff --check

## Expected implementation summary

Implement the 3 scoped v002 changes grounded in v001 review seed_001/careful_player, then regenerate playthrough and comparison evidence.

## Reviewer suggested next changes (reference only)

- Tune early enemy pressure, healing cadence, or tutorial log hints without removing LOSS or changing structured actions.
- Surface item and enemy outcomes in the ASCII render or recent log so reviewers can connect events to decisions.
