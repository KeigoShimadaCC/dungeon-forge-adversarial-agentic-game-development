# PHASE-22A - Untracked File Autopilot Safety

## Purpose

Close the remaining pre-merge autopilot safety gap where untracked files can be missed by changed-path evidence before `git add -A` commits them.

## Source Context

Derived from the Phase 21A hardening review, the current `src/harness/git-adapter.ts` changed-path implementation, the Phase 21A stage order, and the automerge policy requirement that local evidence must block forbidden paths and secrets before PR creation.

## Target Outcome

The autopilot changed-path and secret evidence includes tracked diffs and untracked newly created files before local gate, commit, PR creation, or merge. Untracked out-of-scope files, credential-like paths, and secret-like content are blocked before `git add -A` can include them.

## In Scope

- Include untracked files in `git.changedPaths()`.
- De-duplicate and sort repo-relative changed paths.
- Include untracked file content in diff/secret evidence where practical.
- Preserve evidence-dir command telemetry.
- Add tests for untracked out-of-scope, credential path, secret content, and in-scope files.
- Wire `PHASE-22A` into phase graph/state/progress.

## Out Of Scope

- Changing the Phase 21A stage order.
- Running real Codex, Cursor, or GitHub commands in tests.
- Changing merge policy defaults.
- Broader secret-scanning vendor integration.
- Replacing Git-based change detection with a new VCS abstraction.

## Technical Spec

Dependencies: `PHASE-21A`.

Update Git change detection so `changedPaths()` combines:

```text
git diff --name-only <baseRef>
git ls-files --others --exclude-standard
```

The returned list must be repo-relative, de-duplicated, sorted, and written to `git/changed-paths.json` by the existing changed-path scan stage.

Update diff/secret evidence so `diffText()` keeps the existing tracked diff and appends readable untracked file content using deterministic labels. Unreadable, missing, directory, or likely binary untracked files may be skipped for content scanning, but their paths must remain in changed-path evidence.

## Deliverables

- `PHASE-22A` phase plan under `phase-plans/`.
- Phase graph/state/progress updates for `PHASE-22A`.
- Hardened untracked-file handling in `src/harness/git-adapter.ts`.
- Tests in `tests/phase-autopilot.test.ts` proving untracked files are included and blocked when unsafe.

## Tests And Validation

- `pnpm test tests/phase-autopilot.test.ts tests/phase-runner.test.ts`
- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm test`
- `pnpm run build`
- `git diff --check`
- `pnpm run phase -- autopilot --phase PHASE-22A --dry-run --run-id phase22a-untracked-hardening-smoke`
- `pnpm run check`

## Acceptance Criteria

- Untracked out-of-scope files block local gate before PR creation.
- Untracked `.env` or credential-like paths block before PR creation.
- Untracked normal in-scope files appear in `git/changed-paths.json`.
- Untracked source files with secret-like content are detected by secret scan.
- No PR is created when an untracked forbidden file exists.
- Existing tracked changed-path behavior remains intact.
- Real repo validation commands pass.

## AI Coder Handoff Notes

Keep this as a narrow safety patch on top of Phase 21A. Do not broaden into new autopilot policy work. The important invariant is that local evidence must see everything `git add -A` would commit before the PR or merge stages can run.
