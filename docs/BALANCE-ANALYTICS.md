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
