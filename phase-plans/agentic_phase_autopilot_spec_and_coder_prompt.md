# Spec Sheet + Coder Prompt: Full Automated Phase Autopilot

**Working title:** Agentic Phase Autopilot  
**Target repo:** `KeigoShimadaCC/dungeon-forge-adversarial-agentic-game-development`  
**Primary goal:** Build a local-first automation loop that can take an already-ideated project with concept docs and phase plans, then repeatedly plan, implement, recheck, validate, PR, merge, clean up, and advance phase state with minimal human intervention.

---

## 0. Executive Summary

The current repo already contains the core *contract* for phase-based agentic development:

- `concept-and-ideas/**` defines the project intent and technical direction.
- `phase-plans/**` defines implementation slices.
- `automation/phase-graph.json` defines phase dependencies, allowed paths, parallel groups, and automerge eligibility.
- `automation/phase-state.json` tracks current and completed phases.
- `automation/prompts/**` contains prompt templates for Codex planning and Cursor implementation/recheck.
- `automation/policies/automerge-policy.json` defines merge blockers and required evidence.
- `src/harness/phase-runner.ts` can build phase bundles, generate command strings, evaluate merge evidence, and mark phases complete/blocked.
- `PROGRESS.MD` is the living handoff and backlog ledger for agents.

The missing piece is the **execution layer**:

> A runner that actually executes the generated commands, invokes planner/implementation/recheck agents, captures evidence, opens PRs, watches checks, evaluates merge gates, merges, cleans up, updates state, and repeats until all phases are complete.

This spec asks the coder to implement that execution layer in a staged, testable way, then prepare the design for packaging into a reusable framework.

---

## 1. Desired End-to-End Workflow

The final system should support this workflow:

1. User finishes project ideation.
2. User creates or generates:
   - `concept-and-ideas/01_NORTH_STAR_AND_VISION.md`
   - `concept-and-ideas/02_STRUCTURE_AND_TECH_SPECS.md`
   - phase plans under `phase-plans/**`
   - `automation/phase-graph.json`
3. User runs one command:

```bash
pnpm run phase -- autopilot --from PHASE-001 --until-complete --allow-agent-execution --allow-pr --allow-merge
```

4. For each runnable phase, the autopilot:
   1. Loads phase graph, phase state, policy, concept docs, and phase plan.
   2. Creates a phase evidence bundle.
   3. Creates an isolated branch and worktree.
   4. Runs the planning agent in planning mode.
   5. Runs the implementation agent, preferably Cursor Agent CLI / `composer-2.5`.
   6. Runs a second recheck/audit agent pass.
   7. Runs deterministic local validation.
   8. Collects changed paths, command results, logs, gap classifications, secret-scan results, and worktree status.
   9. Creates a PR.
   10. Watches remote checks.
   11. Evaluates the automerge policy.
   12. Merges if and only if the gate allows.
   13. Deletes branch and removes clean worktree.
   14. Marks phase complete or blocked.
   15. Advances to the next phase.
5. The loop stops when:
   - all phases are complete,
   - a phase is blocked,
   - a command fails,
   - an agent cannot be invoked,
   - a merge gate blocks,
   - the user-specified max phase count is reached.

---

## 2. Current-State Diagnosis

### 2.1 Already present

The repo already has:

#### Phase runner core

`src/harness/phase-runner.ts` defines:

- phase graph types
- phase state types
- automerge policy types
- runnable phase metadata
- phase bundle generation
- prompt rendering
- command string generation
- path-scope validation
- automerge decision logic
- phase complete/block state updates

#### Phase runner CLI

`src/harness/phase-runner-cli.ts` supports:

```bash
pnpm run phase -- status
pnpm run phase -- next --from PHASE-13A --parallel 2
pnpm run phase -- bundle --phase PHASE-13A
pnpm run phase -- gate --phase PHASE-13A --evidence <evidence.json>
pnpm run phase -- complete --phase PHASE-13A ...
pnpm run phase -- block --phase PHASE-13A --reason ...
```

This is currently a deterministic planner/gate/state CLI. It does **not** execute the full workflow.

#### Prompt templates

Existing templates:

```text
automation/prompts/codex-plan-mode.md
automation/prompts/cursor-implementation.md
automation/prompts/cursor-recheck.md
```

These already encode the intended agent division of labor:

- Codex plans/orchestrates.
- Cursor/composer implements bounded changes.
- Cursor rechecks/audits implementation.

#### Policy

`automation/policies/automerge-policy.json` defines:

- required local commands
- required preflight
- required artifacts
- merge blockers
- gap policy
- squash merge preference
- branch/worktree cleanup preferences

#### Evidence concept

The README defines the intended evidence directory shape:

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

The implementation should make this evidence model real.

---

## 3. Primary Gap

The current code mostly does this:

```text
read graph/state/policy
generate prompts
generate command strings
evaluate supplied evidence
update state
```

The desired code must do this:

```text
read graph/state/policy
generate prompts
execute commands
invoke agents
capture logs
derive evidence from real command results
create PRs
watch checks
merge safely
clean up
update state
repeat
```

The missing pieces are:

1. Command execution engine.
2. Agent invocation adapters.
3. Git/worktree/branch executor.
4. GitHub PR/check/merge executor.
5. Machine-derived evidence collector.
6. Resume/retry run-state model.
7. One-phase autopilot command.
8. Repeat-until-complete autopilot command.
9. Package-ready config abstraction.

---

## 4. Non-Goals for First Implementation

Do **not** attempt these in the first implementation:

- Do not automate project ideation.
- Do not automatically generate phase plans from concept docs yet.
- Do not rely on external LLM credentials for tests.
- Do not hard-code one Codex CLI syntax if the command is not stable.
- Do not run real Cursor/Codex/GitHub commands in unit tests.
- Do not make parallel phase execution the default.
- Do not delete dirty worktrees.
- Do not merge if evidence is missing or ambiguous.
- Do not commit `.env`, credentials, or generated run evidence unless explicitly allowlisted.

---

## 5. Required Operating Modes

The system must support conservative modes first.

### 5.1 Dry run

```bash
pnpm run phase -- autopilot --phase PHASE-20A --dry-run
```

Expected behavior:

- Build phase bundle.
- Print intended stages.
- Print commands that would run.
- Do not modify git state.
- Do not invoke agents.
- Do not create PR.
- Do not merge.

### 5.2 Deterministic execution only

```bash
pnpm run phase -- autopilot --phase PHASE-20A --execute-deterministic
```

Expected behavior:

- May run:
  - preflight
  - worktree setup
  - local validation
  - changed-path scan
  - secret scan
  - cleanup if safe
- Must not invoke LLM agents.
- Must not create PR or merge unless explicitly allowed.

### 5.3 Agent execution allowed

```bash
pnpm run phase -- autopilot --phase PHASE-20A --allow-agent-execution
```

Expected behavior:

- May invoke configured planning/implementation/recheck agents.
- Must capture logs.
- Must block if agent command exits nonzero.
- Must block if required structured agent report is missing.

### 5.4 PR creation allowed

```bash
pnpm run phase -- autopilot --phase PHASE-20A --allow-agent-execution --allow-pr
```

Expected behavior:

- May create a PR after local validation and evidence collection.
- Must record `pr.json`.

### 5.5 Merge allowed

```bash
pnpm run phase -- autopilot --phase PHASE-20A --allow-agent-execution --allow-pr --allow-merge
```

Expected behavior:

- May merge only after automerge gate returns `allow`.
- Must record `checks.json`, `merge.json`, `cleanup.json`, and `final-decision.json`.

### 5.6 Repeat until complete

```bash
pnpm run phase -- autopilot --from PHASE-20A --until-complete --allow-agent-execution --allow-pr --allow-merge
```

Expected behavior:

- Repeatedly select next runnable phases.
- Default parallelism should be `1` until the executor is stable.
- Stop at first blocked/failed phase unless `--continue-on-blocked` is explicitly supplied.
- Write clear state and evidence for every attempted phase.

---

## 6. Proposed CLI Additions

Extend `pnpm run phase -- ...` with these commands.

### 6.1 Execute one stage

```bash
pnpm run phase -- execute --phase PHASE-20A --stage preflight
pnpm run phase -- execute --phase PHASE-20A --stage setup
pnpm run phase -- execute --phase PHASE-20A --stage planning
pnpm run phase -- execute --phase PHASE-20A --stage implementation
pnpm run phase -- execute --phase PHASE-20A --stage recheck
pnpm run phase -- execute --phase PHASE-20A --stage local-validation
pnpm run phase -- execute --phase PHASE-20A --stage pr
pnpm run phase -- execute --phase PHASE-20A --stage checks
pnpm run phase -- execute --phase PHASE-20A --stage merge
pnpm run phase -- execute --phase PHASE-20A --stage cleanup
```

### 6.2 Run one phase

```bash
pnpm run phase -- autopilot --phase PHASE-20A
```

### 6.3 Run from a phase

```bash
pnpm run phase -- autopilot --from PHASE-20A --until-complete
```

### 6.4 Resume

```bash
pnpm run phase -- resume --phase PHASE-20A --run-id 2026-05-23T120000Z
```

### 6.5 Inspect run

```bash
pnpm run phase -- inspect-run --phase PHASE-20A --run-id 2026-05-23T120000Z
```

---

## 7. Proposed File Additions

Add these files or equivalent modules.

```text
src/harness/phase-autopilot.ts
src/harness/phase-autopilot-cli.ts
src/harness/command-executor.ts
src/harness/agent-adapters.ts
src/harness/git-adapter.ts
src/harness/github-cli-adapter.ts
src/harness/evidence-collector.ts
src/harness/secret-scan.ts
src/harness/run-state.ts
src/harness/agent-report-parser.ts
tests/phase-autopilot.test.ts
tests/command-executor.test.ts
tests/evidence-collector.test.ts
tests/agent-report-parser.test.ts
tests/github-cli-adapter.test.ts
```

Alternatively, put them under:

```text
src/automation/
```

if that better separates automation from harness/game functionality.

---

## 8. Architecture

### 8.1 CommandExecutor

Purpose: run shell commands safely, capture outputs, and return structured results.

```ts
export interface CommandExecutionOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  stdoutPath: string;
  stderrPath: string;
  stdin?: string;
}

export interface CommandExecutionResult {
  command: string;
  cwd: string;
  exitCode: number | null;
  signal?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stdoutPath: string;
  stderrPath: string;
  status: "pass" | "fail" | "timeout";
}

export interface CommandExecutor {
  run(command: string, options: CommandExecutionOptions): Promise<CommandExecutionResult>;
}
```

Implementation requirements:

- Use `node:child_process` with `spawn`.
- Prefer `shell: true` only when necessary.
- Write stdout/stderr to files incrementally.
- Enforce timeout.
- Return nonzero exit codes as structured failures, not uncaught exceptions unless caller requests strict mode.
- Never hide command output.
- Redact secrets from logged environment variables.

### 8.2 AgentAdapter

Purpose: support multiple planning/implementation agents without hard-coding fragile CLI syntax.

```ts
export interface AgentRunInput {
  role: "planner" | "implementer" | "rechecker";
  workspace: string;
  promptPath: string;
  outputPath: string;
  evidenceDir: string;
  timeoutMs?: number;
}

export interface AgentRunResult {
  role: AgentRunInput["role"];
  command: string;
  status: "pass" | "fail" | "blocked" | "not_run";
  outputPath: string;
  commandResult?: CommandExecutionResult;
  parsedReport?: AgentStructuredReport;
}

export interface AgentAdapter {
  run(input: AgentRunInput): Promise<AgentRunResult>;
}
```

Implement at least:

1. `ManualAgentAdapter`
   - Writes instructions.
   - Marks stage as `not_run`.
   - Useful for dry-run/manual mode.

2. `ShellAgentAdapter`
   - Uses a configurable command template.
   - Example implementation agent command template:

```bash
agent --print --trust --model composer-2.5 --workspace "{{WORKSPACE}}" "$(cat "{{PROMPT_PATH}}")"
```

3. Optional `CursorAgentCliAdapter`
   - Thin wrapper over the current `agent --print --trust ...` command.
   - Should be enabled only when `--allow-agent-execution` is passed.

4. Optional `CodexCliAdapter`
   - Do not hard-code this unless the local Codex CLI command is confirmed.
   - Prefer config-driven command template.

### 8.3 GitAdapter

Purpose: handle local git operations.

```ts
export interface GitAdapter {
  fetchOrigin(repoRoot: string): Promise<CommandExecutionResult>;
  createWorktree(input: CreateWorktreeInput): Promise<CommandExecutionResult>;
  changedPaths(worktreePath: string, baseRef: string): Promise<string[]>;
  status(worktreePath: string): Promise<GitStatus>;
  commitIfNeeded(input: CommitInput): Promise<CommitResult>;
  removeWorktree(input: RemoveWorktreeInput): Promise<CommandExecutionResult>;
}
```

Requirements:

- Create worktree from `origin/main` or configured base.
- Block if target worktree path exists and is dirty.
- Record `git status --short --branch`.
- Do not silently delete dirty worktrees.
- Commit if allowed and if there are uncommitted changes.
- If agent created commits already, record them rather than forcing a new commit.
- Use deterministic commit message fallback:

```text
<PHASE_ID>: complete <phase slug>
```

### 8.4 GitHubCliAdapter

Purpose: wrap `gh` commands.

```ts
export interface GitHubCliAdapter {
  createPullRequest(input: CreatePrInput): Promise<PrMetadata>;
  watchChecks(input: WatchChecksInput): Promise<RemoteChecksMetadata>;
  mergePullRequest(input: MergePrInput): Promise<MergeMetadata>;
}
```

Requirements:

- Use `gh pr create --fill --base <base> --head <branch>`.
- Parse PR number and URL.
- Watch checks with timeout.
- Treat failed checks as blocker.
- If no remote checks exist, defer to `allowNoRemoteChecksWhenLocalGatePasses`.
- Use merge method from policy.
- Record raw command outputs.

### 8.5 EvidenceCollector

Purpose: derive `PhaseMergeEvidence` from real artifacts.

Inputs:

- local command results
- agent logs
- structured agent reports
- changed paths
- git status
- secret scan result
- remote check result
- phase acceptance status

Output:

```ts
export interface PhaseMergeEvidence {
  localCommands: CommandEvidence[];
  remoteChecks: "pass" | "fail" | "pending" | "none";
  cursorRecheck: "pass" | "blocked" | "not_run";
  phaseAcceptanceComplete: boolean;
  changedPaths: string[];
  worktreeClean: boolean;
  secretsDetected: boolean;
  blockingGaps: string[];
}
```

Requirements:

- Do not invent command statuses.
- Local command status must come from command exit codes.
- Cursor/recheck status must come from structured report or explicit `PASS/BLOCKED`.
- Phase acceptance should be true only if structured checklist says all required criteria are met.
- Changed paths must be compared against phase `allowedPaths`.
- Worktree cleanliness must come from `git status`.
- Secret detection must inspect changed files and diff content.

### 8.6 RunStateStore

Purpose: allow resume/retry.

Write:

```text
runs/phase-runner/<phase-id>/<run-id>/run-state.json
```

Example:

```json
{
  "schemaVersion": 1,
  "phase": "PHASE-20A",
  "runId": "2026-05-23T120000Z",
  "status": "blocked",
  "currentStage": "recheck",
  "completedStages": ["bundle", "preflight", "setup", "planning", "implementation"],
  "lastError": "Recheck agent returned BLOCKED",
  "startedAt": "2026-05-23T12:00:00.000Z",
  "updatedAt": "2026-05-23T12:13:12.000Z"
}
```

---

## 9. Evidence Directory Contract

Each run must create this structure:

```text
runs/phase-runner/<phase-id>/<run-id>/
  run-state.json
  phase-run-plan.json

  prompts/
    codex-plan-prompt.md
    cursor-implementation-prompt.md
    cursor-recheck-prompt.md

  agent-results/
    codex-plan-result.md
    codex-plan-report.json
    cursor-implementation.log
    cursor-implementation-report.json
    cursor-recheck.log
    cursor-recheck-report.json

  command-results/
    001-preflight-git-status.stdout.log
    001-preflight-git-status.stderr.log
    001-preflight-git-status.json
    ...
    local-validation.json

  git/
    status-before.json
    status-after.json
    changed-paths.json
    diff-summary.txt
    commits.json

  pr.json
  checks.json
  merge.json
  cleanup.json
  phase-merge-evidence.json
  final-decision.json

  progress-snapshot-before.md
  progress-snapshot-after.md
```

The existing `writePhaseRunBundle` can keep writing the top-level files for compatibility, but the new executor should prefer the more structured layout above.

---

## 10. Agent Report Format

Do not rely only on free-form agent text. Update prompts to require a structured JSON report at the end.

### 10.1 Planner report

Planner final response must include:

```json
{
  "schemaVersion": 1,
  "phase": "PHASE-20A",
  "status": "pass",
  "implementationPlan": [
    {
      "id": "task-1",
      "summary": "Implement command executor",
      "allowedPaths": ["src/harness/**", "tests/**"],
      "acceptanceLink": "phase acceptance criterion 1"
    }
  ],
  "risks": [],
  "questions": [],
  "recommendedDecision": null
}
```

If the planner requires a decision:

```json
{
  "schemaVersion": 1,
  "phase": "PHASE-20A",
  "status": "blocked",
  "questions": [
    {
      "id": "q1",
      "question": "Which agent command should be used for Codex CLI?",
      "options": [
        {"id": "a", "label": "Use config-driven command template", "recommended": true},
        {"id": "b", "label": "Hard-code local command", "recommended": false}
      ]
    }
  ],
  "recommendedDecision": "a"
}
```

### 10.2 Implementation report

Implementation final response must include:

```json
{
  "schemaVersion": 1,
  "phase": "PHASE-20A",
  "status": "pass",
  "summary": "Implemented command executor and local validation evidence.",
  "filesChanged": ["src/harness/command-executor.ts", "tests/command-executor.test.ts"],
  "commandsRun": [
    {"command": "pnpm test tests/command-executor.test.ts", "status": "pass"}
  ],
  "acceptance": [
    {"criterion": "Command executor captures stdout/stderr", "status": "met", "evidence": "tests pass"}
  ],
  "gaps": []
}
```

### 10.3 Recheck report

Recheck final response must include:

```json
{
  "schemaVersion": 1,
  "phase": "PHASE-20A",
  "status": "pass",
  "phaseAcceptanceComplete": true,
  "filesChangedDuringRecheck": [],
  "commandsRun": [
    {"command": "pnpm run check", "status": "pass"}
  ],
  "gaps": [
    {
      "severity": "non_blocking",
      "summary": "Package extraction should happen in later phase",
      "recordedInProgress": true
    }
  ],
  "blockingGaps": []
}
```

If blocked:

```json
{
  "schemaVersion": 1,
  "phase": "PHASE-20A",
  "status": "blocked",
  "phaseAcceptanceComplete": false,
  "blockingGaps": [
    "Local validation failed",
    "Changed path outside phase scope"
  ]
}
```

---

## 11. Autopilot Stage Flow

For a single phase:

```text
1. validate graph
2. load state
3. select phase
4. build bundle
5. snapshot PROGRESS.MD before
6. preflight
7. setup worktree
8. planning agent
9. implementation agent
10. recheck agent
11. local validation
12. changed-path scan
13. secret scan
14. commit if needed
15. create PR
16. watch checks
17. build phase-merge-evidence.json
18. evaluate automerge
19. if allow and --allow-merge: merge
20. cleanup branch/worktree
21. snapshot PROGRESS.MD after
22. mark phase complete
```

If any blocker occurs:

```text
1. preserve evidence
2. write final-decision.json
3. mark phase blocked or failed depending on failure class
4. do not delete dirty worktree
5. do not merge
6. stop loop unless explicitly configured otherwise
```

---

## 12. Failure Classification

Use these statuses:

```ts
type AutopilotRunStatus =
  | "not_started"
  | "running"
  | "blocked"
  | "failed"
  | "complete";
```

Difference:

- `blocked`: expected governance block; user or agent can resolve.
- `failed`: infrastructure/tool failure; command crashed, timeout, invalid config, parse failure.

Examples:

| Condition | Status |
|---|---|
| Local validation fails | `blocked` |
| Recheck reports blocking gap | `blocked` |
| Changed path outside allowed scope | `blocked` |
| Secret detected | `blocked` |
| Agent command unavailable | `failed` |
| `gh` unavailable when PR allowed | `failed` |
| Worktree path dirty | `blocked` |
| Merge conflict | `blocked` |
| Invalid phase graph | `failed` |

---

## 13. Safety Requirements

Hard blockers:

1. Local validation fails.
2. Remote PR checks fail.
3. Phase acceptance criteria incomplete.
4. Recheck reports blocking gaps.
5. Changed path outside `allowedPaths`.
6. Secret or credential material detected.
7. `.env` or credential file appears in diff.
8. Worktree dirty after commit.
9. PR merge conflict cannot be mechanically resolved.
10. Required evidence artifact missing.
11. Agent report missing required structured JSON.
12. Decision resolver returns `block`.
13. Phase touches forbidden MVP features.
14. Game/harness protocol invariants break unless phase explicitly allows compatible evolution.

Default-deny flags:

- Do not invoke agents unless `--allow-agent-execution`.
- Do not create PR unless `--allow-pr`.
- Do not merge unless `--allow-merge`.
- Do not delete worktree unless it is clean.
- Do not run with `--parallel > 1` unless explicitly passed.

---

## 14. Tests Required

### 14.1 Command executor tests

Use fake commands only.

Test cases:

- captures stdout
- captures stderr
- returns pass on exit `0`
- returns fail on nonzero exit
- enforces timeout
- writes JSON result files
- handles cwd
- redacts env if env logging exists

### 14.2 Agent adapter tests

Use fake command template.

Test cases:

- substitutes `{{WORKSPACE}}`, `{{PROMPT_PATH}}`, `{{OUTPUT_PATH}}`
- writes log
- parses structured JSON report
- blocks on missing report
- blocks on nonzero exit

### 14.3 Evidence collector tests

Test cases:

- builds passing `PhaseMergeEvidence`
- fails missing local command result
- fails recheck `blocked`
- fails outside allowed path
- fails secret scan
- fails dirty worktree
- handles no remote checks if policy allows
- blocks no remote checks if policy disallows

### 14.4 Git adapter tests

Use a temporary git repo.

Test cases:

- creates worktree
- detects changed paths
- commits allowed changes
- blocks dirty cleanup
- removes clean worktree
- handles branch already exists safely

### 14.5 GitHub adapter tests

Do not call real GitHub in unit tests.

Use fake `gh` command script.

Test cases:

- parse PR URL/number
- record checks pass
- record checks fail
- merge command constructed from policy
- timeout handling

### 14.6 Autopilot tests

Use fake agents and fake commands.

Test cases:

- dry-run creates no side effects
- one phase completes with fake passing agents and commands
- one phase blocks on failed validation
- one phase blocks on outside path
- one phase blocks on recheck
- loop stops after first blocked phase
- resume continues from last completed stage
- state file updates after completion
- evidence directory contains required files

---

## 15. Minimal Implementation Plan

### Phase 1: Deterministic executor foundation

Implement:

- `CommandExecutor`
- run-state file
- stage execution for:
  - `preflight`
  - `setup`
  - `local-validation`
  - `cleanup`
- tests

Do not invoke agents yet.

### Phase 2: Evidence collector

Implement:

- local command result collection
- changed path collection
- secret scan
- worktree clean detection
- `phase-merge-evidence.json`
- tests

### Phase 3: Agent execution

Implement:

- `ShellAgentAdapter`
- configurable command templates
- Cursor implementation/recheck invocation
- structured report parsing
- log capture
- tests with fake agents

### Phase 4: PR execution

Implement:

- `GitHubCliAdapter`
- PR creation
- remote check watch
- merge command
- branch deletion behavior
- tests with fake `gh`

### Phase 5: One-phase autopilot

Implement:

```bash
pnpm run phase -- autopilot --phase <id>
```

It should run one full phase and stop.

### Phase 6: Repeat loop

Implement:

```bash
pnpm run phase -- autopilot --from <id> --until-complete
```

Default parallelism: `1`.

### Phase 7: Packaging preparation

Refactor repo-specific pieces into config and templates.

---

## 16. Packaging Roadmap

After the repo-local loop works, prepare a reusable package.

### 16.1 Candidate package name

```text
agentic-phase-runner
```

### 16.2 Package commands

```bash
agentic init
agentic status
agentic next
agentic bundle --phase PHASE-001
agentic run --phase PHASE-001
agentic run --from PHASE-001 --until-complete
agentic gate --phase PHASE-001
agentic resume --phase PHASE-001 --run-id <id>
```

### 16.3 Project config

Add:

```yaml
agentic.config.yaml
```

Example:

```yaml
project:
  conceptDir: concept-and-ideas
  phasePlanDir: phase-plans
  progressFile: PROGRESS.MD

phase:
  graphPath: automation/phase-graph.json
  statePath: automation/phase-state.json
  policyPath: automation/policies/automerge-policy.json
  promptsDir: automation/prompts

git:
  baseBranch: main
  branchPrefix: phase
  worktreeRoot: ../

agents:
  planner:
    provider: shell
    commandTemplate: 'codex "{{PROMPT_PATH}}"'
    timeoutMs: 1800000
  implementer:
    provider: shell
    commandTemplate: 'agent --print --trust --model composer-2.5 --workspace "{{WORKSPACE}}" "$(cat "{{PROMPT_PATH}}")"'
    timeoutMs: 1800000
  rechecker:
    provider: shell
    commandTemplate: 'agent --print --trust --mode=ask --model composer-2.5 --workspace "{{WORKSPACE}}" "$(cat "{{PROMPT_PATH}}")"'
    timeoutMs: 900000

validation:
  commands:
    - pnpm test
    - pnpm run typecheck
    - pnpm run lint
    - pnpm run build
    - git diff --check

merge:
  enabled: true
  method: squash
  deleteBranchAfterMerge: true
  removeCleanWorktreeAfterMerge: true
```

---

## 17. Acceptance Criteria

The work is complete when:

1. `pnpm run phase -- autopilot --phase <phase> --dry-run` works and creates a clear run plan without side effects.
2. `pnpm run phase -- execute --phase <phase> --stage local-validation` runs configured local validation and writes command evidence.
3. Agent stages can be run with fake agent commands in tests.
4. Cursor implementation/recheck can be run through configurable shell templates when explicitly allowed.
5. PR creation/check/merge can be run through fake `gh` in tests.
6. The system builds `phase-merge-evidence.json` from actual artifacts.
7. `evaluateAutomerge` uses machine-derived evidence.
8. The runner blocks on failed local validation, failed recheck, forbidden changed paths, dirty worktree, missing evidence, or secret scan hits.
9. A one-phase autopilot can complete a fake phase in a temporary test repo.
10. Repeat-until-complete can complete multiple fake phases in order.
11. Real repo tests pass:

```bash
pnpm test
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run check
git diff --check
```

12. Documentation explains how to run:
    - dry-run
    - one phase
    - until complete
    - resume
    - manual fallback
    - packaging roadmap

---

## 18. Coder Prompt

Copy/paste the section below to the implementation agent.

---

# BEGIN CODING AGENT PROMPT

You are a senior TypeScript automation engineer working in this repository.

Your task is to implement the missing execution layer for the repo’s phase-based agentic development system.

## Context

The repo already has:

- `concept-and-ideas/**` for project concept and technical direction.
- `phase-plans/**` for implementation phases.
- `automation/phase-graph.json` for phase dependency graph, allowed paths, parallel groups, and automerge eligibility.
- `automation/phase-state.json` for phase completion/blocking state.
- `automation/prompts/codex-plan-mode.md` for planning-agent prompt generation.
- `automation/prompts/cursor-implementation.md` for implementation-agent prompt generation.
- `automation/prompts/cursor-recheck.md` for second-pass audit/recheck.
- `automation/policies/automerge-policy.json` for merge policy.
- `src/harness/phase-runner.ts` for phase bundle generation, path-scope checks, automerge evaluation, and state updates.
- `src/harness/phase-runner-cli.ts` for current phase runner CLI.
- `PROGRESS.MD` for agent coordination and backlog.

The current implementation generates prompts and command strings, evaluates supplied merge evidence, and updates state. It does not yet execute Codex/Cursor/git/gh commands end-to-end.

## Mission

Build a local-first automated phase loop that can:

1. Select a runnable phase.
2. Build a phase bundle.
3. Create an isolated worktree/branch.
4. Invoke planning/implementation/recheck agents through configurable command templates.
5. Capture logs and structured reports.
6. Run local validation.
7. Collect changed paths, worktree status, secret scan results, and command results.
8. Build `phase-merge-evidence.json` from real evidence.
9. Create a PR when allowed.
10. Watch remote checks.
11. Evaluate automerge policy.
12. Merge when explicitly allowed and safe.
13. Remove clean worktree and delete branch.
14. Mark phase complete or blocked.
15. Repeat until all phases are complete when requested.

## Hard constraints

- Do not run real agent commands in tests.
- Do not run real GitHub commands in tests.
- Do not hard-code fragile Codex CLI syntax.
- Use configurable command templates for planner, implementer, and rechecker agents.
- Default to safe mode:
  - no agent execution unless explicitly allowed
  - no PR unless explicitly allowed
  - no merge unless explicitly allowed
  - no parallel execution unless explicitly requested
- Do not delete dirty worktrees.
- Do not merge if any required evidence is missing.
- Do not merge if local validation fails.
- Do not merge if the recheck agent reports blocking gaps.
- Do not merge if changed paths are outside phase `allowedPaths`.
- Do not merge if secrets or `.env` files are detected.
- Preserve evidence on every block/failure.

## Read first

Before editing, read:

1. `AGENTS.md`
2. `PROGRESS.MD`
3. `automation/README.md`
4. `automation/phase-graph.json`
5. `automation/phase-state.json`
6. `automation/policies/automerge-policy.json`
7. `automation/prompts/codex-plan-mode.md`
8. `automation/prompts/cursor-implementation.md`
9. `automation/prompts/cursor-recheck.md`
10. `src/harness/phase-runner.ts`
11. `src/harness/phase-runner-cli.ts`
12. `tests/phase-runner.test.ts`

## Implementation plan

Implement in stages.

### Stage 1: Command executor

Add a command execution module that uses `node:child_process.spawn`.

It must:

- run commands with cwd/env/timeout
- capture stdout/stderr to files
- return structured command result
- write JSON result artifacts
- handle nonzero exit codes as structured failures
- support tests with fake commands

### Stage 2: Run state

Add run-state tracking under:

```text
runs/phase-runner/<phase-id>/<run-id>/run-state.json
```

It must record:

- phase
- run ID
- current stage
- completed stages
- status
- errors/blockers
- timestamps

### Stage 3: Evidence collector

Add a module that derives `PhaseMergeEvidence` from real artifacts.

It must collect:

- local validation command statuses
- remote check status
- recheck status
- acceptance completion
- changed paths
- worktree cleanliness
- secret detection
- blocking gaps

### Stage 4: Agent adapters

Add configurable shell-based agent adapters.

They must support:

- planner
- implementer
- rechecker

They should use command templates with variables:

```text
{{WORKSPACE}}
{{PROMPT_PATH}}
{{OUTPUT_PATH}}
{{EVIDENCE_DIR}}
{{PHASE_ID}}
```

Do not assume one fixed Codex command.

Cursor implementation may use a template equivalent to:

```bash
agent --print --trust --model composer-2.5 --workspace "{{WORKSPACE}}" "$(cat "{{PROMPT_PATH}}")"
```

Cursor recheck may use:

```bash
agent --print --trust --mode=ask --model composer-2.5 --workspace "{{WORKSPACE}}" "$(cat "{{PROMPT_PATH}}")"
```

### Stage 5: Structured agent reports

Update or extend prompts so agents return structured JSON reports.

Implement parser/validator for:

- planner report
- implementation report
- recheck report

If a required report is missing or invalid, block the phase.

### Stage 6: Git adapter

Add local git automation:

- fetch origin
- create worktree/branch
- get changed paths
- get status
- commit allowed pending changes if needed
- remove clean worktree
- block dirty cleanup

### Stage 7: GitHub CLI adapter

Add `gh` automation behind explicit flags:

- create PR
- watch checks
- merge PR

Use fake `gh` scripts in tests.

### Stage 8: CLI integration

Extend `phase-runner-cli.ts` or add a new CLI entrypoint with:

```bash
pnpm run phase -- execute --phase <id> --stage <stage>
pnpm run phase -- autopilot --phase <id>
pnpm run phase -- autopilot --from <id> --until-complete
pnpm run phase -- resume --phase <id> --run-id <id>
pnpm run phase -- inspect-run --phase <id> --run-id <id>
```

### Stage 9: One-phase autopilot

Implement one-phase autopilot first.

It should:

1. bundle
2. preflight
3. setup worktree
4. run planner if allowed
5. run implementer if allowed
6. run rechecker if allowed
7. run validation
8. collect evidence
9. optionally PR
10. optionally merge
11. cleanup
12. complete/block state

### Stage 10: Repeat loop

Implement repeat-until-complete after one-phase autopilot is stable.

Default:

- `parallel = 1`
- stop on first block/failure

## Required tests

Add tests for:

- command executor
- agent adapter with fake commands
- agent report parser
- evidence collector
- git adapter in temporary git repo
- GitHub adapter with fake `gh`
- one-phase fake autopilot
- repeat-until-complete fake loop
- blocking cases:
  - failed validation
  - missing recheck report
  - blocking recheck gap
  - changed path outside allowed scope
  - secret detection
  - dirty worktree
  - remote checks failed
  - missing PR metadata when merge requested

## Required documentation

Add or update docs explaining:

- dry-run mode
- one-phase autopilot
- until-complete autopilot
- resume
- evidence directory
- agent command templates
- safety flags
- packaging roadmap

## Definition of done

The implementation is done only when:

```bash
pnpm test
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run check
git diff --check
```

all pass, and the new autopilot can be demonstrated in dry-run and fake-agent test mode.

Do not claim that real Codex/Cursor/GitHub automation is fully working unless it has actually been run and evidence is recorded.

# END CODING AGENT PROMPT
