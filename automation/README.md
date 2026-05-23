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
pnpm run phase -- autopilot --phase PHASE-20A --dry-run
pnpm run phase -- execute --phase PHASE-20A --stage local-validation
pnpm run phase -- resume --phase PHASE-20A --run-id <run-id>
pnpm run phase -- inspect-run --phase PHASE-20A --run-id <run-id>
```

The implemented runner:

1. Load `automation/phase-graph.json`.
2. Load `automation/phase-state.json`.
3. Pick phases whose dependencies are complete and whose path scopes do not conflict.
4. Generate branch, worktree, evidence directory, Planner Codex, Executor Codex, Cursor subtask, recheck, validation, PR, and cleanup prompts/commands.
5. Invoke Planner Codex in read-only mode.
6. Validate the planner report through a deterministic plan-acceptance gate.
7. Invoke Executor Codex only after accepted-plan artifacts exist.
8. Allow Executor Codex to delegate Cursor subtasks only from the accepted plan.
9. Invoke the recheck agent against the phase plan, accepted plan, executor report, actual diff, validation evidence, and `PROGRESS.MD`.
10. Evaluate whether machine-derived evidence satisfies `automation/policies/automerge-policy.json`.
11. Mark a phase complete or blocked in `automation/phase-state.json`.

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

Writes Planner Codex, Executor Codex, recheck, compatibility prompt files, and `phase-run-plan.json`.

```bash
pnpm run phase -- gate --phase PHASE-13A --evidence /tmp/phase-13a-merge-evidence.json
```

Evaluates local checks, remote-check status, Cursor recheck result, changed paths, worktree cleanliness, secret detection, and blocking gaps against the automerge policy.

```bash
pnpm run phase -- complete --phase PHASE-13A --pr 27 --merge-commit <sha> --evidence-dir runs/phase-runner/PHASE-13A/<run-id>
pnpm run phase -- block --phase PHASE-13A --reason "PR checks failed"
```

Updates `automation/phase-state.json`.

```bash
pnpm run phase -- autopilot --phase PHASE-20A --dry-run
```

Writes a run plan, prompt bundle, `run-state.json`, progress snapshot, and `final-decision.json` without modifying git state, invoking agents, opening a PR, or merging.

```bash
pnpm run phase -- execute --phase PHASE-20A --stage <stage> --run-id <run-id>
```

Runs one explicit stage. Supported stages are `bundle`, `preflight`, `setup`, `bootstrap`, `planning`, `plan-acceptance`, `execution`, `cursor-subtasks`, `recheck`, `local-validation`, `changed-path-scan`, `secret-scan`, `local-evidence`, `local-gate`, `commit`, `pr`, `checks`, `remote-evidence`, `final-gate`, `merge`, and `cleanup`.

```bash
pnpm run phase -- autopilot --phase PHASE-20A --allow-agent-execution --allow-pr --allow-merge
pnpm run phase -- autopilot --from PHASE-20A --until-complete
```

Runs one phase or a serial until-complete loop. Agent execution, PR creation, and merge remain off unless their flags are passed. Until-complete defaults to `--parallel 1` and stops on the first blocked or failed phase unless `--continue-on-blocked` is supplied.

Plan acceptance is safe by default. Use `--plan-approval auto` only when the deterministic planner-report validator should accept valid plans without a manual checkpoint.

```bash
pnpm run phase -- resume --phase PHASE-20A --run-id <run-id>
pnpm run phase -- inspect-run --phase PHASE-20A --run-id <run-id>
```

Resumes from the last completed stage or prints the recorded run state and merge evidence.

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

### Deterministic Runner

The TypeScript runner owns sequencing and policy. It selects phases, creates evidence directories and worktrees, invokes configured agents, validates reports, evaluates merge gates, and updates phase state. It must not delegate policy decisions to an LLM.

### Planner Codex

Planner Codex is read-only. It reads repo instructions, concept docs, the active phase plan, phase graph, and automerge policy, then produces `agent-results/planner-output.md` and `agent-results/planner-report.json`.

Planner Codex must not edit files, call Cursor, create branches, open PRs, merge, delete worktrees, or update phase state.

### Plan Acceptance Gate

The deterministic runner validates the planner report before execution. It blocks missing or invalid reports, phase mismatch, out-of-scope task paths, missing tests/smokes/artifacts, unresolved questions, secrets, external-service requirements, forbidden MVP features, and planner `block` recommendations.

The gate also parses the active phase plan's acceptance criteria and requires every criterion to be covered by accepted planner tasks. Safe constraint language such as "do not edit `.env`" is allowed; plans that require secrets, credentials, external services, or forbidden MVP features still block.

Accepted plans are written under `accepted-plan/plan-approval.json`, `accepted-plan/accepted-plan.md`, and `accepted-plan/accepted-plan.json`.

### Executor Codex

Executor Codex consumes the accepted plan. It works inside the assigned worktree, updates `PROGRESS.MD`, executes accepted-plan tasks, keeps edits inside allowed paths, runs targeted checks, and writes `agent-results/executor-output.md` plus `agent-results/executor-report.json`.

Executor Codex may delegate Cursor subtasks only when the accepted plan explicitly delegates a bounded task.

### Cursor Subtasks

Cursor prompts are generated from the accepted plan, a specific task ID, allowed paths, relevant phase-plan section, output schema, and required tests/smokes. The deterministic `cursor-subtasks` stage runs only accepted-plan tasks with `cursorDelegation.recommended === true` and requires a matching `CursorSubtaskReport` for each delegated task. Cursor output is advisory until Executor Codex and deterministic validation verify it.

### Recheck Agent

The recheck agent audits against the original phase plan, accepted plan, executor report, actual changed files, validation evidence, and `PROGRESS.MD`. Merge blocks if recheck is missing, blocked, has incomplete phase acceptance, or reports blocking gaps.

## Required Evidence Directory

Every phase run writes a durable evidence bundle:

```text
runs/phase-runner/<phase-id>/<timestamp>/
  run-state.json
  phase-run-plan.json
  dry-run-plan.txt
  prompts/
  accepted-plan/
  agent-results/
  cursor-tasks/
  command-results/
  git/
  codex-plan-prompt.md
  planner-output.md
  planner-report.json
  executor-output.md
  executor-report.json
  recheck-output.md
  recheck-report.json
  local-validation.json
  diff-summary.txt
  progress-snapshot-before.md
  progress-snapshot-after.md
  pr.json
  checks.json
  merge.json
  cleanup.json
  phase-merge-evidence.json
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

The runner builds local evidence before opening a PR. PR creation is blocked when local validation fails, changed paths exceed the phase `allowedPaths`, diff secret scanning finds credential material, recheck is missing or blocked, phase acceptance is incomplete, or blocking gaps remain. The final gate runs again after remote checks using the post-commit clean-worktree status.

## Agent Command Templates

`automation/autopilot-config.json` stores non-secret command templates, total timeouts, inactivity timeouts, and retry counts. Template variables are:

- `{{WORKSPACE}}`
- `{{PROMPT_PATH}}`
- `{{OUTPUT_PATH}}`
- `{{EVIDENCE_DIR}}`
- `{{PHASE_ID}}`

The planner, executor, and rechecker can use `manual` or `shell` providers. Cursor/composer-2.5 is reserved for accepted-plan subtasks and is only invoked when `--allow-agent-execution` is passed by an executor workflow.

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

The merge stage must inspect `gh pr merge` metadata before cleanup or phase completion. If local merge fails, the runner verifies remote PR state with `gh pr view <pr-number> --json state,mergeCommit,mergedAt`; the phase can continue only if the remote PR is actually merged. Otherwise the phase is blocked and evidence is preserved.

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

- Planner report is missing or invalid
- Plan acceptance blocks or requires manual approval
- Executor is requested without accepted-plan artifacts
- Cursor CLI is unavailable for an explicitly accepted Cursor subtask
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
4. Add Planner Codex prompt export and report validation.
5. Add deterministic plan acceptance artifacts.
6. Add Executor Codex prompt execution from accepted plans.
7. Add accepted-plan Cursor subtask prompt/report handling.
8. Add recheck prompt execution.
9. Add local validation.
10. Add PR creation and check watching.
11. Add automerge and cleanup.
12. Add robust resume and failure reporting.

Until the runner exists, this directory is the contract for implementing it.
