# Structured Patch Proposals

Phase 15A adds machine-readable patch proposals that translate reviewer critique into bounded candidate changes **before** any source code is edited. Proposals are planning artifacts only; they do not apply patches, mutate gameplay, or replace harness validation.

## Command

```bash
pnpm run patch-proposal -- --help
```

Required flags: `--review`, `--scorecard`, `--base-version`, `--target-version`, `--scope`, and at least one `--allowed-path`.

Optional flags:

- `--trace` — trace JSON path (defaults from review/scorecard linkage)
- `--acceptance` — optional acceptance report path for linkage
- `--runs-root` — runs directory (default: current working directory)
- `--risk` — risk note (repeatable)
- `--test-command` — validation command (repeatable; defaults to standard repo gates)
- `--write` — write `runs/<target-version>/patch_proposal.json`
- `--validate-only` — print categorized diagnostics without writing JSON

## Artifact shape

`patch_proposal.json` includes:

- `schema_version`, `proposal_id`, `base_version`, `target_version`, `target_scope`
- `governance` with `human_governed: true` and `autonomous_patch_execution: false`
- `evidence_artifacts` linking trace, review, scorecard, and optional acceptance paths
- `changes[]` (1–3 items), each with title, description, and evidence entries
- `scope.allowed_paths`, `scope.forbidden_changes`, forbidden MVP features, and explicit protocol invariants
- `risks` and `validation_commands`

## Validation

Validation is non-mutating and checks:

- Required evidence files exist under `--runs-root`
- Each proposed change cites evidence (cannot claim scope without proof)
- Forbidden MVP features and protocol-breaking language are blockers
- Global forbidden rules are listed as visible `forbidden` diagnostics

Missing trace/review/scorecard evidence blocks proposal acceptance. Optional acceptance linkage warns when absent but does not block by itself.

## Human governance workflow

1. Run playthroughs and save trace/review/scorecard evidence (`run-version`).
2. Generate a patch proposal from that evidence (`patch-proposal --write`).
3. Human owner reviews, accepts, rejects, or revises the proposal scope.
4. Feed the accepted proposal into `developer-task` using the linked evidence paths and scoped changes.
5. Implement manually, update `patch_plan.md` / `changelog.md`, and rerun validation commands.

Proposals remain separate from implementation authority. The harness still validates versions from traces and scorecards; developer self-report is not proof.

## Developer-task consumption

Use `developerTaskInputFromPatchProposal` (exported from `src/harness/index.ts`) with the proposal plus the authoritative review and scorecard JSON. A valid proposal should pass both proposal diagnostics and developer-task diagnostics before generating `developer_task.md`.

See also [DEVELOPER-WORKFLOW.md](./DEVELOPER-WORKFLOW.md) for markdown handoff details.
