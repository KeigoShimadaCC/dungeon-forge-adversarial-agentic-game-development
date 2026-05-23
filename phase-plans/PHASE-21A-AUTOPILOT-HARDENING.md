# PHASE-21A - Autopilot Hardening

## Purpose

Harden the Phase 20A autopilot so it is safe to use with real agent, PR, and merge flags under explicit user approval.

## Source Context

Derived from the Phase 20A implementation, the follow-up architecture review, `automation/policies/automerge-policy.json`, `automation/autopilot-config.json`, and the existing autopilot modules under `src/harness/**`.

## Target Outcome

The autopilot preserves the separated Planner Codex -> plan acceptance -> Executor Codex -> bounded Cursor subtasks -> Recheck -> validation/PR/merge/cleanup architecture, but adds stronger local safety gates, merge-result enforcement, deterministic Cursor subtask handling, stall/retry handling, diff-aware secret scanning, deeper plan acceptance, and full fake end-to-end tests.

## In Scope

- Enforce merge success before cleanup or phase completion.
- Verify remote PR state when `gh pr merge` fails locally.
- Move local safety evidence before PR creation.
- Add pre-PR local gate and post-check final gate.
- Keep Git command telemetry under the phase evidence directory, not inside the worktree.
- Add deterministic Cursor subtask handling from accepted-plan task IDs.
- Add command inactivity timeout and retry support for agent stages.
- Scan changed paths and diff text for secrets.
- Strengthen plan acceptance against actual phase acceptance criteria.
- Add full fake end-to-end autopilot tests without real Codex, Cursor, or GitHub calls.

## Out Of Scope

- Changing the core game or harness gameplay protocol.
- Running real Codex, Cursor, or GitHub commands in tests.
- Making `--allow-merge` default.
- Adding parallel phase execution.
- Packaging the autopilot as a reusable external framework.
- Replacing the deterministic runner with an LLM-led policy loop.

## Technical Spec

Dependencies: `PHASE-20A`.

Revise the autopilot stage order to:

```text
bundle
preflight
setup
bootstrap
planning
plan-acceptance
execution
cursor-subtasks
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

The runner must not create a PR until local validation, changed-path scan, secret scan, local evidence, and local gate have passed. The local gate must allow intentional tracked changes inside the phase scope before commit, but must block forbidden paths, secret hits, failed validation, missing recheck, incomplete phase acceptance, and unresolved blocking gaps.

The runner must not mark a phase complete when merge fails. If `gh pr merge` fails locally, the runner must query remote PR state and treat the merge as successful only when the remote PR is actually merged. Otherwise, it must write blocker evidence and leave the phase blocked.

All Git command stdout/stderr/result JSON must be written under:

```text
runs/phase-runner/<phase-id>/<run-id>/command-results/
```

No `.phase-runner-*` telemetry files may be created inside the worktree.

Cursor subtasks must be deterministic. The runner must read `accepted-plan/accepted-plan.json`, find tasks with `cursorDelegation.recommended === true`, generate `cursor-tasks/task-NNN-prompt.md`, run or instruct the configured Cursor subtask adapter, and validate a matching `CursorSubtaskReport` before recheck/final evidence can pass.

Agent command execution must support total timeout, inactivity timeout, retry count, per-attempt logs, and distinct stall classification.

Plan acceptance must parse the phase plan's `## Acceptance Criteria` section and require planner task coverage for every criterion. It must avoid false positives for safe constraint language such as "do not edit `.env`", while still blocking plans that require secrets, credential files, external services, forbidden MVP features, or out-of-scope paths.

## Deliverables

- Hardened autopilot stage order and gates in `src/harness/phase-autopilot.ts`.
- GitHub merge verification in `src/harness/github-cli-adapter.ts`.
- Evidence-dir Git telemetry and diff-text support in `src/harness/git-adapter.ts`.
- Inactivity timeout and retry support in `src/harness/command-executor.ts` and agent adapters.
- Diff-aware secret scanning in `src/harness/secret-scan.ts`.
- Stronger plan acceptance in `src/harness/plan-acceptance.ts`.
- Deterministic Cursor subtask stage and report validation.
- Updated docs, config, and prompts for the hardened workflow.
- Focused and fake end-to-end tests proving safety gates and failure behavior.

## Tests And Validation

- `pnpm test tests/phase-autopilot.test.ts tests/phase-runner.test.ts`
- `pnpm test`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run build`
- `pnpm run check`
- `git diff --check`
- Dry-run smoke for `pnpm run phase -- autopilot --phase PHASE-21A --dry-run --run-id phase21a-hardening-smoke` after the phase is wired into the graph.

## Acceptance Criteria

- Failed `gh pr merge` cannot mark a phase complete unless remote PR verification proves the PR is merged.
- PR creation is blocked when local validation, changed-path scope, secret scan, recheck, or local evidence gate fails.
- Git status, changed-path, diff, commit, and rev-parse telemetry does not dirty the worktree.
- Cursor delegated tasks run only from accepted-plan task IDs and require matching `CursorSubtaskReport` evidence.
- Agent stages classify total timeout, inactivity timeout, retry attempts, and missing reports distinctly.
- Secret scan detects both forbidden credential paths and secret-like values in ordinary source-file diffs.
- Plan acceptance covers every parsed phase acceptance criterion and avoids blocking safe constraint language.
- A full fake one-phase autopilot test proves planner -> accepted plan -> executor -> optional Cursor -> recheck -> validation -> PR/check/merge -> phase complete without real external tools.
- Real repo validation commands pass.

## AI Coder Handoff Notes

Implement this as a hardening pass on top of Phase 20A. Preserve the deterministic runner as the policy authority. Keep all real agent, PR, and merge behavior behind explicit safety flags. Tests must use fake shell commands or fake adapters, never real Codex, Cursor, or GitHub.
