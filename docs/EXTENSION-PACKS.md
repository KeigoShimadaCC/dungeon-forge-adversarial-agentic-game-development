# Extension Packs

Phase 19A adds a local extension-pack layer for bounded experiments. Extension packs are declarative JSON only: they can reference registered scenario content, existing baseline policies, existing reviewer personas, and local scenario presets.

## Files

- `content/extension-packs.json` lists registered packs.
- `content/extensions/reviewer-labs.json` is the accepted example pack.
- `content/extensions/examples/rejected-forbidden-capability.json` is an intentionally rejected validation fixture.

## Compatibility

Each pack must declare compatibility with the current engine and artifact protocol versions:

- `engineProtocolVersion`
- `artifactSchemaVersion`

The loader rejects mismatches so extension evidence cannot silently cross incompatible engine or trace/scorecard schemas.

## Security Limits

Extension packs are local-only data. They do not load remote content, execute arbitrary code, install packages, or call external services. Unknown capabilities such as `execute_code` are rejected.

## Run Evidence

Harness runs can select an extension pack with `--extension-pack reviewer_labs`. Traces, scorecards, and version summaries record:

- `extension_pack`
- `extension_pack_label`

If the extension pack declares a default `scenarioPack`, that scenario pack is used unless an explicit `--scenario-pack` is supplied.

```bash
pnpm run simulate-seed -- --seed seed_002 --policy stairs-seeking --version v019 --extension-pack reviewer_labs
pnpm run run-version -- --version v019 --extension-pack reviewer_labs --runs-root .
```

Default runs without `--extension-pack` continue to use base content and omit extension metadata.
