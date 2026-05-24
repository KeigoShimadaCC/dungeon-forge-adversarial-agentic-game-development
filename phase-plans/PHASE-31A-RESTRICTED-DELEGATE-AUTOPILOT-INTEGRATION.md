# PHASE-31A - Restricted Delegate Autopilot Integration

## Purpose

Integrate the restricted API coding agent as an optional implementation delegate inside Automated Agent Mode while preserving deterministic runner authority.

## Source Context

Derived from `PHASE-30C`, `PHASE-20A` through `PHASE-22A` autopilot architecture, `automation/README.md`, `automation/autopilot-config.json`, `agent-adapters`, accepted-plan task handling, Cursor subtask handling, and automerge policy gates.

## Target Outcome

Executor Codex can delegate an accepted-plan task to the restricted agent as an alternative to Cursor subtasks. The restricted agent can propose and apply validated patches, but cannot bypass recheck, local validation, changed-path scans, secret scans, local/final gates, PR policy, merge policy, or phase-state authority.

## In Scope

- Autopilot config option for restricted-agent delegate mode.
- Accepted-plan task selection for restricted-agent delegation.
- Restricted-agent evidence integration under phase-runner evidence directories.
- Optional Cursor subtask alternative mode.
- Fake end-to-end autopilot test using restricted delegate.
- Documentation of when to use restricted delegate versus Cursor.

## Out Of Scope

- Making restricted delegate default for all phases.
- Removing Cursor support.
- Giving the model direct shell, git, PR, merge, package-install, or phase-state authority.
- Real external LLM calls in tests.
- Bypassing Executor Codex or recheck.

## Technical Spec

Dependencies: `PHASE-30C`.

The restricted delegate stage must run only for accepted-plan task IDs. It must receive task objective, allowed paths, forbidden paths, patch budget, and command IDs from deterministic phase/autopilot metadata.

The stage must write structured evidence and return a report compatible with existing phase evidence collection. Any blocked restricted-agent result blocks or defers according to existing gap policy; it must not be treated as implementation proof without diff, validation, and recheck evidence.

Allowed paths for this phase:

- `automation/**`
- `src/harness/**`
- `tests/phase-autopilot.test.ts`
- `tests/restricted-agent-autopilot.test.ts`
- `docs/RESTRICTED-API-CODING-AGENT.md`
- `automation/README.md`
- `USING_AUTOMATED_AGENT_MODE.md`
- `package.json`
- `phase-plans/**`
- `PROGRESS.MD`

## Deliverables

- Restricted delegate configuration in automation config.
- Autopilot stage or substage for restricted-agent task execution.
- Evidence integration for restricted-agent reports.
- Fake end-to-end test proving planner -> accepted plan -> restricted delegate -> recheck -> gates.
- Documentation updates.

## Tests And Validation

- Focused restricted-agent autopilot tests.
- Existing phase-autopilot regression tests.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `pnpm run build`
- `git diff --check`

## Acceptance Criteria

- Restricted agent cannot run without an accepted-plan task.
- Restricted agent cannot bypass local/final gates.
- Fake end-to-end autopilot works with restricted delegate.
- Cursor remains optional and supported.
- Recheck and deterministic evidence remain authoritative.

## AI Coder Handoff Notes

Integrate as an optional delegate, not a new release controller. Preserve default-deny safety flags.

