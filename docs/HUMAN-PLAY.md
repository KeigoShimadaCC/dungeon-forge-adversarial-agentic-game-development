# Human Play UI

Phase 17A adds a minimal local interface for human playtesting over the same `GameEngine` contract used by the harness. The UI is not a source of truth: it only displays engine output and submits structured actions returned by `getAvailableActions`.

## Commands

Interactive terminal play:

```bash
pnpm run human-play -- --seed seed_001
```

Non-interactive smoke/auto play (deterministic action fallback):

```bash
pnpm run human-play -- --seed seed_001 --auto
```

Save a harness-compatible trace and scorecard:

```bash
pnpm run human-play -- --seed seed_001 --auto --save-trace
```

Optional version, challenge, and scenario selectors mirror harness run options:

```bash
pnpm run human-play -- --seed seed_003 --version v002 --challenge-mode scarce_supplies --auto
pnpm run human-play -- --seed shrine_trial_01 --scenario-pack shrine_trial --auto
```

Scripted indices (for local repro/debug):

```bash
pnpm run human-play -- --seed seed_001 --script 0,2,1
```

## What you see

Each turn prints:

- ASCII map from `render(state)`
- Turn, floor, terminal status
- HP and inventory
- Recent log lines
- Numbered structured actions from `getAvailableActions`

Choose by action number or action id. Enter `q` to abort (records `ABORTED`).

## Trace artifacts

With `--save-trace`, artifacts are written under `runs/<version>/traces/<seed>_human_player.json` and matching scorecards, using the same trace/scorecard shapes as harness playthroughs (`persona: human_player`).

## Invariants preserved

- Turn-based, finite, text/ASCII gameplay
- Structured actions only (no free-text commands)
- `step(state, action)` validates every choice
- Headless harness commands remain unchanged

## Tests

```bash
pnpm test tests/human-play.test.ts
```
