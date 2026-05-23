# Trace And Scorecard Diagnostics

Phase 13C adds structured diagnostics to playthrough traces and scorecards. Existing consumers that only read the original required fields remain compatible; new fields are additive.

## Trace (`PlaythroughTrace`)

Optional top-level `metadata`:

| Field | Purpose |
| --- | --- |
| `metadata.map_generation.floors[]` | Per-floor `used_fallback`, `generation_attempt`, `width`, `height` (reproducible from seed + version config). |
| `metadata.placement.shortfalls[]` | When requested spawn counts exceed reachable placements for a floor/slot. |
| `metadata.problem_run` | Structured categories explaining aborts, softlocks, invalid actions, and placement issues. |

## Scorecard (`PlaythroughScorecard`)

Additive fields (all JSON-serializable):

| Field | Purpose |
| --- | --- |
| `enemy_behaviors` | Counts of `enemy_attack`, `enemy_move`, `enemy_wait`, `enemy_steal`, `enemy_phase`, `enemy_defeated` trace events. |
| `item_evaluation` | Item-use opportunities, pickups, tactical item uses, and total `use_item` events. |
| `diagnostics` | `categories[]`, `primary_category`, optional `abort_cause` (e.g. `max_turns`, `policy_invalid_action`). |

Required Phase 06C objective fields are unchanged.

## Balance summary (`balance_summary.json`)

Additive fields:

| Field | Purpose |
| --- | --- |
| `problem_category_counts` | Aggregated `category:code` counts across the batch. |
| `repeated_problem_seeds` | Seeds that failed on two or more baseline policies. |
| `runs[].problem_categories` | Structured problem tags per run (human `problem_reasons` strings remain). |
| `failed_runs[].problem_categories` | Same structure for failed runs only. |

`problem_reasons` may include codes such as `aborted:max_turns` when abort cause is known.

## Migration

- **Readers**: Ignore unknown scorecard/trace fields. Do not require `metadata` or diagnostic blocks.
- **Writers**: New harness runs populate diagnostics automatically via `runPlaythrough` and `runBalanceBatch`.
- **Regeneration**: Re-run `simulate-seed`, `run-version`, or `run-balance` to refresh artifacts; old JSON without new fields is still valid.

## Item-aware baseline evidence

`greedy-item-picker` now evaluates heal, Fire Seed, and Smoke Bomb use when safe. Balance and regression batches exercise tactical item opportunities without changing the `GameEngine` contract.
