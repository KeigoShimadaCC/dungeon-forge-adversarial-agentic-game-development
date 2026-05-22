# Worktree Agent Orchestration

Phase 15B packages bounded coding-agent tasks for isolated git worktrees and collects structured results without granting merge authority to delegated agents.

## Commands

```bash
pnpm run worktree-task -- --help
```

Generate an implementation bundle:

```bash
pnpm run worktree-task -- --phase PHASE-15B --write --write-result-template
```

Generate a read-only auditor bundle:

```bash
pnpm run worktree-task -- --phase PHASE-15B --kind read_only_audit --write
```

Validate a bundle without writing:

```bash
pnpm run worktree-task -- --phase PHASE-15B --validate-only
```

Validate an agent/orchestrator result summary:

```bash
pnpm run worktree-task -- --validate-result runs/worktree-tasks/PHASE-15B/result_summary.json
```

Optional linkage to patch proposals and developer tasks:

```bash
pnpm run worktree-task -- \
  --phase PHASE-15B \
  --patch-proposal runs/v002/patch_proposal.json \
  --developer-task runs/v002/developer_task.md \
  --target-version v002 \
  --write
```

## Task bundle shape

`implementation_task.json` and `auditor_task.json` include:

- `schema_version`, `bundle_id`, `task_kind`
- `phase` (`id`, `plan_path`, `branch`, `worktree_path`)
- `governance` with human governance and no autonomous merge/push
- `scope` (`allowed_paths`, `forbidden_paths`, `forbidden_changes`, `protocol_invariants`)
- `evidence.artifacts` with required phase plan and optional trace/review/scorecard/patch-proposal paths
- `context_exclusions` excluding secrets and unrelated private files
- `validation_commands` for orchestrator-owned local gates
- `delegate` (`cursor`, `composer-2.5`, `agent` or `ask` mode)
- `instructions` for implementation or read-only audit passes

Missing phase id, allowed paths, validation commands, or required evidence blocks bundle validation.

## Result summary shape

`result_summary.json` records advisory agent output for human review:

- `diff` with `status` (`pass`, `fail`, `blocked`, `not_run`) and changed files
- `checks[]` per validation command with the same status vocabulary
- `blockers`, `risks`, `advisory_notes`
- `overall_status` (`pass`, `fail`, `blocked`)
- `governance.verified_by_orchestrator` remains false until the orchestrator reruns gates

Agent reports are not proof. Local repo gates (`pnpm run check`, tests, typecheck, lint, build, `git diff --check`) still run outside delegated agent authority.

## Workflow

1. Orchestrator selects phase scope from `automation/phase-graph.json`.
2. Generate and validate a worktree task bundle (`worktree-task --validate-only`, then `--write`).
3. Create the isolated worktree and run Cursor with bounded ownership from the bundle.
4. Collect diff/test notes into `result_summary.json` (template via `--write-result-template`).
5. Orchestrator verifies files, diffs, and reruns local gates before commit/PR/merge.

Implementation and read-only audit passes are separate bundles. Audit bundles use `--kind read_only_audit` and forbid edit/install/commit/push/merge actions.

## Related docs

- [PATCH-PROPOSALS.md](./PATCH-PROPOSALS.md) — structured planning input
- [DEVELOPER-WORKFLOW.md](./DEVELOPER-WORKFLOW.md) — markdown handoff artifacts
- `automation/README.md` — phase-runner bundles and automerge policy
