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
| `tactical_depth` | Trace-backed tactical signals: enemy pressure, navigation friction, combat engagements, tactical item opportunity/use rate, trap/resource pressure, content interactions, and scenario-depth signals. |
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

## PHASE-24B Tactical Depth Metrics

`tactical_depth` is derived only from trace steps, chosen actions, terminal status, and recorded events. It is not inferred from design docs or intended content.

| Metric | Evidence source | Interpretation |
| --- | --- | --- |
| `enemy_pressure_events` / `enemy_pressure_per_turn` | Enemy action events per trace step. | How much enemy behavior the player actually faced. |
| `navigation_friction_turns` | Repeated positions after movement/wait/inspect actions. | Possible wandering, waiting, or blocked navigation pressure. |
| `tactical_item_opportunities`, `tactical_item_uses`, `tactical_item_use_rate` | Available `use_item` actions and tactical `use_item` events. | Whether tactical options appeared and were actually used. |
| `trap_resource_pressure_events`, `trap_resource_damage` | Trap/resource events and damage payloads. | How much traps and hunger/torch pressure affected the run. |
| `content_interaction_events` | Attack, pickup, use-item, talk, descend, trap, and resource interactions. | Breadth of meaningful systems touched during the run. |
| `scenario_depth_signals` | Observed floors, distinct enemy/item event types, and explicit challenge/scenario/extension labels. | Bounded signal for scenario variety in that trace. |

These metrics are advisory. A high value can mean depth, chaos, or friction; inspect the linked trace before treating it as an improvement.

## PHASE-24B Problem Categories

Problem diagnostics now distinguish:

- `protocol_failure` for invalid state or no-action failures.
- `policy_issue` for invalid/cloned player or reviewer action output.
- `expected_hard_loss` for clean losses without protocol, policy, or softlock evidence.
- `balance_outlier` for early high-damage losses or max-step exhaustion.
- `missing_evidence` for empty or internally inconsistent trace evidence.

Existing categories such as `aborted`, `softlock`, `invalid_actions`, `impossible_placement`, `trap_pressure`, `resource_pressure`, and `repeated_failure` remain valid for old readers.

## Migration

- **Readers**: Ignore unknown scorecard/trace fields. Do not require `metadata` or diagnostic blocks.
- **Writers**: New harness runs populate diagnostics automatically via `runPlaythrough` and `runBalanceBatch`.
- **Regeneration**: Re-run `simulate-seed`, `run-version`, or `run-balance` to refresh artifacts; old JSON without new fields is still valid.

## Item-aware baseline evidence

`greedy-item-picker` now evaluates heal, Fire Seed, and Smoke Bomb use when safe. Balance and regression batches exercise tactical item opportunities without changing the `GameEngine` contract.
