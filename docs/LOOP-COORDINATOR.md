# Loop Coordinator

Phase 15C adds a human-governed coordinator for one adversarial loop iteration: run evidence → review → proposal → developer task → validation → acceptance.

The coordinator **assesses** state and **suggests** commands. It does not edit source, merge branches, execute `pnpm run check`, or invent validation pass/fail results.

## Command

```bash
pnpm run loop-coordinator -- --help
```

Assess a loop (stdout JSON + runbook markdown):

```bash
pnpm run loop-coordinator -- --base-version v001 --target-version v002 --runs-root .
```

Persist decision checkpoint artifacts:

```bash
pnpm run loop-coordinator -- --base-version v001 --target-version v002 --runs-root . --write
```

Reviewer-driven handoff (structured proposal optional):

```bash
pnpm run loop-coordinator -- --base-version v001 --target-version v002 --reviewer-driven --runs-root .
```

Preview validation after orchestrator runs gates (statuses are never fabricated):

```bash
pnpm run loop-coordinator -- \
  --base-version v001 \
  --target-version v002 \
  --runs-root . \
  --command-status typecheck:pass \
  --command-status test:pass \
  --command-status lint:pass \
  --command-status build:pass
```

## Ordered steps

| Step | Purpose | Typical command |
| --- | --- | --- |
| run | Default trace/scorecard matrix on base version | `pnpm run run-version` |
| review | Review JSON/Markdown from playthroughs | Produced by `run-version` |
| proposal | Structured `patch_proposal.json` or scoped `patch_plan.md` | `pnpm run patch-proposal --write` |
| developer_task | Evidence-backed handoff for implementers | `pnpm run developer-task --write` |
| validation | Local repo gates (orchestrator-run) | `pnpm run check` |
| acceptance | Human-governed acceptance report | `pnpm run accept-version` |

## Decision checkpoint format

Written to `runs/loop-coordinator/<base>_to_<target>.json` when using `--write`:

- `checkpoint_kind: loop_coordinator_decision`
- `outcome`: `blocked` | `partial` | `ready_for_acceptance` | `accepted` | `rejected`
- `steps[]` with per-step `status`, `blockers`, and `suggested_commands`
- `required_human_decisions[]` and `next_commands[]`
- `governance` flags (no autonomous code edit/merge)
- Optional `validation_preview` when `--command-status` values are supplied

Companion runbook: `runs/loop-coordinator/<loop_id>.md`

## Loop outcomes

- **blocked** — missing run evidence, missing required proposal/task, placeholder handoffs, or explicit blockers.
- **partial** — some steps complete; operator must finish evidence or human decisions.
- **ready_for_acceptance** — evidence complete and supplied validation preview passes; human owner still records acceptance.
- **accepted** / **rejected** — read from target `acceptance.md` human/machine sections.

## Credential-free path

Default assessment uses existing deterministic baseline evidence from `run-version`. No LLM credentials are required for coordinator dry-runs.

## Artifact preservation

Coordinator output is additive under `runs/loop-coordinator/`. It does not delete or overwrite trace, review, scorecard, changelog, patch plan, developer task, or acceptance artifacts.

## Related docs

- [PATCH-PROPOSALS.md](./PATCH-PROPOSALS.md) — structured proposals (Phase 15A)
- [WORKTREE-AGENT-ORCHESTRATION.md](./WORKTREE-AGENT-ORCHESTRATION.md) — isolated worktree tasks (Phase 15B)
- [VALIDATION.md](./VALIDATION.md) — local gates and CI smoke
