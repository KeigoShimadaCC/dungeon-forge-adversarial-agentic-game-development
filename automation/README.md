# Full Automation Scheme

This directory defines the intended autopilot for phase-based agentic coding in this repo.

The goal is not to let an LLM decide that a phase is done by vibes. The goal is to let agents do all routine work while a deterministic policy decides whether a phase can be merged, cleaned up, and marked complete.

## Operating Model

The autopilot runs one phase or a dependency graph of phases from `phase-plans/**`.

Implemented command shape:

```bash
pnpm run phase -- status
pnpm run phase -- next --from PHASE-13A --parallel 2
pnpm run phase -- bundle --phase PHASE-13A
```

The implemented runner currently:

1. Load `automation/phase-graph.json`.
2. Load `automation/phase-state.json`.
3. Pick phases whose dependencies are complete and whose path scopes do not conflict.
4. Generate the branch, worktree, evidence directory, Codex prompt, Cursor implementation prompt, Cursor recheck prompt, local validation commands, PR commands, and cleanup commands for each runnable phase.
5. Evaluate whether collected phase evidence satisfies `automation/policies/automerge-policy.json`.
6. Mark a phase complete or blocked in `automation/phase-state.json`.

The next execution layer should run the generated commands and write the evidence files that this core already models.

Future full-execution command shape:

```bash
pnpm phase autopilot --from PHASE-13A --parallel 2 --automerge
```

## Implemented Commands

```bash
pnpm run phase -- status
```

Prints phase-state counts, graph validation errors, and the next runnable Codex orchestration jobs.

```bash
pnpm run phase -- next --from PHASE-13A --parallel 2
```

Prints runnable phase jobs from the DAG, avoiding overlapping path scopes.

```bash
pnpm run phase -- bundle --phase PHASE-13A --output /tmp/phase-13a-bundle --run-id dry-run-001
```

Writes `codex-plan-prompt.md`, `cursor-implementation-prompt.md`, `cursor-recheck-prompt.md`, and `phase-run-plan.json`.

```bash
pnpm run phase -- gate --phase PHASE-13A --evidence /tmp/phase-13a-merge-evidence.json
```

Evaluates local checks, remote-check status, Cursor recheck result, changed paths, worktree cleanliness, secret detection, and blocking gaps against the automerge policy.

```bash
pnpm run phase -- complete --phase PHASE-13A --pr 27 --merge-commit <sha> --evidence-dir runs/phase-runner/PHASE-13A/<run-id>
pnpm run phase -- block --phase PHASE-13A --reason "PR checks failed"
```

Updates `automation/phase-state.json`.

## Phase Lifecycle

Every phase moves through these statuses:

```text
queued
planning
planned
implementing
implemented
rechecking
validating
pr_open
checks_pending
merged
cleaned_up
complete
blocked
failed
```

Only `complete` ticks a phase off in `automation/phase-state.json`.

## State Authority

`PROGRESS.MD` remains the live handoff file for agents working inside a phase.

`automation/phase-state.json` is the autopilot state file. It tracks:

- which phases are complete
- branch and PR metadata
- merge commits
- blocked or failed phase reasons
- artifact paths for logs and validation

The two files have different jobs. `PROGRESS.MD` explains current work to agents. `phase-state.json` lets the autopilot resume without asking which phase is next.

## Worktree And Branch Policy

Each phase gets a dedicated worktree:

```text
/Users/keigoshimada/Documents/dungeon-forge-<phase-slug>-wt
```

Each branch is named:

```text
phase/<phase-slug>
```

The runner should never reuse a dirty worktree for a new phase. If cleanup fails because the worktree is dirty, the phase is `blocked`, not silently deleted.

## Agent Roles

### Codex Orchestrator

Codex plans the phase, updates `PROGRESS.MD`, evaluates Cursor output, runs final local validation, applies small fixes when Cursor drifts, creates the PR, and records evidence.

### Decision Resolver AI

This AI answers Codex plan-mode questions automatically. It should prefer the recommended option when:

- the recommendation preserves phase scope
- no secrets or credentials are required
- no external service becomes mandatory
- deterministic tests remain possible
- no forbidden MVP feature is introduced
- no path outside the allowed phase scope is required

If no recommendation satisfies those rules, the resolver must return `block`.

### Cursor Coder

Cursor Agent CLI performs bounded implementation, checking, and targeted testing with `composer-2.5`.

Cursor output is advisory until the orchestrator verifies the diff and local commands.

### Cursor Rechecker

Cursor runs a second bounded audit after implementation:

```text
Can you check whether you have fully implemented the plan and if there are gaps fill in.
```

In practice the prompt must also require:

- a phase-plan checklist
- changed file list
- commands run
- gaps fixed
- remaining gaps appended to `PROGRESS.MD`
- no merge or cleanup authority

## Required Evidence Directory

Every phase run writes a durable evidence bundle:

```text
runs/phase-runner/<phase-id>/<timestamp>/
  codex-plan-prompt.md
  codex-plan-result.md
  decision-resolver.json
  cursor-implementation-prompt.md
  cursor-implementation.log
  cursor-recheck-prompt.md
  cursor-recheck.log
  local-validation.json
  diff-summary.txt
  progress-snapshot-before.md
  progress-snapshot-after.md
  pr.json
  checks.json
  merge.json
  cleanup.json
  final-decision.json
```

Generated evidence under `runs/**` is ignored by git by default. If phase-runner evidence must be committed later, add an explicit allowlist rather than broadly tracking generated output.

## Local Validation Gate

The default local gate is:

```bash
pnpm test
pnpm run typecheck
pnpm run lint
pnpm run build
git diff --check
```

When the active phase defines additional smoke commands, the runner must add them to the gate.

For current harness phases, common smoke commands include:

```bash
pnpm run run-version -- --version <version> --runs-root <tmp-runs-root>
pnpm run summarize-version -- --version <version> --runs-root <tmp-runs-root>
pnpm run accept-version -- --version <version> --runs-root <tmp-runs-root> --command-status typecheck:pass --command-status test:pass --command-status lint:pass --command-status build:pass
```

## PR And Merge Gate

The runner may fully automate PR creation, PR checking, merge, branch deletion, and worktree cleanup only when the automerge policy passes.

Expected GitHub CLI flow:

```bash
gh pr create --fill --base main --head <branch>
gh pr checks <pr-number> --watch
gh pr merge <pr-number> --squash --delete-branch
```

If the repository has no GitHub checks, local validation plus acceptance evidence can satisfy the check gate only if `allowNoRemoteChecksWhenLocalGatePasses` is true in `automation/policies/automerge-policy.json`.

## Branch Deletion And Rollback

Deleting a merged branch is acceptable after a successful merge because the commits remain reachable through `main` history, the PR, and the merge commit. Rollback should be a new revert commit on `main`, not an attempt to recover a deleted branch.

The runner should save:

- PR number
- branch name
- merge commit
- squash commit if applicable
- local validation summary
- cleanup result

## Gap Handling

If the recheck finds gaps:

- `blocking`: fix before merge or mark the phase `blocked`
- `non_blocking`: append to `PROGRESS.MD` future backlog and proceed only if the phase acceptance criteria still pass
- `out_of_scope`: append to `PROGRESS.MD` future backlog and proceed

The runner must not merge if the audit says the phase acceptance criteria are incomplete.

## Parallel Execution

Parallel phases are allowed only when all of these are true:

- dependency graph permits both phases
- allowed paths do not overlap
- neither phase modifies `PROGRESS.MD` without a merge/rebase strategy
- neither phase depends on generated evidence from the other
- both branches can rebase or merge from updated `main` before PR checks

Because `PROGRESS.MD` is high-conflict, the runner should serialize the final progress update and merge step even when implementation work was parallel.

## Failure And Resume

The runner should stop and preserve evidence when:

- Cursor CLI is unavailable
- `composer-2.5` is unavailable
- Codex questions cannot be auto-resolved
- local validation fails
- PR checks fail
- merge conflicts cannot be resolved mechanically
- worktree cleanup sees uncommitted files
- a phase changes forbidden paths
- secrets or `.env` files are detected in the diff

Resume should start from the last recorded phase status and evidence bundle.

## Implementation Roadmap

Recommended implementation order:

1. Add a dry-run phase runner that reads the DAG and prints the next runnable phases.
2. Add state updates and evidence-bundle creation.
3. Add worktree and branch creation.
4. Add Codex plan prompt export and decision resolver integration.
5. Add Cursor implementation and recheck prompt execution.
6. Add local validation.
7. Add PR creation and check watching.
8. Add automerge and cleanup.
9. Add parallel scheduling.
10. Add robust resume and failure reporting.

Until the runner exists, this directory is the contract for implementing it.
