# Using Automated Agent Mode

**Recommended repo path:** `docs/USING_AUTOMATED_AGENT_MODE.md`  
**Scope:** Local-first phase automation for this repo’s agentic development workflow.

This document explains how the automated agent mode works, what each agent is responsible for, how to run it safely, and how to interpret the generated evidence.

---

## 1. What Automated Agent Mode Is

Automated Agent Mode is a local-first development loop that uses deterministic repo tooling to coordinate coding agents through phase-based work.

It is designed for this workflow:

```text
concept-and-ideas/
  ↓
phase-plans/
  ↓
automation/phase-graph.json
  ↓
deterministic autopilot runner
  ↓
Planner Codex
  ↓
plan acceptance gate
  ↓
Executor Codex
  ↓
optional bounded Cursor subtasks
  ↓
Recheck agent
  ↓
local validation
  ↓
PR/check/merge gates
  ↓
cleanup and phase-state update
```

The core principle is:

> Agents may plan, implement, and audit. The deterministic runner owns sequencing, evidence, policy gates, PR/merge decisions, cleanup, and phase-state updates.

This means Automated Agent Mode is **not** “let an LLM decide everything.” It is an evidence-driven execution loop where LLMs are bounded workers and the runner is the release controller.

---

## 2. What It Is Not

Automated Agent Mode is not:

- a replacement for concept creation
- a replacement for phase planning
- a cloud runner
- a SaaS product
- a default-on merge bot
- a tool that should be run blindly on high-risk code
- a system where Cursor implements directly from the raw phase plan

The intended design is explicitly **not**:

```text
Codex reads phase plan
  → Codex directly asks Cursor to implement
  → Codex merges
```

The intended design is:

```text
runner
  → Planner Codex
  → accepted plan
  → Executor Codex
  → optional Cursor subtask from accepted-plan task ID
  → Recheck
  → deterministic gate
```

---

## 3. Key Files

### Automation contract

```text
automation/README.md
automation/phase-graph.json
automation/phase-state.json
automation/autopilot-config.json
automation/policies/automerge-policy.json
```

These define:

- the phase graph
- current phase state
- allowed paths
- validation commands
- agent command templates
- merge policy
- safety defaults

### Prompt templates

```text
automation/prompts/codex-planner.md
automation/prompts/codex-executor.md
automation/prompts/cursor-subtask.md
automation/prompts/recheck.md
```

These define the responsibilities of each agent role.

### Core implementation

```text
src/harness/phase-autopilot.ts
src/harness/phase-runner.ts
src/harness/phase-runner-cli.ts
src/harness/plan-acceptance.ts
src/harness/agent-adapters.ts
src/harness/agent-report-parser.ts
src/harness/command-executor.ts
src/harness/git-adapter.ts
src/harness/github-cli-adapter.ts
src/harness/evidence-collector.ts
src/harness/secret-scan.ts
src/harness/run-state.ts
```

### Coordination file

```text
PROGRESS.MD
```

`PROGRESS.MD` is the live handoff file. Agents must read and update it during phase work.

### Phase plans

```text
phase-plans/PHASE-*.md
```

Each phase plan defines the implementation contract for one phase.

---

## 4. Agent Roles

## 4.1 Deterministic Runner

The runner is TypeScript code. It owns policy and stage sequencing.

It is responsible for:

- selecting the runnable phase
- building the phase bundle
- creating run evidence directories
- creating worktrees and branches
- invoking configured agents only when allowed
- validating planner reports
- writing accepted-plan artifacts
- running local validation
- collecting changed paths
- scanning for secrets
- creating PRs when allowed
- watching remote checks
- evaluating local and final merge gates
- merging when allowed and safe
- cleaning clean worktrees
- updating `automation/phase-state.json`

The runner must not delegate policy decisions to an LLM.

---

## 4.2 Planner Codex

Planner Codex is read-only.

It reads:

```text
AGENTS.md
PROGRESS.MD
concept-and-ideas/01_NORTH_STAR_AND_VISION.md
concept-and-ideas/02_STRUCTURE_AND_TECH_SPECS.md
automation/phase-graph.json
automation/policies/automerge-policy.json
active phase plan
```

It produces:

```text
agent-results/planner-output.md
agent-results/planner-report.json
```

Planner Codex must not:

- edit files
- call Cursor
- create branches
- create PRs
- commit
- merge
- delete worktrees
- update phase state

Its job is to turn the phase plan into an executable, testable, bounded plan.

---

## 4.3 Plan Acceptance Gate

The runner validates the planner report before execution.

The gate blocks when:

- the planner report is missing
- the report has invalid JSON
- the phase ID does not match
- the planner recommends blocking
- unresolved questions remain
- task paths exceed the phase `allowedPaths`
- required tests, smokes, or artifacts are missing
- the planner fails to cover parsed phase acceptance criteria
- the plan requires secrets, credentials, external services, or forbidden capabilities

Accepted plan artifacts are written to:

```text
accepted-plan/plan-approval.json
accepted-plan/accepted-plan.md
accepted-plan/accepted-plan.json
```

Executor Codex cannot run without `accepted-plan/accepted-plan.json`.

---

## 4.4 Executor Codex

Executor Codex is the implementation agent.

It consumes:

```text
accepted-plan/accepted-plan.json
```

It must:

- work in the assigned worktree
- update `PROGRESS.MD` before implementation
- execute accepted-plan tasks
- stay within allowed paths
- run targeted checks where practical
- classify gaps as `blocking`, `non_blocking`, or `out_of_scope`
- write a structured executor report

It produces:

```text
agent-results/executor-output.md
agent-results/executor-report.json
```

Executor Codex may delegate to Cursor only when the accepted plan explicitly marks a task as Cursor-delegatable.

---

## 4.5 Cursor Subtask Agent

Cursor is a bounded implementation delegate.

Cursor does **not** receive the full phase plan and free rein. It receives a generated prompt for one accepted-plan task ID.

Cursor subtask prompts include:

- phase ID
- task ID
- task title
- accepted plan path
- allowed paths
- required tests and smokes
- structured output schema

Cursor artifacts are written under:

```text
cursor-tasks/
  task-001-prompt.md
  task-001-output.md
  task-001-report.json
  cursor-subtasks.json
```

Cursor output is advisory until Executor Codex and deterministic validation verify it.

---

## 4.6 Restricted Agent Delegate

The restricted API coding agent can be enabled as an optional delegate after
Cursor subtasks and before recheck. It is default-off and only runs accepted-plan
tasks with `restrictedAgentDelegation.recommended === true`.

Restricted delegate evidence is written under:

```text
restricted-agent-tasks/
  restricted-agent-tasks.json
  task-001/
    repair-loop-report.json
```

The restricted delegate is not a release controller. Recheck, local validation,
changed-path scan, secret scan, local/final gates, PR policy, merge policy, and
phase-state completion remain authoritative. Cursor remains supported for
explicitly delegated broader subtasks.

---

## 4.7 Recheck Agent

The recheck agent audits the implementation.

It audits against:

- original phase plan
- accepted plan
- executor report
- Cursor subtask reports
- actual changed files
- validation evidence
- local/final gate evidence
- `PROGRESS.MD`

It produces:

```text
agent-results/recheck-output.md
agent-results/recheck-report.json
```

The final gate blocks when:

- recheck is missing
- recheck is blocked
- phase acceptance is incomplete
- blocking gaps remain

---

## 5. Stage Flow

The hardened stage order is:

```text
bundle
preflight
setup
bootstrap
planning
plan-acceptance
execution
cursor-subtasks
restricted-agent-delegate
recheck
local-validation
changed-path-scan
secret-scan
local-evidence
local-gate
commit
pr
checks
remote-evidence
final-gate
merge
cleanup
complete
```

### Why this order matters

The runner now builds local safety evidence before opening a PR.

PR creation is blocked when:

- local validation fails
- changed paths exceed allowed scope
- changed paths include forbidden credential paths
- diff text includes secret-like material
- recheck fails or is missing
- phase acceptance is incomplete
- blocking gaps remain

Merge is blocked unless the final gate allows it.

If local `gh pr merge` fails, the runner verifies remote PR state before deciding whether the merge actually succeeded.

---

## 6. Safety Defaults

Automated Agent Mode is default-deny.

By default, it does **not**:

- invoke agents
- create PRs
- merge PRs
- run multiple phases
- delete dirty worktrees

The relevant flags are:

```bash
--allow-agent-execution
--allow-pr
--allow-merge
--until-complete
--continue-on-blocked
```

Plan approval defaults to manual unless overridden:

```bash
--plan-approval manual
--plan-approval auto
--plan-approval disabled
```

Agent modes default to manual unless overridden:

```bash
--planner-agent manual|shell
--executor-agent manual|shell
--rechecker-agent manual|shell
```

---

## 7. Common Commands

## 7.1 Check current phase status

```bash
pnpm run phase -- status
```

Use this first. It shows current phase state and next runnable phase jobs.

---

## 7.2 Show next runnable phase

```bash
pnpm run phase -- next --from PHASE-22A --parallel 1
```

Use `--parallel 1` until the system has been dogfooded more.

---

## 7.3 Generate a phase bundle

```bash
pnpm run phase -- bundle --phase PHASE-22A --run-id inspect
```

This writes the prompt bundle and `phase-run-plan.json`.

---

## 7.4 Dry-run one phase

```bash
pnpm run phase -- autopilot --phase PHASE-22A --dry-run --run-id dry-run-001
```

Dry-run writes:

```text
runs/phase-runner/<phase>/<run-id>/
  run-state.json
  dry-run-plan.txt
  phase-run-plan.json
  prompt files
  final-decision.json
```

Dry-run does not:

- create worktrees
- invoke agents
- create PRs
- merge
- clean up branches

---

## 7.5 Run one explicit stage

```bash
pnpm run phase -- execute --phase PHASE-22A --stage local-validation --run-id run-001
```

Useful for debugging.

Supported stages include:

```text
bundle
preflight
setup
bootstrap
planning
plan-acceptance
execution
cursor-subtasks
restricted-agent-delegate
recheck
local-validation
changed-path-scan
secret-scan
local-evidence
local-gate
commit
pr
checks
remote-evidence
final-gate
merge
cleanup
```

---

## 7.6 Resume a run

```bash
pnpm run phase -- resume --phase PHASE-22A --run-id run-001
```

Resume reads:

```text
runs/phase-runner/<phase>/<run-id>/run-state.json
```

and continues from the next stage after the last completed stage.

---

## 7.7 Inspect a run

```bash
pnpm run phase -- inspect-run --phase PHASE-22A --run-id run-001
```

This reports the run state, evidence directory, and merge evidence path.

---

## 7.8 Supervised agent execution, no PR

Use this after dry-run looks correct:

```bash
pnpm run phase -- autopilot --phase PHASE-22A   --allow-agent-execution   --planner-agent shell   --executor-agent shell   --rechecker-agent shell   --plan-approval manual
```

This lets agents run, but does not create a PR or merge.

---

## 7.9 Supervised agent execution with PR, no merge

Use this after reviewing local evidence:

```bash
pnpm run phase -- autopilot --phase PHASE-22A   --allow-agent-execution   --allow-pr   --planner-agent shell   --executor-agent shell   --rechecker-agent shell   --plan-approval manual
```

This can create a PR after local gates pass. It will not merge.

---

## 7.10 Agent execution with PR and merge

Use only after several clean dogfood runs:

```bash
pnpm run phase -- autopilot --phase PHASE-22A   --allow-agent-execution   --allow-pr   --allow-merge   --planner-agent shell   --executor-agent shell   --rechecker-agent shell   --plan-approval manual
```

For now, keep `--plan-approval manual` when using `--allow-merge`.

---

## 7.11 Run until complete

```bash
pnpm run phase -- autopilot --from PHASE-22A --until-complete   --allow-agent-execution   --planner-agent shell   --executor-agent shell   --rechecker-agent shell   --plan-approval manual   --parallel 1
```

Use `--parallel 1` by default.

Avoid `--continue-on-blocked` unless you are deliberately testing failure handling.

---

## 8. Evidence Directory

Every run writes durable evidence under:

```text
runs/phase-runner/<phase-id>/<run-id>/
```

Typical structure:

```text
run-state.json
phase-run-plan.json
dry-run-plan.txt
final-decision.json

agent-results/
  planner-output.md
  planner-report.json
  executor-output.md
  executor-report.json
  recheck-output.md
  recheck-report.json

accepted-plan/
  plan-approval.json
  accepted-plan.md
  accepted-plan.json

cursor-tasks/
  task-001-prompt.md
  task-001-output.md
  task-001-report.json
  cursor-subtasks.json

command-results/
  *.stdout.log
  *.stderr.log
  *.json

git/
  status-before.json
  status-after.json
  changed-paths.json
  commits.json

phase-merge-evidence.json
secret-scan.json
pr.json
checks.json
merge.json
merge-remote-verification.json
cleanup.json
progress-snapshot-before.md
progress-snapshot-after.md
diff-summary.txt
```

Generated evidence under `runs/**` is ignored by git by default. The design truth is source, tests, config, docs, and phase plans.

---

## 9. Evidence and Gates

## 9.1 Local evidence

Local evidence is built before PR creation.

It includes:

- local validation results
- changed paths
- untracked files
- diff text
- secret scan results
- recheck report
- worktree status
- blocking gaps

## 9.2 Local gate

The local gate blocks before PR creation when:

- validation fails
- recheck fails
- phase acceptance is incomplete
- changed paths are outside allowed scope
- untracked files are outside allowed scope
- `.env` or credential-like paths appear
- secret-like values appear in diff text or readable untracked file content
- blocking gaps remain

## 9.3 Remote evidence

Remote evidence is built after PR checks.

It includes:

- remote check state
- post-commit worktree status
- existing local evidence
- PR/check metadata

## 9.4 Final gate

The final gate must allow before merge.

## 9.5 Merge stage

The merge stage:

1. evaluates the final gate again
2. runs `gh pr merge`
3. blocks unless merge succeeds
4. if local merge command fails, checks remote PR state
5. treats the merge as successful only if remote state proves the PR is merged
6. only then proceeds to cleanup

---

## 10. Changed Path and Secret Safety

Changed-path evidence includes:

```bash
git diff --name-only <baseRef>
git ls-files --others --exclude-standard
```

This ensures both tracked modifications and new untracked files are included before `git add -A`.

Diff evidence includes:

- normal tracked diff text
- readable untracked file content, when practical
- skip markers for unreadable, binary, directory, or very large untracked files

The secret scan checks:

- forbidden credential-like paths, such as `.env`
- secret-like values in diff text
- secret-like values in readable untracked files

This is intended to prevent agent-created secrets or out-of-scope files from being committed silently.

---

## 11. Agent Command Templates

Agent commands are configured in:

```text
automation/autopilot-config.json
```

Template variables:

```text
{{WORKSPACE}}
{{PROMPT_PATH}}
{{OUTPUT_PATH}}
{{EVIDENCE_DIR}}
{{PHASE_ID}}
```

Typical providers:

```json
{
  "provider": "shell",
  "commandTemplate": "codex "$(cat \"{{PROMPT_PATH}}\")"",
  "timeoutMs": 1800000,
  "inactivityTimeoutMs": 300000,
  "maxRetries": 1
}
```

Cursor subtasks use the Cursor Agent CLI template:

```json
{
  "provider": "shell",
  "commandTemplate": "agent --print --trust --model composer-2.5 --workspace "{{WORKSPACE}}" "$(cat \"{{PROMPT_PATH}}\")""
}
```

Do not put secrets in `automation/autopilot-config.json`.

---

## 12. Recommended Use Pattern

Use the mode progressively.

### Step 1: dry-run

```bash
pnpm run phase -- autopilot --phase <phase> --dry-run --run-id <id>
```

Review:

```text
dry-run-plan.txt
phase-run-plan.json
prompt files
```

### Step 2: agents only

```bash
pnpm run phase -- autopilot --phase <phase>   --allow-agent-execution   --planner-agent shell   --executor-agent shell   --rechecker-agent shell   --plan-approval manual
```

Review:

```text
planner-report.json
accepted-plan.json
executor-report.json
recheck-report.json
phase-merge-evidence.json
```

### Step 3: agents + PR

```bash
pnpm run phase -- autopilot --phase <phase>   --allow-agent-execution   --allow-pr   --planner-agent shell   --executor-agent shell   --rechecker-agent shell   --plan-approval manual
```

Review the PR before merge.

### Step 4: agents + PR + merge

```bash
pnpm run phase -- autopilot --phase <phase>   --allow-agent-execution   --allow-pr   --allow-merge   --planner-agent shell   --executor-agent shell   --rechecker-agent shell   --plan-approval manual
```

Use this only after the previous modes have passed cleanly.

---

## 13. When the Runner Blocks

A block is not necessarily a bug. It is often the correct behavior.

Common blockers:

| Blocker | Meaning |
|---|---|
| Planner report missing | Planner did not produce required JSON |
| Manual plan approval required | `--plan-approval manual` is active |
| Executor missing accepted plan | Execution attempted before acceptance |
| Cursor subtask report mismatch | Cursor output did not match accepted-plan task ID |
| Local validation failed | Tests/typecheck/lint/build failed |
| Secret scan blocked | Credential path or secret-like diff content detected |
| Local gate blocked | Evidence failed before PR |
| Final gate blocked | Evidence failed after PR checks |
| Remote checks failed | GitHub checks failed |
| Merge failed | Local and remote merge verification failed |
| Dirty worktree cleanup blocked | Worktree was not clean |

Do not bypass blockers by editing evidence. Fix the underlying issue and resume.

---

## 14. Manual Plan Approval

With:

```bash
--plan-approval manual
```

the plan-acceptance stage intentionally blocks after Planner Codex produces the plan.

You should review:

```text
agent-results/planner-report.json
accepted-plan/plan-draft.json, if present
```

Then either:

1. rerun with `--plan-approval auto`, or
2. add a future explicit manual approval command, if one exists later, or
3. edit the plan/prompt and rerun planning.

For early dogfooding, prefer manual approval.

---

## 15. Practical Operating Rules

Use these rules until the system has more real usage history:

1. Start every new phase with `--dry-run`.
2. Keep `--parallel 1`.
3. Use `--plan-approval manual`.
4. Do not use `--allow-merge` until agents-only and PR-only modes pass.
5. Inspect `phase-merge-evidence.json` before merge.
6. Inspect `secret-scan.json` before merge.
7. Inspect `git/changed-paths.json` before merge.
8. Treat any block as useful signal.
9. Do not edit generated evidence to force a pass.
10. Record any repeated failure mode in `PROGRESS.MD`.

---

## 16. Troubleshooting

### Agent command unavailable

Check:

```bash
command -v codex
command -v agent
agent --list-models
```

If `composer-2.5` is unavailable, Cursor subtasks cannot run.

### GitHub CLI unavailable

Check:

```bash
command -v gh
gh auth status
```

PR and merge stages require GitHub CLI access.

### Worktree already exists

If the worktree exists and is clean, the runner may reuse or inspect it. If dirty, the runner should block.

Clean manually only after reviewing the changes.

### Plan acceptance blocks

Open:

```text
agent-results/planner-report.json
final-decision.json
```

Common causes:

- missing focused tests
- missing smoke commands
- missing artifacts
- out-of-scope task paths
- incomplete acceptance coverage

### Secret scan blocks

Open:

```text
secret-scan.json
diff-summary.txt
git/changed-paths.json
```

Remove the secret or credential-like file. Do not allowlist real credentials.

### Merge fails

Open:

```text
merge.json
merge-remote-verification.json
```

If remote verification shows the PR is not merged, fix the issue and resume.

---

## 17. Recommended Next Evolution

Now that the core is usable, further changes should be driven by real dogfood data, not speculative hardening.

Good next improvements:

- frontmatter schema for phase plans
- better CLI UX
- evidence dashboard
- package extraction
- progress archive rotation
- optional parallel execution
- reusable project template

Do not start with package extraction. First run the mode on several real phases.

---

## 18. Quick Reference

```bash
# Status
pnpm run phase -- status

# Dry-run
pnpm run phase -- autopilot --phase <phase> --dry-run --run-id <id>

# Agents only
pnpm run phase -- autopilot --phase <phase>   --allow-agent-execution   --planner-agent shell   --executor-agent shell   --rechecker-agent shell   --plan-approval manual

# Agents + PR
pnpm run phase -- autopilot --phase <phase>   --allow-agent-execution   --allow-pr   --planner-agent shell   --executor-agent shell   --rechecker-agent shell   --plan-approval manual

# Agents + PR + merge
pnpm run phase -- autopilot --phase <phase>   --allow-agent-execution   --allow-pr   --allow-merge   --planner-agent shell   --executor-agent shell   --rechecker-agent shell   --plan-approval manual

# Resume
pnpm run phase -- resume --phase <phase> --run-id <id>

# Inspect
pnpm run phase -- inspect-run --phase <phase> --run-id <id>
```

---

## 19. Summary

Automated Agent Mode turns phase plans into bounded, evidenced agent work.

The essential invariant is:

```text
LLMs can plan, implement, and audit.
The deterministic runner decides whether the phase may proceed.
```

Use it incrementally:

```text
dry-run
  → agents only
  → agents + PR
  → agents + PR + merge
```

Keep manual plan approval until the system has enough successful dogfood history.
