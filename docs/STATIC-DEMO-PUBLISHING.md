# Static Demo Publishing

Phase 18C adds a local read-only exporter for sharing adversarial-loop evidence.

## Export A Bundle

```bash
pnpm run export-static-demo -- --runs-root . --out /tmp/dungeon-forge-static-demo
```

The output directory contains:

- `index.html` - static HTML timeline and per-version artifact links.
- `index.md` - Markdown version of the same evidence bundle.
- `manifest.json` - machine-readable bundle summary.

Without `--out`, the command prints HTML to stdout. Use `--json` for the manifest shape or `--markdown` for the Markdown bundle.

```bash
pnpm run export-static-demo -- --runs-root . --json
pnpm run export-static-demo -- --runs-root . --markdown
```

## Evidence Boundary

The exporter reads saved artifacts under `runs/` and does not mutate source evidence. Missing traces, reviews, scorecards, changelogs, patch plans, comparisons, or acceptance files stay labeled as missing or partial instead of being fabricated.

Use the bundle to inspect:

- Version timeline status and win-rate summaries.
- Generated, accepted, rejected, blocked, partial, and missing evidence labels.
- Trace, review, scorecard, changelog, patch-plan, developer-notes, balance, comparison, and acceptance links.
- Regeneration commands for the local evidence.

This is an evidence publisher, not a hosted deployment or marketing page.
