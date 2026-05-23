# Human Playtest Traces

Phase 17B extends the Phase 17A human-play interface so local human sessions produce the same evidence model as harness agent playthroughs: trace, scorecard, optional post-run notes, and summary-visible metadata for comparison.

## Metadata fields

Human traces and scorecards include:

| Field | Value | Purpose |
| --- | --- | --- |
| `persona` | `human_player` | Stable artifact basename and persona id |
| `player_kind` | `human` | Distinguishes human runs from `agent` harness runs |
| `human_play_mode` | `terminal`, `auto`, or `script` | How the session was captured |
| `session_label` | optional string | Local label for comparing sessions (no private user data required) |

Agent harness runs set `player_kind: agent` and `agent_policy_class` (`baseline` or `llm_persona`).

## Commands

Save trace, scorecard, and optional notes:

```bash
pnpm run human-play -- --seed seed_001 --auto --save-trace
pnpm run human-play -- --seed seed_001 --auto --save-trace --label "tuesday-smoke"
pnpm run human-play -- --seed seed_001 --auto --save-trace --notes "Stairs felt far; combat readable."
```

Read notes from a local file:

```bash
pnpm run human-play -- --seed seed_001 --script 0,1,0 --save-trace --notes-file ./feedback.txt
```

Artifacts:

- Trace: `runs/<version>/traces/<seed>_human_player.json`
- Scorecard: `runs/<version>/scorecards/<seed>_human_player.json`
- Notes (optional): `runs/<version>/human_notes/<seed>_human_player.json`

## Comparing with agent playthroughs

`pnpm run summarize-version` lists every scorecard under a version, including human runs. Each `runs[]` entry exposes `player_kind`, `human_play_mode`, and `session_label` when present so you can compare objective metrics (turns, floors, invalid actions) alongside agent persona runs on the same seed.

Structured actions in human traces remain replayable: re-run with `--script` indices derived from saved `available_actions` and `chosen_action` pairs.

## Privacy

No accounts, telemetry, or private user data are required. Notes and labels are optional, length-bounded, and stored only when you pass `--save-trace` with `--notes` / `--notes-file` / `--label`.

## Tests

```bash
pnpm test tests/human-playtest-traces.test.ts
pnpm test tests/human-play.test.ts
```
