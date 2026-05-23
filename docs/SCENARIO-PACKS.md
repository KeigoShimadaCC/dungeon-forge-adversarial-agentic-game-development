# Scenario Content Packs (Phase 16C)

Bounded local scenario packs extend finite dungeon content without a plugin framework or remote downloads.

## Manifest

`content/scenario-packs.json` (`schemaVersion: "16C"`) lists packs with:

- `id`, `label`, `description`
- `contentFile` — registered overlay JSON under `content/packs/`
- optional `gameConfig` — merged on top of version profile + challenge mode overlays
- optional `recommendedSeeds`

## Example pack

`shrine_trial` (`content/packs/shrine-trial.json`) replaces floors 1–2, adds a floor-1 trial event, and moves the shrine keeper to floor 1 for a two-floor bounded run.

## Selection

Omit `--scenario-pack` for default unlabeled gameplay (base `content/*.json` only).

```bash
pnpm run simulate-seed -- --seed seed_002 --policy stairs-seeking --version v016 --scenario-pack shrine_trial

pnpm run run-version -- --version v016 --scenario-pack shrine_trial --runs-root .
```

Challenge modes and scenario packs compose: challenge overlay applies first, then pack `gameConfig`, then pack content merge.

## Evidence

Traces and scorecards include `scenario_pack` and `scenario_pack_label` when a pack is selected. Version summaries, comparisons, and acceptance markdown list the pack alongside challenge mode when present.

## Validation

Pack overlays are validated before play:

- schema version checks
- reference integrity across merged content
- duplicate-id conflicts between base and pack definitions
- conflicting floor replacements

Invalid packs throw `ScenarioPackValidationError` with path-specific diagnostics.
