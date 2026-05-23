# PHASE-23B - Current State Docs Refresh

## Purpose

Refresh public-facing and coordination documentation so it describes the implemented repository instead of the Phase 01A scaffold.

## Source Context

Derived from `docs/NORTH_STAR_GAP_AUDIT.md`, README, `docs/NORTH_STAR.md`, `docs/RULES.md`, `package.json`, implemented source/tests under `src/**` and `tests/**`, generated evidence under `runs/**`, and automation metadata through PHASE-23A.

## Target Outcome

New contributors and agents can understand the current Dungeon Forge system from README and docs without being misled by scaffold-era wording.

## In Scope

- Update README current status, command list, architecture summary, and evidence overview.
- Refresh `docs/NORTH_STAR.md` from scaffold mirror to current system summary while preserving the original North Star.
- Refresh `docs/RULES.md` from scaffold mirror to current invariants, implemented interfaces, and validation expectations.
- Update package metadata description if still scaffold-specific.
- Keep docs consistent with existing local scripts and generated evidence.

## Out Of Scope

- Changing source behavior.
- Renaming commands or package scripts.
- Reworking all feature docs.
- Editing concept docs as a replacement for current-state docs.
- Changing phase automation behavior.

## Technical Spec

Dependencies: `PHASE-23A`.

Use the live repo as the source of truth. README and docs should clearly distinguish:

- Product vision and invariants.
- Implemented game/harness/automation capabilities.
- Optional credential-gated LLM paths.
- Generated evidence and static viewing surfaces.
- Known next roadmap phases.

Avoid promising future browser UI, deeper evaluation, or longitudinal proof as already complete.

## Deliverables

- Updated `README.md`.
- Updated `docs/NORTH_STAR.md`.
- Updated `docs/RULES.md`.
- Updated `package.json` description if needed.
- `PROGRESS.MD` validation log entry with the exact files reviewed and checks run.

## Tests And Validation

- `git diff --check`
- `pnpm run typecheck`
- `pnpm run lint`

Run broader checks only if package scripts or source files change.

## Acceptance Criteria

- README no longer says no TypeScript scaffold or `package.json` exists.
- `docs/NORTH_STAR.md` no longer labels itself as a Phase 01A scaffold mirror.
- `docs/RULES.md` no longer says the repository slice is scaffold-only.
- Package metadata no longer describes the project as Phase 01A scaffold if changed.
- Docs remain consistent with finite, text/ASCII-first, structured-action, trace-backed invariants.

## AI Coder Handoff Notes

This is a documentation refresh, not a feature phase. Do not change runtime commands to make the docs easier to write; document what exists.
