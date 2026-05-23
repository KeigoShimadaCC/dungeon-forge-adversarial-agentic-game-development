# Challenge Modes

Phase 16B adds **finite** challenge presets for bounded replayability. Challenge modes never introduce endless floors or open-ended play.

## Config format

Presets live in `content/challenge-modes.json` (`schemaVersion: "16B"`). Each preset includes:

- `id` — stable selector for CLI and artifacts
- `label` / `description` — human-readable summary
- `recommendedSeeds` — optional canonical seeds for smoke/regression
- `gameConfig` — partial `GameConfig` overlay (must include `totalFloors`)

The engine merges a preset overlay onto the version profile from `resolveGameConfigForVersion`.

## Presets

| Id | Floors | Summary |
| --- | --- | --- |
| `enemy_gauntlet` | 3 | Tighter enemy roster, potion/smoke bomb loot |
| `item_sparse` | 4 | Only healing potions spawn as floor loot |
| `full_depth` | 5 | Explicit five-floor descent with fixed ending |

Omit `--challenge-mode` (or use harness default) for unchanged standard gameplay.

## CLI

```bash
# Single playthrough with challenge preset
pnpm run simulate-seed -- --seed seed_002 --policy stairs-seeking --version v016 --challenge-mode enemy_gauntlet

# Version loop evidence with challenge label on trace/scorecard/summary
pnpm run run-version -- --version v016 --challenge-mode item_sparse --runs-root .
```

Challenge mode is recorded on:

- `PlaythroughTrace.challenge_mode`
- `PlaythroughScorecard.challenge_mode`
- `version_summary.json` (`challenge_mode` and per-run copies)
- `runs/comparisons/*.json` (`challenge_mode.base` / `challenge_mode.target`)
- `acceptance.md` evidence links section

## Invariants

- Every preset sets an explicit `totalFloors` cap.
- Same seed + version + challenge mode reproduces the same initial setup.
- Default runs omit `challenge_mode` fields so standard evidence stays distinguishable.
