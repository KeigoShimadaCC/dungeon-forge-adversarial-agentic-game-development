# Browser Play And Replay UI

PHASE-24A adds a local browser surface over the existing structured-action game and trace replay systems. The browser is a play and inspection surface only; game rules still run through the Node server using the engine and session adapters.

## Launch

```bash
pnpm run browser-play
```

By default the server listens on `http://127.0.0.1:8787`. Use `--host` or `--port` for local overrides:

```bash
pnpm run browser-play -- --port 8790
```

## Play

The UI starts a seeded game and displays:

- ASCII render output.
- terminal status, turn, floor, HP, inventory, and recorded trace-step count.
- structured action buttons from the engine.
- local game events from the latest step.

Action buttons call the server with action ids and types. The browser does not parse free-form commands and does not apply game rules locally.

Use `Export trace` after at least one action to write harness-compatible local play artifacts:

- `runs/<version>/traces/<seed>_human_player.json`
- `runs/<version>/scorecards/<seed>_human_player.json`

Browser-play traces set `player_kind: human` and `human_play_mode: browser`.

## Replay

Replay mode loads an existing trace path such as:

```text
runs/v001/traces/seed_001_greedy-item-picker.json
```

The replay pane is read-only with respect to the loaded trace file. It validates the trace, reports missing or malformed fields as blocker diagnostics, and lets the UI step through recorded actions, events, render output, state summaries, and terminal status.

Replay inspection is trace evidence, not acceptance or reviewer proof. The UI labels game state and local play evidence separately from reviewer scores and acceptance decisions.

## Smoke Commands

```bash
pnpm run browser-play -- --smoke --seed seed_001 --max-steps 3 --export-trace
pnpm run browser-play -- --smoke-replay runs/v001/traces/seed_001_greedy-item-picker.json
```

Compatibility checks remain available:

```bash
pnpm run human-play -- --mode auto --seed seed_001 --max-steps 3
pnpm run trace-replay -- --trace runs/v001/traces/seed_001_greedy-item-picker.json --mode inspect --no-render
```
