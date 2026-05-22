# Developer Workflow

Human-governed handoff from reviewer evidence to a bounded coding-agent task. The harness generates markdown artifacts; it does not apply patches, commit, merge, or open pull requests.

## Command

```bash
pnpm run developer-task -- --help
```

Required flags: `--review`, `--scorecard`, `--target-version`, `--scope`, at least one `--allowed`, and at least one `--proposed`.

Optional flags:

- `--runs-root` — runs directory (default: current working directory)
- `--repo-root` — repository root used for repo-relative artifact paths in the task (default: current working directory)
- `--write` — write `runs/<version>/developer_task.md`
- `--write-templates` — also write `patch_plan.md` and `changelog.md` for the target version
- `--validate-only` — print categorized validation diagnostics without generating markdown
- `--forbidden`, `--test-command`, `--expected-summary`

## Artifact paths

When the runs root is inside the repository, `developer_task.md` lists repo-relative paths such as `runs/v002/patch_plan.md`. When the runs root is outside the repository, paths are relative to the runs root (for example `runs/v002/changelog.md` under a temp directory).

## Validation diagnostics

Validation collects every issue before failing. Categories:

- `blocker` — must be fixed before generating a task
- `forbidden` — global and scoped forbidden rules (always listed so they are visible before implementation)
- `allowed` / `proposed` — scoped-list guidance
- `warning` — non-blocking scope risks

Use `--validate-only` to inspect diagnostics without writing files. Valid handoffs still print the visible forbidden-rule diagnostics before implementation.

## Governance

- `autonomous_patch_execution` remains forbidden.
- Protocol-breaking allowed or proposed changes are blockers.
- Harness validation and trace evidence remain authoritative after implementation.
