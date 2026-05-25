# Migration Notes

## Use In A New Repo

1. Copy or unzip `agentic-phase-runner-package/`.
2. Install dependencies in the package folder.
3. Run `pnpm exec agentic init`.
4. Run `pnpm exec agentic doctor --repo-root .`.
5. Run `pnpm exec agentic onboard --repo-root . --dry-run`.
6. Run `pnpm exec agentic plan --repo-root . --idea "..." --dry-run`.
7. Run `pnpm exec agentic plan --repo-root . --idea "..." --apply --force` after review if only unedited init placeholders exist.
8. Edit `concept-and-ideas/**`.
9. Refine phase plans in `phase-plans/**`.
10. Configure validation commands in `automation/phase-graph.json` and `automation/policies/automerge-policy.json`.
11. Run a dry-run.
12. Run one phase with explicit authority flags only when ready.

## Command Mapping

| Old | New |
|---|---|
| `pnpm run phase -- status` | `pnpm exec agentic status` |
| no direct old equivalent | `pnpm exec agentic doctor --repo-root .` |
| no direct old equivalent | `pnpm exec agentic onboard --repo-root . --dry-run` |
| no direct old equivalent | `pnpm exec agentic plan --repo-root . --idea "..." --dry-run` |
| replace init placeholders with generated starter plan | `pnpm exec agentic plan --repo-root . --idea "..." --apply --force` |
| `pnpm run phase -- next --from PHASE-01A` | `pnpm exec agentic next --from PHASE-01A` |
| `pnpm run phase -- bundle --phase PHASE-01A` | `pnpm exec agentic bundle --phase PHASE-01A` |
| `pnpm run phase -- autopilot --phase PHASE-01A --dry-run` | `pnpm exec agentic run --phase PHASE-01A --dry-run` |
| manual autopilot flags | `pnpm exec agentic run --phase PHASE-01A --mode manual --dry-run` |
| agent execution only | `pnpm exec agentic run --phase PHASE-01A --mode supervised` |
| `pnpm run phase -- resume --phase PHASE-01A --run-id <run-id>` | `pnpm exec agentic resume --phase PHASE-01A --run-id <run-id>` |
| `pnpm run phase -- gate --phase PHASE-01A --evidence <path>` | `pnpm exec agentic gate --phase PHASE-01A --evidence <path>` |

## Toward Plug-And-Boom Workflow

The migration path is now:

```text
doctor -> onboard -> plan -> dry-run -> supervised execution
```

`plan --idea` is deterministic starter planning. It does not invoke an LLM or claim full autonomous planning. `auto` mode enables agent, PR, and merge authority flags, but deterministic validation and merge gates still decide whether release actions can proceed.

When migrating a repo that already has edited concept docs, phase graph/state, or merge policy, run `plan --apply` without `--force` first. The command reports skipped files so you can merge proposals manually instead of overwriting user-authored workflow files.

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
