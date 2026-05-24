# PHASE-30B - Restricted Patch Applier And Rollback

## Purpose

Apply validated restricted-agent patches in a worktree with dry-run previews, rollback evidence, before/after hashes, and failure-safe behavior.

## Source Context

Derived from `PHASE-30A`, deterministic JSON patch dry-run/apply behavior in `PHASE-16D`, worktree orchestration in `PHASE-15B`, and autopilot evidence conventions.

## Target Outcome

The harness can apply only a prevalidated normalized patch plan, write clear patch evidence, and leave files unchanged when validation or application fails.

## In Scope

- Dry-run preview that computes intended changes without writing target files.
- Apply mode for validated normalized patch plans.
- Before/after SHA-256 hashes and byte summaries.
- Rollback copies for changed files.
- Patch report and diagnostics.
- Atomic-enough failure handling for the small v1 patch set.

## Out Of Scope

- Applying unvalidated model output.
- Patching outside worktree context.
- Git commit, branch, PR, merge, or cleanup authority.
- Deletes, renames, dependency changes, lockfile changes, generated evidence edits, or package installation.
- Rollback command that automatically mutates files after the fact.

## Technical Spec

Dependencies: `PHASE-30A`.

The applier must accept only normalized validated patch plans, not raw model responses. Dry-run is the default and must not write target files. Apply mode writes rollback copies under the evidence directory before writing changed files.

If any operation cannot be applied as validated, the phase must record a blocked report and leave target files unchanged. The implementation should group operations by file and apply them deterministically.

Allowed paths for this phase:

- `src/harness/restricted-agent/**`
- `tests/restricted-agent-patch-applier.test.ts`
- `docs/RESTRICTED-API-CODING-AGENT.md`
- `phase-plans/**`
- `PROGRESS.MD`

## Deliverables

- Restricted patch applier.
- Dry-run preview report.
- Rollback evidence writer.
- Patch report format.
- Tests for dry-run, apply, rollback evidence, and failed-apply behavior.

## Tests And Validation

- Focused patch-applier tests.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `git diff --check`

## Acceptance Criteria

- Dry-run writes no target files.
- Apply writes expected files only.
- Rollback artifacts exist for changed files.
- Before/after hashes are recorded.
- Failed apply leaves files unchanged.
- Raw model output cannot bypass validation.

## AI Coder Handoff Notes

Keep apply behavior boring and deterministic. Do not add broad source transformation or formatter behavior.

