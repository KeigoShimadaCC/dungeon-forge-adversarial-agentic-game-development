# PHASE-13A - Evidence Retention

## Purpose

Harden generated run evidence so reruns preserve, archive, or intentionally overwrite artifacts instead of silently replacing version history.

## Source Context

Derived from `PHASE-12A-DEMO-LOOP`, retention and artifact invariants in `PHASE-00A`, and backlog items `F-07A-003`, `F-07A-004`, and `F-09C-003` in `PROGRESS.MD`.

## Target Outcome

Version evidence under `runs/**` is durable enough for repeated adversarial-loop runs, with persisted summaries, comparisons, and clear behavior when a target artifact already exists.

## In Scope

- No-clobber or archive behavior for `run-version`, `run-balance`, summaries, and comparisons.
- Persisted summary and comparison artifacts, not stdout-only reports.
- Clear version-id handling and descriptive smoke-run alias support if compatible with existing version rules.
- Tests proving existing evidence is not accidentally replaced.

## Out Of Scope

- Database storage.
- Cloud artifact retention.
- Browser dashboard work.
- Rewriting historical generated evidence by hand.

## Technical Spec

Dependencies: `PHASE-12A-DEMO-LOOP`.

Add an explicit artifact-write policy for version-loop commands: default to no silent overwrite, with a documented archive or explicit overwrite option. Summary artifacts should live under the relevant version folder, and version comparisons should be saved under a deterministic comparisons location.

CLI and API surface:

- `--on-existing fail|overwrite|archive` on `run-version`, `run-balance`, `summarize-version`, `compare-versions`, `accept-version`, and `demo-loop` (demo-loop defaults to `overwrite` for intentional regeneration).
- `summarize-version` and `compare-versions` persist artifacts by default; pass `--stdout-only` to emit JSON only.
- Descriptive smoke alias: `v09c-smoke` resolves to canonical `v009`.
- Archive copies land under `runs/_archive/<timestamp-or-label>/...` preserving the original relative path.

Keep generated artifacts local-file based and preserve rejected-version artifacts.

## Deliverables

- Artifact write policy implementation or documented CLI flags.
- Persisted version summary files.
- Persisted version comparison files.
- Tests for no-clobber/archive behavior and comparison output paths.

## Tests And Validation

- Existing artifact rerun does not silently replace a trace, review, scorecard, summary, or comparison.
- Explicit overwrite/archive behavior is tested.
- Summary and comparison reports can be regenerated deterministically.
- `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, and `pnpm run build` pass.

## Acceptance Criteria

- Rerunning a version cannot destroy prior evidence without an explicit operator choice.
- A future auditor can inspect saved summary and comparison artifacts without rerunning commands.
- Version-id behavior is documented and consistent across smoke and version-loop commands.

## AI Coder Handoff Notes

Do not change the `GameEngine` protocol. Keep this focused on harness artifact durability and local-file evidence semantics.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
