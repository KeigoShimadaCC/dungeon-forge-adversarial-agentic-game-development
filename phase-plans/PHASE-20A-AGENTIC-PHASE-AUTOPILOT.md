# PHASE-20A - Agentic Phase Autopilot

## Purpose

Implement the execution layer for the existing phase-runner automation so a phase can be dry-run, executed, evidenced, gated, resumed, and optionally carried through PR/merge/cleanup under explicit safety flags.

## Source Context

Derived from `phase-plans/agentic_phase_autopilot_spec_and_coder_prompt.md`, `automation/README.md`, `automation/phase-graph.json`, `automation/phase-state.json`, `automation/policies/automerge-policy.json`, and the existing `src/harness/phase-runner.ts` deterministic planning/gating core.

## Target Outcome

The repo has a local-first autopilot command that turns the current generated phase bundle model into a separated Planner Codex -> deterministic plan acceptance -> Executor Codex -> bounded Cursor subtasks -> recheck -> validation/merge gate workflow, while keeping destructive or external actions default-denied.

## In Scope

- Command execution with structured stdout/stderr/result artifacts.
- Run-state tracking and resume/inspect support under `runs/phase-runner/<phase-id>/<run-id>/`.
- Configurable planner, implementer, and rechecker agent adapters.
- Explicit Planner Codex, Executor Codex, Cursor subtask, and recheck roles.
- Deterministic plan acceptance gate and accepted-plan artifacts.
- Structured agent report parsing and validation.
- Local git worktree/status/diff/commit/cleanup helpers.
- GitHub CLI PR/check/merge helpers behind explicit flags.
- Evidence collection that builds `PhaseMergeEvidence` from real artifacts.
- One-phase and repeat-until-complete autopilot CLI paths.
- Documentation for dry-run, execution modes, safety flags, evidence, resume, and package-readiness.

## Out Of Scope

- Automatically generating phase plans from concept docs.
- Running real agent or GitHub commands in unit tests.
- Requiring external LLM credentials for tests or local validation.
- Making parallel phase execution the default.
- Deleting dirty worktrees.
- Merging with missing or ambiguous evidence.
- Packaging a separate reusable npm package in this phase.

## Technical Spec

Dependencies: `PHASE-19C`.

Extend the existing `pnpm run phase -- ...` interface with:

- `autopilot --phase <id> --dry-run`
- `execute --phase <id> --stage <stage>`
- `autopilot --phase <id>`
- `autopilot --from <id> --until-complete`
- `resume --phase <id> --run-id <id>`
- `inspect-run --phase <id> --run-id <id>`
- `--plan-approval auto|manual|disabled`
- `--planner-agent shell|manual`
- `--executor-agent shell|manual`
- `--rechecker-agent shell|manual`
- command-template overrides for planner, executor, and rechecker.

Default-deny behavior:

- Do not invoke agents unless `--allow-agent-execution`.
- Do not create PRs unless `--allow-pr`.
- Do not merge unless `--allow-merge`.
- Do not remove worktrees unless clean.
- Do not run more than one phase unless explicitly requested by `--until-complete`.

The runner must use the existing phase graph, phase state, prompt templates, and automerge policy. It must derive merge evidence from actual command results, changed paths, agent reports, recheck status, worktree status, secret scan results, and remote check metadata.

The runner must not permit the shortened loop where Codex reads the phase plan and directly asks Cursor to implement. Executor Codex can run only after `accepted-plan/accepted-plan.json` exists, and Cursor prompts can be generated only for accepted-plan task IDs.

## Deliverables

- Autopilot and execution modules under `src/harness/**`.
- CLI integration through `src/harness/phase-runner-cli.ts` or a delegated module.
- Non-secret autopilot configuration under `automation/`.
- Updated agent prompt requirements for structured JSON reports.
- New prompt templates: `automation/prompts/codex-planner.md`, `codex-executor.md`, `cursor-subtask.md`, and `recheck.md`.
- Focused tests for command execution, agent adapters, report parsing, evidence collection, git/GitHub wrappers, and autopilot blocking paths.
- Documentation for running and resuming the autopilot safely.

## Tests And Validation

- `pnpm test`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`
- `pnpm run check`
- `git diff --check`
- Dry-run smoke for `pnpm run phase -- autopilot --phase PHASE-20A --dry-run`.
- Fake-agent/fake-GitHub tests must prove no real external agent or GitHub command is required in unit tests.

## Acceptance Criteria

- Dry-run prints and writes a clear phase run plan without modifying git state, invoking agents, creating PRs, or merging.
- Stage execution can run deterministic stages and write command/run-state evidence.
- Agent stages can run through configurable fake command templates in tests and block on missing/invalid reports.
- Plan acceptance blocks invalid planner reports before execution.
- Executor stage blocks when accepted-plan artifacts are missing.
- Cursor subtask prompts include accepted-plan task IDs and allowed paths.
- The runner builds `phase-merge-evidence.json` from actual artifacts and feeds it into `evaluateAutomerge`.
- The runner blocks on failed local validation, failed/blocked recheck, forbidden changed paths, dirty worktree, missing evidence, failed remote checks, or secret hits.
- One-phase autopilot and repeat-until-complete work against fake phases in tests.
- Real repo validation commands pass.

## AI Coder Handoff Notes

Preserve the current deterministic phase-runner API where possible and add the executor as a layer around it. Do not hard-code unstable Codex CLI syntax. Cursor/composer-2.5 should be represented as a configurable shell adapter and only invoked when explicitly allowed.

Do not treat agent reports as proof without machine evidence. Keep generated run evidence under ignored `runs/**`; commit only source, docs, config, and tests.
