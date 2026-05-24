# Longitudinal Benchmark

PHASE-23C adds a credential-free benchmark that inspects local version evidence across multiple versions and writes an advisory trend report. It does not call LLM providers and it does not accept or reject versions automatically.

## When To Use It

Use the longitudinal benchmark when you already have comparable evidence under `runs/v###` and want honest trend labels across versions (improved, regressed, unchanged, or missing). Use the demo loop when you need to create or refresh the fixed v001–v003 demo story and its supporting artifacts.

## Prerequisites

The benchmark reads files only. It does not run playthroughs or balance batches. For the canonical smoke workflow you need version folders with at least:

- `runs/<version>/version_summary.json`
- `runs/<version>/balance_summary.json` (optional but expected for balance metrics)
- `runs/<version>/acceptance.md`
- trace and scorecard files referenced by those summaries

The committed repo usually satisfies this after `pnpm run demo-loop -- --runs-root .`. You can also produce summaries with `summarize-version`, `run-balance`, and `accept-version` without rerunning the full demo loop.

## Command

Package script:

```bash
pnpm run longitudinal-benchmark -- [options]
```

Help:

```bash
pnpm run longitudinal-benchmark -- --help
```

### Canonical v001–v003 workflow (write artifact)

Persist the phase gate artifact:

```bash
pnpm run longitudinal-benchmark -- --versions v001,v002,v003 --runs-root . --out runs/benchmarks/PHASE-23C/longitudinal_summary.json
```

### Read-only inspection (stdout only)

Print JSON without writing files:

```bash
pnpm run longitudinal-benchmark -- --versions v001,v002,v003 --runs-root .
```

### Options

| Flag | Purpose |
| --- | --- |
| `--runs-root <path>` | Repo or fixture root containing `runs/` (default: current directory) |
| `--versions <list>` | Comma-separated versions, e.g. `v001,v002,v003` |
| `--out <path>` | Write report JSON; creates parent directories as needed |
| `--help`, `-h` | Show CLI usage |

If `--versions` is omitted, the command discovers `runs/v###` directories in sorted order. If `--out` is omitted, no files are written and the report goes to stdout.

Default artifact path for PHASE-23C gates:

`runs/benchmarks/PHASE-23C/longitudinal_summary.json`

## No API Credentials Required

The benchmark never calls reviewer LLMs, developer agents, or external providers. It only reads local JSON, markdown, traces, and scorecards. Gameplay and evidence generation may still use other commands that optionally call APIs; this command does not.

## Inputs

For each selected version, the benchmark loads and checks:

| Artifact | Path | Role |
| --- | --- | --- |
| Version summary | `runs/<version>/version_summary.json` | Persona run outcomes and reviewer score paths |
| Balance summary | `runs/<version>/balance_summary.json` | Batch balance aggregates and run paths |
| Acceptance report | `runs/<version>/acceptance.md` | Human and machine acceptance status |
| Traces | paths from summaries | Required for trace-backed metrics |
| Scorecards | paths from summaries | Required for scorecard averages |

Metrics are computed only when trace and scorecard evidence exists for the referenced runs. Missing files are listed in `missing_evidence` and in each version's `evidence_state.missing_reasons`. The command exits successfully even when evidence is partial; inspect the report instead of assuming green metrics.

## Output

The JSON report uses `schema_version: 1` and includes:

| Field | Meaning |
| --- | --- |
| `generated_at` | ISO timestamp when the report was built |
| `runs_root` | Resolved root used for path checks |
| `versions_requested` | Selected version order |
| `benchmark_note` | Reminder that the report is advisory |
| `versions` | Per-version evidence state, acceptance status, and metrics |
| `comparisons` | Adjacent-version metric comparisons (`v001→v002`, `v002→v003`, …) |
| `missing_evidence` | Flat list of all missing-artifact reasons |

### Per-version block (`versions[]`)

Each entry includes:

- `evidence_state.status`: `complete`, `partial`, or `missing`
- `evidence_state.source_paths`: paths to summaries, acceptance, traces, and scorecards
- `acceptance_status`, `machine_acceptance_status`, `human_acceptance_status` parsed from `acceptance.md`
- `outcome_metrics`: completion and win/loss/aborted counts (persona runs)
- `average_metrics`: turns, damage, items used, invalid actions, softlocks
- `scorecard_averages`: fun, clarity, fairness, tactical_depth, replay_value
- `balance_metrics`: batch win rate, problem runs, softlocks, and averages

Omitted metric groups mean trace or scorecard evidence was missing for that version.

### Adjacent comparisons (`comparisons[]`)

Each comparison pairs consecutive requested versions (`base_version` → `target_version`) and contains:

- `metrics[]`: one row per tracked metric with `label`, `base`, `target`, `delta`, `direction_rule`, `evidence_paths`, and `missing_reasons`
- `acceptance_status`: acceptance trend using the same four labels

Every metric row lists `evidence_paths` pointing at traces and scorecards used for that comparison so you can verify claims without trusting aggregates alone.

## Trend Labels

| Label | Meaning |
| --- | --- |
| `improved` | Target moved in the configured favorable direction vs base |
| `regressed` | Target moved in the unfavorable direction |
| `unchanged` | Compared numeric values are equal (delta `0`) |
| `missing` | Base or target lacked trace-backed evidence for that metric |

Direction rules are metric-specific:

- **Higher is better:** completion rate, win count, item use, reviewer score averages, balance win rate
- **Lower is better:** loss count, aborted count, turns, damage, invalid actions, softlocks, problem-run count, balance softlock count

Acceptance comparisons map human/machine statuses to ranks (`accepted`/`pass` better than `pending`/`warning`, which are better than `rejected`/`fail`/`blocked`). Unknown or missing acceptance yields `missing`.

## Interpretation

The benchmark is advisory evidence, not governance.

- A better aggregate score does **not** auto-accept a version.
- A regression label does **not** auto-reject a version.
- Human acceptance still lives in `acceptance.md`; traces and scorecards remain the ground truth for gameplay claims.

When a metric is `missing`, fix or regenerate the underlying trace/scorecard paths before drawing conclusions. When a metric is `regressed` or `unchanged`, treat that as honest longitudinal signal—the benchmark is designed to surface flat and negative trends, not to narrate improvement.

## Difference From Demo Loop

| | Demo loop (`pnpm run demo-loop`) | Longitudinal benchmark (`pnpm run longitudinal-benchmark`) |
| --- | --- | --- |
| Primary job | Create or refresh a fixed multi-version demo story | Inspect existing comparable evidence across selected versions |
| Runs playthroughs | Yes (`run-version`, balance batch per profile) | No |
| Writes traces/scorecards | Yes (with overwrite default) | No |
| Pairwise comparisons | Writes `runs/comparisons/<base>_vs_<target>.*` | Computes adjacent trends inside one JSON report |
| Acceptance | Can generate acceptance reports as part of the story | Reads `acceptance.md` only; never writes acceptance |
| LLM / API | Other loop steps may use reviewer tooling; demo loop itself is local harness | Never calls providers |
| Default artifact | `runs/demo_summary.md` plus per-version evidence | `runs/benchmarks/PHASE-23C/longitudinal_summary.json` when `--out` is set |
| Success criteria | Demonstrates the bounded adversarial loop end-to-end | Proves repeatable measurement and visible regression/missing states |

The demo loop manufactures the canonical v001–v003 evidence set. The longitudinal benchmark measures that set (or any other `runs/v###` folders) without changing game code or auto-accepting versions. Run the demo loop to produce evidence; run the benchmark to audit trends across it.

## Related Commands

- `pnpm run demo-loop -- --runs-root .` — regenerate demo evidence
- `pnpm run summarize-version -- --version <id> --runs-root .` — rebuild `version_summary.json`
- `pnpm run compare-versions -- --base <a> --target <b> --runs-root .` — pairwise comparison artifacts
- `pnpm run balance-analytics -- --version <id> --runs-root .` — balance-focused analytics for one version
- `pnpm run accept-version -- --version <id> --runs-root .` — human-governed acceptance (not invoked by the benchmark)

## Validation

Focused tests and smoke commands used for PHASE-23C:

```bash
pnpm test tests/longitudinal-benchmark.test.ts
pnpm run typecheck
pnpm run lint
pnpm run longitudinal-benchmark -- --versions v001,v002,v003 --runs-root . --out runs/benchmarks/PHASE-23C/longitudinal_summary.json
pnpm run longitudinal-benchmark -- --versions v001,v002,v003 --runs-root .
pnpm test
git diff --check
```
