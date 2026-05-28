# Migration Notes

## Use In A New Repo

1. Copy or unzip `agentic-phase-runner-package/`.
2. Install dependencies in the package folder.
3. Run `pnpm exec agentic version`.
4. Run `pnpm exec agentic init`.
5. Run `pnpm exec agentic doctor --repo-root .`.
6. Run `pnpm exec agentic onboard --repo-root . --dry-run`.
7. Run `pnpm exec agentic migrate --repo-root . --dry-run` if doctor recommends it.
8. Run `pnpm exec agentic boom --repo-root . --idea "..." --dry-run`.
9. Run `pnpm exec agentic boom --repo-root . --idea "..." --apply` after review if only unedited init placeholders exist.
10. Run `pnpm exec agentic inspect --repo-root .`.
11. Edit `concept-and-ideas/**`.
12. Refine phase plans in `phase-plans/**`.
13. Configure validation commands in `automation/phase-graph.json` and `automation/policies/automerge-policy.json`.
14. Configure agent providers with `pnpm exec agentic configure-agent --repo-root . --preset manual --dry-run`.
15. Run a dry-run.
16. Run one phase with explicit authority flags only when ready.

You can also scaffold the folder into another repo from an existing built copy:

```bash
pnpm --dir agentic-phase-runner-package exec create-agentic-runner --target /path/to/repo --dry-run
pnpm --dir agentic-phase-runner-package exec create-agentic-runner --target /path/to/repo --apply
```

## Command Mapping

| Old | New |
|---|---|
| no direct old equivalent | `pnpm exec agentic version` |
| `pnpm run phase -- status` | `pnpm exec agentic status` |
| no direct old equivalent | `pnpm exec agentic doctor --repo-root .` |
| no direct old equivalent | `pnpm exec agentic onboard --repo-root . --dry-run` |
| no direct old equivalent | `pnpm exec agentic presets` |
| no direct old equivalent | `pnpm exec agentic configure-agent --repo-root . --preset codex --dry-run` |
| no direct old equivalent | `pnpm exec agentic migrate --repo-root . --dry-run` |
| no direct old equivalent | `pnpm exec agentic plan --repo-root . --idea "..." --dry-run` |
| no direct old equivalent | `pnpm exec agentic boom --repo-root . --idea "..." --dry-run` |
| no direct old equivalent | `pnpm exec agentic boom --repo-root . --idea "..." --apply` |
| no direct old equivalent | `pnpm exec agentic inspect --repo-root . --latest` |
| no direct old equivalent | `pnpm exec agentic why-blocked --repo-root . --latest` |
| no direct old equivalent | `pnpm exec agentic report --repo-root . --latest --output .agentic/reports/latest-run.md` |
| replace init placeholders with generated starter plan | `pnpm exec agentic plan --repo-root . --idea "..." --apply --force` |
| `pnpm run phase -- next --from PHASE-01A` | `pnpm exec agentic next --from PHASE-01A` |
| `pnpm run phase -- bundle --phase PHASE-01A` | `pnpm exec agentic bundle --phase PHASE-01A` |
| `pnpm run phase -- autopilot --phase PHASE-01A --dry-run` | `pnpm exec agentic run --phase PHASE-01A --dry-run` |
| manual autopilot flags | `pnpm exec agentic run --phase PHASE-01A --mode manual --dry-run` |
| agent execution only | `pnpm exec agentic run --phase PHASE-01A --mode supervised --agents shell` |
| `pnpm run phase -- resume --phase PHASE-01A --run-id <run-id>` | `pnpm exec agentic resume --phase PHASE-01A --run-id <run-id>` |
| `pnpm run phase -- gate --phase PHASE-01A --evidence <path>` | `pnpm exec agentic gate --phase PHASE-01A --evidence <path>` |

## North-Star Workflow

The migration path is now:

```text
doctor -> onboard -> boom/plan -> inspect -> run supervised -> why-blocked -> resume
```

`boom` is the first-run macro over doctor, onboarding, and deterministic starter planning. `boom` does not execute agents, create PRs, or merge. `plan --idea` is deterministic starter planning. It does not invoke an LLM or claim full autonomous planning. `auto` mode enables agent, PR, and merge authority flags, but deterministic validation and merge gates still decide whether release actions can proceed.

When migrating a repo that already has edited concept docs, phase graph/state, or merge policy, run `plan --apply` without `--force` first. The command reports skipped files so you can merge proposals manually instead of overwriting user-authored workflow files.

## Provider Presets

`configure-agent` updates only the configured autopilot config's `agents` section. It preserves git, preflight, bootstrap, command executor, and restricted-delegate settings.

```bash
pnpm exec agentic presets
pnpm exec agentic configure-agent --repo-root . --preset manual --dry-run
pnpm exec agentic configure-agent --repo-root . --preset codex --apply
pnpm exec agentic run --repo-root . --phase PHASE-01A --mode supervised --agents shell
```

Presets are not guarantees that a provider CLI is installed or authenticated. Review shell command templates locally before enabling supervised execution.

## Migration And Schema Drift

`agentic migrate` currently repairs only safe missing defaults:

- `preflightCommands`
- missing phase IDs in phase state
- invalid or missing `currentPhase`
- conservative automerge-policy defaults

It does not rewrite arbitrary project configuration. Run `--dry-run` first, then `--apply` if the proposed actions are acceptable.

## Evidence Reports

Use `agentic report` after a dry-run, blocked run, or completed run to produce a single Markdown summary:

```bash
pnpm exec agentic report --repo-root . --latest
pnpm exec agentic report --repo-root . --latest --output .agentic/reports/latest-run.md
```

The report links to evidence files and summarizes blockers without embedding full logs or secret contents.

## Security Model Changes

Doctor now includes command-safety checks for configured validation, preflight, and shell-agent command templates. The checks catch obvious destructive patterns and warn on commands that need human review, but they are not a shell sandbox.

## Config Path Migration

Old:

```text
automation/phase-graph.json
automation/phase-state.json
automation/autopilot-config.json
automation/policies/automerge-policy.json
```

New default:

```text
same paths
```

New configurable:

```yaml
paths:
  graphPath: automation/phase-graph.json
  statePath: automation/phase-state.json
  policyPath: automation/policies/automerge-policy.json
  promptsDir: automation/prompts
  autopilotConfigPath: automation/autopilot-config.json
```
