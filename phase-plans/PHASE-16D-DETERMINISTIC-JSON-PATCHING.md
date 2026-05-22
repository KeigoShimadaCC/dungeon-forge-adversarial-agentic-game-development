# PHASE-16D - Deterministic JSON Patching

## Purpose

Add bounded automatic JSON patching for safe local artifacts after proposals have been validated.

## Source Context

Derived from future-layer guidance in `02_STRUCTURE_AND_TECH_SPECS.md`, structured proposals in `PHASE-15A`, loop coordination in `PHASE-15C`, and global invariants in `PHASE-00A`.

## Target Outcome

The system can apply validated JSON patches to approved local data surfaces with dry-run output, audit logs, and rollback-friendly evidence, without allowing arbitrary source-code mutation.

## In Scope

- JSON patch schema for approved local artifacts such as content, prompts, scenario packs, or metadata.
- Dry-run and explicit-apply modes.
- Validation against allowed paths, forbidden features, schemas, and proposal evidence.
- Patch application log and before/after summary.

## Out Of Scope

- Automatic TypeScript source-code patching.
- Applying reviewer output directly without validation.
- Self-merging or self-accepting changes.
- Patches that introduce infinite play, unstructured commands, required media, or external-service gameplay.

## Technical Spec

Dependencies: all `PHASE-15*` phases.

Patches must be deterministic, local-file based, and constrained to an allowlist. The default mode should be dry-run. Explicit apply mode must leave enough evidence for a human or auditor to understand what changed and why.

## Deliverables

- JSON patch schema and validator.
- Dry-run/apply command or module.
- Patch application report format.
- Tests for valid, invalid, forbidden, dry-run, and explicit-apply cases.

## Tests And Validation

- Valid patch applies only to allowlisted JSON or Markdown-like artifacts.
- Invalid path, schema failure, or forbidden feature blocks application.
- Dry-run produces no file changes.
- Applied patch records before/after summary and links back to proposal evidence.

## Acceptance Criteria

- Automatic JSON patching is available only inside explicit bounded surfaces.
- Human governance and acceptance gates remain authoritative.
- The feature cannot mutate game state directly during play.

## AI Coder Handoff Notes

Do not implement broad code-mod automation here. Keep patching deterministic, local, auditable, and reversible.

Preserve finite, turn-based, text/ASCII, seeded, structured-action gameplay and trace-backed review evidence.
