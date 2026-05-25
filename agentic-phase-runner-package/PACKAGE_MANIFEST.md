# Package Manifest

| Source | Destination | Status | Notes |
|---|---|---|---|
| `src/harness/phase-runner.ts` | `src/core/phase-runner.ts` | adapted | imports retained locally; generic worktree naming; prompt filenames support generic aliases |
| `src/harness/phase-autopilot.ts` | `src/core/phase-autopilot.ts` | adapted | imports rewritten; restricted-agent internals excluded with explicit not-implemented blocker |
| `src/harness/run-state.ts` | `src/core/run-state.ts` | copied | run-state schema and stage order preserved |
| `src/harness/command-executor.ts` | `src/adapters/command-executor.ts` | adapted | imports rewritten |
| `src/harness/agent-adapters.ts` | `src/adapters/agent-adapters.ts` | adapted | imports rewritten |
| `src/harness/git-adapter.ts` | `src/adapters/git-adapter.ts` | adapted | imports rewritten; tracked plus untracked path behavior preserved |
| `src/harness/github-cli-adapter.ts` | `src/adapters/github-cli-adapter.ts` | adapted | imports rewritten |
| `src/harness/evidence-collector.ts` | `src/evidence/evidence-collector.ts` | adapted | imports rewritten |
| `src/harness/secret-scan.ts` | `src/evidence/secret-scan.ts` | copied | forbidden path and diff secret scanning preserved |
| `src/harness/agent-report-parser.ts` | `src/evidence/agent-report-parser.ts` | copied | structured report parser preserved |
| `src/harness/plan-acceptance.ts` | `src/core/plan-acceptance.ts` | adapted | imports rewritten |
| `automation/prompts/*` | `templates/automation/prompts/*` | templated | project-specific wording removed |
| `automation/*.json` | `templates/automation/*.json` | templated | generic phase and conservative defaults |
| `automation/policies/automerge-policy.json` | `templates/automation/policies/automerge-policy.json` | templated | automerge disabled by default |
| `AGENTS.md`, `CLAUDE.md`, `PROGRESS.MD` | `templates/repo-files/*` | templated | generic and tool-neutral where appropriate |
| package-local usage docs | `QUICKSTART.md`, `FOLDER_OVERVIEW.md` | added | quick usage guide and non-README folder overview |

## Known TODOs

- Restricted-agent delegate internals are excluded from the packaged export. The stage writes evidence and blocks clearly if enabled.
- Real end-to-end agent, PR, merge, and cleanup flows must be validated in each target repository before granting authority flags.
- YAML config support is intentionally minimal.

## Excluded

- `runs/**` — generated evidence
- `.env*` — secrets
- repo-specific phase evidence
- local worktree paths
- existing lockfiles outside the package
- current PR numbers, commit hashes, run IDs, and private local paths
- source-repo-specific application code, content, and tests
