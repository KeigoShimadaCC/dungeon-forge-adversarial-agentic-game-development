# Balance Analytics

Phase 18B adds local advisory analytics over saved balance evidence.

## Generate Analytics

```bash
pnpm run balance-analytics -- --runs-root . \
  --out /tmp/dungeon-forge-balance/balance_analytics.json \
  --leaderboard-out /tmp/dungeon-forge-balance/balance_leaderboard.json
```

Without `--out` or `--leaderboard-out`, the report is printed to stdout and no files are created.

```bash
pnpm run balance-analytics -- --runs-root . --versions v001,v002,v003
```

The report includes:

- Per-version balance aggregates from `runs/<version>/balance_summary.json`.
- Seed, policy, and challenge-mode cohort breakdowns.
- Problem-run category drilldowns with trace and scorecard links.
- Tactical-depth summaries from scorecard `tactical_depth` fields.
- Version-to-version balance deltas.
- A reproducible advisory leaderboard with links back to evidence.
- Missing-data entries when a version lacks balance evidence.

## Dashboard Integration

If analytics JSON files are written under `runs/analytics/`, the version dashboard lists them in its Balance Analytics section.

Suggested local paths:

- `runs/analytics/balance_analytics.json`
- `runs/analytics/balance_leaderboard.json`

These are derived artifacts. They do not replace traces, scorecards, reviews, acceptance reports, or human reviewer judgment.

## Boundary

Balance analytics are advisory. They can highlight regressions and problem seeds, but they do not automatically prove a version is fun, fair, or accepted. Reviewer critique and trace evidence remain the source of truth.

## Gameplay Evaluation Depth

Phase 24B adds `tactical_depth_summary` to balance summaries, per-version analytics, and cohorts. The summary averages trace-backed scorecard metrics such as enemy pressure, navigation friction, tactical item use rate, trap/resource pressure, content interactions, and scenario-depth signals.

Use these values as triage:

- Rising enemy pressure with falling win rate can indicate unfair difficulty.
- High navigation friction with low content interactions can indicate shallow wandering or stall risk.
- Tactical item opportunities without tactical item uses can indicate policy gaps or unclear item affordances.
- Trap/resource pressure should be read with damage and loss categories; it may be intended challenge or a balance outlier.
- Scenario-depth signals show what the run touched, not whether the content was creatively good.

Problem runs now separate protocol failures, policy issues, missing evidence, softlocks, expected hard losses, and balance outliers. Clean hard losses should not be treated as bugs without trace evidence. Human acceptance remains the final creative gate.
