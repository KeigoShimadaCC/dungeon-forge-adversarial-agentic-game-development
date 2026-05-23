# Content Governance

Phase 19B adds a local governance pass for authored, generated, scenario-pack, and extension-pack content before it affects gameplay.

## Command

```bash
pnpm run content-governance
pnpm run content-governance -- --format markdown
pnpm run content-governance -- --out runs/content-governance/content_governance_report.json
```

The command is read-only unless `--out` is provided. It exits non-zero when blocker findings exist.

## Rule Set

- Schema and required fields are checked through the existing typed content validators.
- References must resolve across items, enemies, traps, floors, NPCs, dialogue trees, and dialogue choices.
- Finite bounds reject missing floor progressions, excessive `maxTurns`, oversized maps, and spawn budgets that do not fit the map.
- Forbidden scope rejects content that requires infinite/no-ending play, unstructured commands, required media, external-service gameplay, or real-time play.
- Text clarity warnings flag very short descriptions, narrative text, instructions, or reviewer notes.

## Diff Summary

Governance reports include local diff summaries for scenario packs and extension-pack default scenarios. Each summary lists added, removed, changed, and unchanged IDs for items, enemies, traps, floors, floor events, NPCs, and dialogue trees.

## Report Contract

JSON reports use schema version `19B` and include:

- `ok`
- `summary`
- `sources`
- `diagnostics`
- `diffSummaries`

Markdown reports render the same findings and diff summaries for review. Findings are advisory evidence until the orchestrator verifies tests, traces, scorecards, and phase acceptance.
