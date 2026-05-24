# PHASE-30A - Restricted Source Patch Validator

## Purpose

Validate a tiny subset of source/docs patch intents from the restricted agent before any file can be changed.

## Source Context

Derived from `PHASE-29C`, deterministic JSON patching in `PHASE-16D`, structured proposal governance in `PHASE-15A`, secret scanning from `PHASE-22A`, and the requirement that the API model never writes files directly.

## Target Outcome

The harness can accept or block structured patch intents for safe exact-text edits while rejecting broad, ambiguous, destructive, out-of-scope, or secret-like changes.

## In Scope

- Patch kinds: `replace_exact`, `insert_before_exact`, `insert_after_exact`, and `create_file`.
- Validation against allowed paths, forbidden paths, file types, max files, max operations, max bytes, and exact text matches.
- Secret-like content scanning for replacements and created files.
- Blocking diagnostics for generated evidence edits, lockfile/dependency edits, deletes, renames, and unknown operations.
- Safe exact replacement validation.

## Out Of Scope

- Applying patches.
- Whole-file replacement for existing source files.
- Deleting or renaming files.
- Modifying dependencies, package scripts unrelated to the phase, lockfiles, `.env`, credentials, generated evidence, or private files.
- Formatting or codegen.

## Technical Spec

Dependencies: `PHASE-29C`.

The validator must load current target file content from the worktree and verify that exact match anchors exist once and only once unless the patch explicitly allows a stricter deterministic match mode. Create-file operations must fail if the file already exists and must be limited to allowed paths and approved file extensions.

Patch budgets should be small by default and recorded in diagnostics. Validation returns structured diagnostics and a normalized patch plan that later phases can apply without reinterpreting model text.

Allowed paths for this phase:

- `src/harness/restricted-agent/**`
- `src/harness/secret-scan.ts`
- `tests/restricted-agent-patch-validator.test.ts`
- `docs/RESTRICTED-API-CODING-AGENT.md`
- `phase-plans/**`
- `PROGRESS.MD`

## Deliverables

- Restricted source patch validator.
- Normalized patch-plan type.
- Patch diagnostics format.
- Tests for safe and unsafe patches.
- Documentation of supported v1 patch kinds and hard blockers.

## Tests And Validation

- Focused patch-validator tests.
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `git diff --check`

## Acceptance Criteria

- Out-of-scope patch blocks.
- Context mismatch blocks.
- Secret-like content blocks.
- Oversize patch blocks.
- Unknown patch kind blocks.
- Safe exact replacement validates.
- No file is changed by validation.

## AI Coder Handoff Notes

Do not broaden into general code-mod support. The validator should be conservative and easy to audit.

