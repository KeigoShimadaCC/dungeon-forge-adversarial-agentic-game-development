# Patch Plan

Target version: v002

## Review issues being addressed

1. **[major]** The player lost on floor 1 after 60 turns with 2 damage taken.
   - Diagnosis: Early losses can be fair tension, but repeated low-floor deaths suggest onboarding or pressure tuning problems.
   - Recommendation: Tune early enemy pressure, healing cadence, or tutorial log hints without removing LOSS or changing structured actions.
2. **[minor]** Notable event "move" occurred during play.
   - Diagnosis: Combat and item events are present, but their impact on player choices should be visible in render and action labels.
   - Recommendation: Surface item and enemy outcomes in the ASCII render or recent log so reviewers can connect events to decisions.

## Proposed scoped changes (1-3)

- Show held-item effect summaries and active tactical status in ASCII render and recent log output.
- Expose Smoke Bomb in the target version profile with floor-1 spawn via allowedItemIds.
- Emit a deterministic tutorial log when Smoke Bomb is first picked up.

## Expected files/modules

- _(List concrete paths/modules before coding.)_

## Tests and checks to add or rerun

- pnpm test
- pnpm run typecheck
- pnpm run lint
- pnpm run build
- git diff --check

## Non-goals

- Do not expand beyond the target scope for this version.
- Do not implement reviewer suggestions that violate forbidden changes.

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

## Status

Status: implemented
