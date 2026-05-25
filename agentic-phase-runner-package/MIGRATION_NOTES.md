# Migration Notes

## Use In A New Repo

1. Copy or unzip `agentic-phase-runner-package/`.
2. Install dependencies in the package folder.
3. Run `pnpm exec agentic init`.
4. Edit `concept-and-ideas/**`.
5. Write phase plans in `phase-plans/**`.
6. Configure validation commands in `automation/phase-graph.json` and `automation/policies/automerge-policy.json`.
7. Run a dry-run.
8. Run one phase with explicit authority flags only when ready.

## Command Mapping

| Old | New |
|---|---|
| `pnpm run phase -- status` | `pnpm exec agentic status` |
| `pnpm run phase -- next --from PHASE-01A` | `pnpm exec agentic next --from PHASE-01A` |
| `pnpm run phase -- bundle --phase PHASE-01A` | `pnpm exec agentic bundle --phase PHASE-01A` |
| `pnpm run phase -- autopilot --phase PHASE-01A --dry-run` | `pnpm exec agentic run --phase PHASE-01A --dry-run` |
| `pnpm run phase -- resume --phase PHASE-01A --run-id <run-id>` | `pnpm exec agentic resume --phase PHASE-01A --run-id <run-id>` |
| `pnpm run phase -- gate --phase PHASE-01A --evidence <path>` | `pnpm exec agentic gate --phase PHASE-01A --evidence <path>` |

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
