# Trace Replay

Phase 17C adds a read-only trace replay command for inspecting saved playthrough evidence and optionally verifying that recorded actions still reach the same terminal result.

## Command

```bash
pnpm run trace-replay -- --trace runs/<version>/traces/<file>.json [options]
```

### Modes

| Mode | Behavior |
| --- | --- |
| `inspect` (default) | Walk the saved trace step by step. Does not run the game engine. |
| `verify` | Re-execute `chosen_action` values from the trace and compare terminal `result`. |
| `both` | Print inspect output, then verify summary. |

### Useful flags

- `--scorecard <path>` - attach scorecard summary context (invalid actions, softlocks, reviewer scores).
- `--from-step <n>` / `--to-step <n>` - 1-based step window for inspect output.
- `--no-render` - omit ASCII map blocks (actions, events, and state deltas remain).
- `--write-report <base-path>` - write derived `replay_report.json` and `replay_report.md` only.

## Inspect output

Each step includes:

- chosen action (`id`, `type`, `label`) and optional `reason` / LLM decision metadata
- state summary delta vs the previous step
- trace events (combat, items, harness abort markers, etc.)
- saved ASCII `render` (unless `--no-render`)

The header summarizes version, seed, persona, terminal result, playtest metadata, `problem_run` diagnostics when present, and scorecard context when supplied.

## Verify mode

Verify mode starts the engine with the trace's `version`, `seed`, `challenge_mode`, and `scenario_pack`, then applies each recorded `chosen_action`. It reports:

- expected vs actual terminal `result`
- steps replayed
- mismatches (unavailable action, early terminal, result mismatch)

Turn-count differences are recorded but do not fail verification by themselves.

## Evidence rules

- Trace JSON is **read-only**. Replay never edits the source trace.
- `--write-report` creates **new** derived artifacts only.
- Use inspect mode when you need to debug reviewer confusion, softlocks, or invalid actions without rerunning gameplay.

## During review

1. Open the trace with `inspect` and skim `problem_run` / scorecard softlock counts.
2. Jump to suspicious steps with `--from-step` / `--to-step`.
3. Run `verify` on the same file before claiming a regression or engine drift.
4. Optionally save a replay report next to the run folder for handoff notes.

## API

Library helpers live in `src/harness/trace-replay.ts` and are exported from `src/harness/index.ts` for tests and tooling.
