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
| usability layer | `src/core/doctor.ts` | added | deterministic repo health checks; no arbitrary command execution |
| usability layer | `src/core/repo-profiler.ts` | added | deterministic onboarding profile and validation candidates |
| usability layer | `src/core/phase-plan-generator.ts` | added | deterministic `plan --idea` starter docs, phases, graph, state, policy, plan quality metadata, stack notes, and plan summary |
| usability layer | `src/core/file-plan.ts` | added | safe apply/skip/force file-plan behavior, skipped-file reporting, application report, and plan-summary writer |
| usability layer | `src/core/boom.ts` | added | safe first-run macro over doctor, onboarding, and starter planning |
| usability layer | `src/core/inspect.ts` | added | deterministic phase-state and run-evidence inspection |
| usability layer | `src/core/blocker-analysis.ts` | added | deterministic blocker-to-suggested-action mapping |
| product hardening | `src/core/version.ts` | added | package and schema capability metadata |
| product hardening | `src/core/agent-presets.ts` | added | manual, Codex, Cursor, Claude placeholder, mixed, and fake-shell-test presets |
| product hardening | `src/core/migrate.ts` | added | conservative schema/default drift detection and repair |
| product hardening | `src/core/report.ts` | added | Markdown run report generation from inspect and blocker evidence |
| product hardening | `src/core/package-installer.ts` | added | filtered package-folder copier for install/scaffold UX |
| product hardening | `src/core/command-safety.ts` | added | deterministic high-risk shell command pattern checks |
| usability layer | `src/cli/commands/doctor.ts` | added | JSON CLI wrapper |
| usability layer | `src/cli/commands/onboard.ts` | added | dry-run and optional output CLI wrapper |
| usability layer | `src/cli/commands/plan.ts` | added | deterministic planning CLI wrapper |
| usability layer | `src/cli/commands/boom.ts` | added | JSON CLI wrapper for first-run macro |
| usability layer | `src/cli/commands/inspect.ts` | added | JSON CLI wrapper for evidence inspection |
| usability layer | `src/cli/commands/why-blocked.ts` | added | JSON CLI wrapper for blocker analysis |
| product hardening | `src/cli/commands/version.ts` | added | `agentic version` wrapper |
| product hardening | `src/cli/commands/presets.ts` | added | `agentic presets` wrapper |
| product hardening | `src/cli/commands/configure-agent.ts` | added | `agentic configure-agent` wrapper |
| product hardening | `src/cli/commands/migrate.ts` | added | `agentic migrate` wrapper |
| product hardening | `src/cli/commands/report.ts` | added | `agentic report` wrapper |
| product hardening | `src/cli/create-agentic-runner.ts` | added | standalone scaffold-copy CLI |
| usability layer | `src/cli/commands/run.ts` | adapted | added `--mode manual|supervised|auto` aliases, mode explanations, and `--agents manual|shell` |
| `automation/prompts/*` | `templates/automation/prompts/*` | templated | project-specific wording removed |
| `automation/*.json` | `templates/automation/*.json` | templated | generic phase and conservative defaults |
| `automation/policies/automerge-policy.json` | `templates/automation/policies/automerge-policy.json` | templated | automerge disabled by default |
| `AGENTS.md`, `CLAUDE.md`, `PROGRESS.MD` | `templates/repo-files/*` | templated | generic and tool-neutral where appropriate |
| package-local usage docs | `QUICKSTART.md`, `FOLDER_OVERVIEW.md` | added | quick usage guide and non-README folder overview |
| CLI smoke coverage | `tests/package-smoke.test.ts` | adapted | adds compiled CLI smoke, new command smoke, run-mode smoke, and custom-path autopilot coverage |
| usability tests | `tests/doctor.test.ts`, `tests/repo-profiler.test.ts`, `tests/phase-plan-generator.test.ts`, `tests/run-modes.test.ts` | added | focused coverage for doctor, onboarding, planning, and run aliases |
| north-star usability tests | `tests/boom.test.ts`, `tests/inspect.test.ts`, `tests/blocker-analysis.test.ts` | added | focused coverage for boom, inspect, and why-blocked behavior |
| product hardening tests | `tests/agent-presets.test.ts`, `tests/migrate.test.ts`, `tests/report.test.ts`, `tests/command-safety.test.ts`, `tests/create-runner.test.ts`, `tests/fake-agent-supervised.test.ts` | added | presets, migration, reporting, command safety, scaffold copying, and fake shell-agent supervised execution |
| fake agent fixtures | `tests/fixtures/fake-agents/*` | added | local test-only planner/executor/rechecker scripts |

## Known TODOs

- Restricted-agent delegate internals are excluded from the packaged export. The stage writes evidence and blocks clearly if enabled.
- Real end-to-end agent, PR, merge, and cleanup flows must be validated in each target repository before granting authority flags.
- YAML config support is intentionally minimal.
- `plan --idea` is deterministic starter planning only; full autonomous LLM planning is not implemented.
- `boom` is an orchestration macro only; it does not execute agents, create PRs, or merge.
- `inspect` and `why-blocked` summarize known package evidence shapes; custom target-repo evidence may need adapters later.
- `create-agentic-runner` is a local folder copier, not a package manager installer.
- Provider presets are command-template starters only; target repos still need local review before supervised shell execution.
- Command-safety checks are deterministic pattern matching, not a full shell parser or sandbox.

## Excluded

- `runs/**` — generated evidence
- `.env*` — secrets
- repo-specific phase evidence
- local worktree paths
- existing lockfiles outside the package
- current PR numbers, commit hashes, run IDs, and private local paths
- source-repo-specific application code, content, and tests
