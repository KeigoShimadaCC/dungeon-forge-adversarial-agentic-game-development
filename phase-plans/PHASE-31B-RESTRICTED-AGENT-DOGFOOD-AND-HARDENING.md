# PHASE-31B - Restricted Agent Dogfood And Hardening

## Purpose

Dogfood the restricted API coding agent on low-risk tasks, record failure modes, and harden the operating rules before broader use.

## Source Context

Derived from `PHASE-31A`, restricted-agent evidence from prior phases, autopilot safety policy, patch reports, check-runner evidence, and observed dry-run or supervised-run behavior.

## Target Outcome

The repo has documented operating rules, failure-mode evidence, targeted hardening fixes, and a clear statement that the restricted agent has no merge authority by default.

## In Scope

- Fake/dry-run dogfood path.
- One real low-risk supervised run if credentials and user approval are available; otherwise document why it was skipped.
- Failure-mode log.
- Targeted hardening for observed schema, context, patch, check, or evidence gaps.
- Documentation updates for recommended use.

## Out Of Scope

- Broad autonomous operation.
- Unsupervised commits or merges.
- High-risk source rewrites.
- Changing gameplay behavior unless the selected supervised task explicitly allows it.
- Required real credentials or external network access in CI.

## Technical Spec

Dependencies: `PHASE-31A`.

Use a small, low-risk target such as documentation, prompt text, or a narrow test fixture. The dogfood path must preserve all normal gates and record whether the run was fake, dry-run, or real supervised. If real provider execution is unavailable, the phase can pass with fake/dry-run evidence plus documented blocker.

Any hardening changes must be directly tied to observed failure evidence. Do not expand the agent's authority during hardening.

Allowed paths for this phase:

- `src/harness/restricted-agent/**`
- `tests/restricted-agent*.test.ts`
- `docs/**`
- `automation/**`
- `phase-plans/**`
- `PROGRESS.MD`

## Deliverables

- Dogfood evidence or documented blocker.
- Failure-mode log.
- Targeted fixes for observed restricted-agent gaps.
- Updated recommended operating rules.
- Tests for any hardening changes.

## Tests And Validation

- Focused tests for hardening changes.
- Restricted-agent dry-run or fake dogfood smoke.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `pnpm run build`
- `git diff --check`

## Acceptance Criteria

- At least one fake/dry-run dogfood path is recorded.
- One real low-risk supervised run is completed if appropriate, or skipped with a concrete blocker.
- No merge authority is granted by default.
- Failure modes and recommended operating rules are documented.
- Real repo validation commands pass.

## AI Coder Handoff Notes

Do not treat dogfooding as permission to broaden capabilities. The purpose is to learn where the harness should be stricter.

