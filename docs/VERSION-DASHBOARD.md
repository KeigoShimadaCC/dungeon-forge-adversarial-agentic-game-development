# Version Dashboard

Phase 18A adds a local, read-only evidence viewer for generated versions.

## Build a Static Viewer

```bash
pnpm run version-dashboard -- --runs-root . --out /tmp/dungeon-forge-dashboard/index.html
```

Open the generated HTML file in a browser. The page reads local `runs/` artifacts and links back to traces, reviews, scorecards, changelogs, comparisons, summaries, and acceptance files. The command writes only the derived dashboard HTML file.

## Print HTML Or JSON

```bash
pnpm run version-dashboard -- --runs-root .
pnpm run version-dashboard -- --runs-root . --json
```

Without `--out`, the command writes to stdout and does not create files.

## Inspect One Artifact

```bash
pnpm run version-dashboard -- --runs-root . --artifact runs/v003/acceptance.md
pnpm run version-dashboard -- --runs-root . --artifact runs/v003/scorecards/seed_001_careful_player.json
```

Artifact paths must stay under `runs/`. JSON artifacts are parsed and reprinted deterministically for easier review. Markdown and text artifacts are printed as-is.

## Read-Only Boundary

The dashboard is a local viewer. It does not edit traces, reviews, scorecards, summaries, comparisons, acceptance files, game state, or source data. The headless harness commands remain the source of truth for gameplay and acceptance.
