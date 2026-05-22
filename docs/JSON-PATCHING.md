# Deterministic JSON Patching

Phase 16D adds bounded, auditable JSON/Markdown patching for approved local artifacts after a structured patch proposal has been validated. Patches never mutate TypeScript source, gameplay runtime state, or harness logic.

## Command

```bash
pnpm run json-patch -- --help
```

Required flags:

- `--patch <path>` — deterministic patch document
- `--proposal <path>` — linked `patch_proposal.json` with trace/review/scorecard evidence

Optional flags:

- `--repo-root <path>` — repository root containing patch targets (default: cwd)
- `--runs-root <path>` — runs directory for evidence and reports (default: cwd)
- `--apply` — explicit apply mode (default is dry-run)
- `--write-report` — write `runs/<version>/json_patch_report.json`
- `--write-audit` — append `runs/<version>/json_patch_audit.jsonl` on apply
- `--validate-only` — validation diagnostics only

## Bounded surfaces

Patches may target only:

- `content/**/*.json` — game content bundles and scenario packs
- `src/agents/prompts/**/*.md` — prompt markdown (root-level `set` only)

Blocked targets include `src/game/**`, `src/harness/**`, `runs/**`, and any TypeScript/JavaScript source file.

Each operation must fall under both the patch `scope.allowed_paths` and the linked proposal `scope.allowed_paths`.

## Patch document

`DeterministicJsonPatch` includes:

- `schema_version`, `patch_id`, `proposal_id`, `target_version`
- `governance` with `human_governed`, `human_approved`, `explicit_apply_required`, and `mutates_runtime_state: false`
- `evidence_artifacts` linking trace, review, scorecard, and optional acceptance paths
- `operations[]` using JSON Pointer paths (`set`, `remove`, `add`)
- `rationale` explaining why the patch is safe

Apply mode requires `governance.human_approved: true`.

## Modes

| Mode | Behavior |
| --- | --- |
| Dry-run (default) | Simulates operations, records before/after hashes and previews, writes no target files |
| Apply (`--apply`) | Writes rollback copies under `runs/<version>/json_patch_rollback/`, applies changes, optional audit log |

## Application report

`json_patch_report.json` records:

- patch/proposal linkage and evidence artifact paths
- per-file before/after SHA-256, byte lengths, and short previews
- rollback paths when applied
- categorized diagnostics (blockers, warnings, forbidden rules)

Human acceptance gates and harness validation remain authoritative; this feature only automates bounded local data edits with evidence.

## Workflow

1. Generate and validate a structured patch proposal (`pnpm run patch-proposal`).
2. Human owner approves scope and authors a concrete `json_patch.json` with operations.
3. Run dry-run to inspect the report without changing files.
4. Run explicit apply after setting `human_approved: true`.
5. Continue with normal developer implementation and version validation commands.

See also [PATCH-PROPOSALS.md](./PATCH-PROPOSALS.md) and [LOOP-COORDINATOR.md](./LOOP-COORDINATOR.md).
