# Agentic Phase Runner Package

This folder packages a reusable, local-first agentic phase-runner workflow. It is meant to be zipped, copied into another repository, initialized there, and adapted through configuration.

## What This Is

The package provides a deterministic TypeScript runner for phase-based agent work:

1. Read phase graph, phase state, config, and policy.
2. Select a runnable phase.
3. Build a phase bundle and evidence directory.
4. Generate planner, executor, delegated-subtask, and recheck prompts.
5. Optionally invoke configured agents.
6. Parse structured reports.
7. Run local validation.
8. Collect changed paths and secret-scan evidence.
9. Evaluate a deterministic merge gate.
10. Optionally create PRs, watch checks, merge, clean up, update state, and resume.
11. Inspect repo readiness, profile target repos, generate deterministic starter plans, and explain blocked runs.

## Problem It Solves

Agentic coding phases often fail because the model self-reports success without durable evidence. This package makes the runner, not the model, responsible for state, evidence, changed-path scope, secret scanning, and gate decisions.

## What It Does Not Do

- It does not publish an npm package.
- It does not make agent execution, PR creation, or merging automatic by default.
- It does not include generated run evidence, secrets, credentials, or local machine paths.
- It does not replace project-specific phase planning.
- It does not perform full autonomous idea-to-product LLM planning yet.
- It does not make restricted-agent delegate internals part of the zip export yet.

## Required Target Repo Structure

```text
concept-and-ideas/
phase-plans/
automation/
  phase-graph.json
  phase-state.json
  autopilot-config.json
  policies/automerge-policy.json
  prompts/
AGENTS.md
CLAUDE.md
PROGRESS.md
```

The default paths can be overridden in `agentic.config.yaml`.

## Quick Start

```bash
pnpm --dir agentic-phase-runner-package install
pnpm --dir agentic-phase-runner-package run build
pnpm --dir agentic-phase-runner-package run test
```

From a target repo after copying this folder:

```bash
pnpm --dir agentic-phase-runner-package exec agentic version
pnpm --dir agentic-phase-runner-package exec agentic init --repo-root .
pnpm --dir agentic-phase-runner-package exec agentic doctor --repo-root .
pnpm --dir agentic-phase-runner-package exec agentic onboard --repo-root . --dry-run
pnpm --dir agentic-phase-runner-package exec agentic boom --repo-root . --idea "Build a local-first note app" --dry-run
pnpm --dir agentic-phase-runner-package exec agentic boom --repo-root . --idea "Build a local-first note app" --apply --force
pnpm --dir agentic-phase-runner-package exec agentic plan --repo-root . --idea "Build a local-first note app" --dry-run
pnpm --dir agentic-phase-runner-package exec agentic plan --repo-root . --idea "Build a local-first note app" --apply --force
pnpm --dir agentic-phase-runner-package exec agentic status --repo-root .
pnpm --dir agentic-phase-runner-package exec agentic next --repo-root . --from PHASE-01A
pnpm --dir agentic-phase-runner-package exec agentic bundle --repo-root . --phase PHASE-01A
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --mode manual --dry-run
pnpm --dir agentic-phase-runner-package exec agentic inspect --repo-root . --latest
pnpm --dir agentic-phase-runner-package exec agentic why-blocked --repo-root . --latest
pnpm --dir agentic-phase-runner-package exec agentic report --repo-root . --latest --output .agentic/reports/latest-run.md
```

If the package is added as a workspace package or `file:` dependency, the shorter `pnpm exec agentic ...` form can be used instead.

## First 10 Minutes

```bash
pnpm --dir agentic-phase-runner-package run build
pnpm --dir agentic-phase-runner-package exec agentic version
pnpm --dir agentic-phase-runner-package exec agentic doctor --repo-root .
pnpm --dir agentic-phase-runner-package exec agentic boom --repo-root . --idea "Build X" --dry-run
pnpm --dir agentic-phase-runner-package exec agentic boom --repo-root . --idea "Build X" --apply
pnpm --dir agentic-phase-runner-package exec agentic inspect --repo-root .
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --mode manual --dry-run
```

For a fresh repo, run `agentic init` before `boom --apply` if you want the default operating files and prompt templates installed first. For an existing repo, start with `doctor` and `onboard`, then use `boom --dry-run` to review proposed files before writing anything.

## Install And Distribution UX

This package still works as a zip-ready folder, but it now also includes a scaffold copier:

```bash
pnpm --dir agentic-phase-runner-package run build
pnpm --dir agentic-phase-runner-package exec create-agentic-runner --target /path/to/repo --dry-run
pnpm --dir agentic-phase-runner-package exec create-agentic-runner --target /path/to/repo --apply
```

`create-agentic-runner` copies the package folder into another repo while excluding `node_modules/`, `dist/`, `coverage/`, generated `runs/`, logs, and `.env*` files. It does not initialize that target repo; run `agentic init` inside the copied package afterward.

## Initialize A Future Repo

```bash
pnpm --dir agentic-phase-runner-package exec agentic init --repo-root .
```

This copies generic `AGENTS.md`, `CLAUDE.md`, `PROGRESS.md`, concept docs, phase-plan templates, automation JSON, policies, and prompt templates. Existing files are not overwritten unless `--force` is passed.

## Toward Plug-And-Boom Workflow

The next usability layer is:

```text
doctor -> onboard -> boom/plan -> inspect -> run supervised -> why-blocked -> resume
```

Example commands:

```bash
pnpm --dir agentic-phase-runner-package exec agentic doctor --repo-root .
pnpm --dir agentic-phase-runner-package exec agentic onboard --repo-root . --dry-run
pnpm --dir agentic-phase-runner-package exec agentic boom --repo-root . --idea "Build a local-first knowledge app" --dry-run
pnpm --dir agentic-phase-runner-package exec agentic boom --repo-root . --idea "Build a local-first knowledge app" --apply
pnpm --dir agentic-phase-runner-package exec agentic plan --repo-root . --idea "Build a local-first knowledge app" --dry-run
pnpm --dir agentic-phase-runner-package exec agentic plan --repo-root . --idea "Build a local-first knowledge app" --apply --force
pnpm --dir agentic-phase-runner-package exec agentic inspect --repo-root .
pnpm --dir agentic-phase-runner-package exec agentic why-blocked --repo-root . --latest
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --mode manual --dry-run
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --mode supervised --agents shell
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --from PHASE-01A --until-complete --mode supervised
```

`plan --idea` is deterministic starter planning, not full LLM planning. It uses the idea, repo profile, and package templates to propose concept docs, starter phases, graph/state, and conservative policy. It will not overwrite existing files unless `--force` is passed.

`boom` is a safe macro over `doctor`, `onboard`, and deterministic starter planning. `boom --dry-run` writes nothing inside the target repo. `boom --apply` writes starter files plus `.agentic/boom-runs/**` and `.agentic/plan-runs/**` reports, but it does not run agents, create PRs, or merge.

If `agentic init` already created placeholder concept, graph, state, or policy files, `plan --apply` reports those files as skipped. Use `--force` only before editing those placeholders, or merge the proposed content manually.

No real agent execution occurs unless explicitly enabled. `auto` mode still obeys deterministic gates; it does not bypass validation.

## North-Star Workflow

The intended mental model is:

```text
doctor -> onboard -> boom/plan -> inspect -> run supervised -> why-blocked -> resume
```

`boom` and `plan --idea` are deterministic starter planning commands. Full LLM planning remains future work. Deterministic gates remain the authority for phase completion, PR, and merge decisions.

## Doctor And Onboard

```bash
pnpm --dir agentic-phase-runner-package exec agentic doctor --repo-root .
pnpm --dir agentic-phase-runner-package exec agentic onboard --repo-root . --dry-run
pnpm --dir agentic-phase-runner-package exec agentic onboard --repo-root . --output .agentic/repo-profile.json
```

`doctor` emits JSON health checks for repo/git status, workflow files, graph/state/policy/config consistency, prompt templates, validation command configuration, and relevant optional tools. It does not execute validation commands or arbitrary agent commands.

`onboard` emits a deterministic repo profile: package manager, languages, frameworks, source/test/docs dirs, package scripts, validation candidates, and risk indicators. It detects `.env*` filenames but never reads their contents. Relative `--output` paths are resolved against `--repo-root`.

## Create Phase Plans

Use `phase-plans/PHASE-TEMPLATE.md`. Each phase should define goal, scope, allowed paths, forbidden paths, tasks, acceptance criteria, required validation, risks, and out-of-scope work. Add the phase to `automation/phase-graph.json` and `automation/phase-state.json`.

## Dry-Run Mode

```bash
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --dry-run
```

Dry-run writes a run plan and prompts under `runs/phase-runner/<phase>/<run-id>/` without creating branches, invoking agents, opening PRs, merging, or deleting worktrees.

## Run One Phase

```bash
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --allow-agent-execution
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --mode supervised
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --mode supervised --agents shell
```

Agent execution remains off unless `--allow-agent-execution` is passed. PR creation and merge still require separate `--allow-pr` and `--allow-merge` flags.

Run mode aliases are:

- `--mode manual`: no agent execution, no PR, no merge, manual approval.
- `--mode supervised`: agent execution allowed, no PR, no merge, manual approval.
- `--mode auto`: agent execution, PR, and merge flags enabled, still gated deterministically.

Use `--agents manual` or `--agents shell` to choose all planner/executor/rechecker adapters together. Explicit `--planner-agent`, `--executor-agent`, and `--rechecker-agent` flags override `--agents`. The practical supervised shell-agent form is:

```bash
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --mode supervised --agents shell
```

## Run Until Complete

```bash
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --from PHASE-01A --until-complete
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --from PHASE-01A --until-complete --mode supervised
```

The default parallelism is conservative. The runner stops on blocked or failed phases unless `--continue-on-blocked` is supplied.

## Configure Agent Command Templates

Use provider presets for common starting points:

```bash
pnpm --dir agentic-phase-runner-package exec agentic presets
pnpm --dir agentic-phase-runner-package exec agentic configure-agent --repo-root . --preset manual --dry-run
pnpm --dir agentic-phase-runner-package exec agentic configure-agent --repo-root . --preset codex --apply
pnpm --dir agentic-phase-runner-package exec agentic configure-agent --repo-root . --preset cursor --apply
pnpm --dir agentic-phase-runner-package exec agentic configure-agent --repo-root . --preset mixed-codex-cursor --apply
```

Presets update only the `agents` section of `automation/autopilot-config.json`, preserving git, preflight, bootstrap, executor, and restricted-delegate config. `claude-code` is a placeholder preset and must be reviewed locally before use. `fake-shell-test` is for package tests only.

You can also edit `automation/autopilot-config.json` or `agentic.config.yaml` directly. Templates can use:

- `{{WORKSPACE}}`
- `{{PROMPT_PATH}}`
- `{{OUTPUT_PATH}}`
- `{{EVIDENCE_DIR}}`
- `{{PHASE_ID}}`

Use `provider: "manual"` for safe default behavior. Use `provider: "shell"` only when the command is approved for the target repo.

Preflight commands are config-driven through `preflightCommands`. The default template only checks `git status --short --branch`; add agent-specific checks such as CLI discovery only when that agent is required in the target repo.

The practical supervised shell-agent flow is:

```bash
pnpm --dir agentic-phase-runner-package exec agentic configure-agent --repo-root . --preset codex --apply
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --mode supervised --agents shell
```

`--preset codex` on `agentic run` is a convenience selector for shell adapters, but it does not rewrite config. Run `configure-agent` first to install command templates.

## AGENTS, CLAUDE, And PROGRESS

`AGENTS.md` and `CLAUDE.md` define operating rules for coding agents. `PROGRESS.md` is a live coordination file: current phase, task queue, checklist, validation log, and deferred backlog. It is not design truth.

## Deterministic Gate

`agentic gate` evaluates `phase-merge-evidence.json` against `automation/policies/automerge-policy.json`. It blocks on failed required commands, failed remote checks, incomplete acceptance, blocked recheck, changed paths outside `allowedPaths`, dirty worktrees, secret hits, and blocking gaps.

```bash
pnpm --dir agentic-phase-runner-package exec agentic gate --repo-root . --phase PHASE-01A --evidence runs/phase-runner/PHASE-01A/<run-id>/phase-merge-evidence.json
```

`--evidence` accepts either the direct `phase-merge-evidence.json` file or the containing run evidence directory.

## Evidence

Run evidence is written under:

```text
runs/phase-runner/<PHASE_ID>/<run-id>/
```

It includes run state, prompts, accepted plan, agent results, command logs, git evidence, secret scan results, merge evidence, and final decisions.

Inspect evidence without manually opening JSON files:

```bash
pnpm --dir agentic-phase-runner-package exec agentic inspect --repo-root .
pnpm --dir agentic-phase-runner-package exec agentic inspect --repo-root . --phase PHASE-01A --latest
pnpm --dir agentic-phase-runner-package exec agentic why-blocked --repo-root . --phase PHASE-01A --latest
pnpm --dir agentic-phase-runner-package exec agentic report --repo-root . --latest
pnpm --dir agentic-phase-runner-package exec agentic report --repo-root . --latest --output .agentic/reports/latest-run.md
```

`inspect` summarizes phase state, next runnable phases, and latest run evidence. `why-blocked` maps known final-decision, local validation, changed-path, recheck, and secret-scan blockers to suggested actions.

`report` creates a Markdown run report with summary, changed evidence, validation, blockers, next actions, and paths to evidence files. It includes evidence paths, not full command logs or secret material.

## Migration And Schema Drift

Use `migrate` when `doctor` reports fixable config drift:

```bash
pnpm --dir agentic-phase-runner-package exec agentic migrate --repo-root . --dry-run
pnpm --dir agentic-phase-runner-package exec agentic migrate --repo-root . --apply
```

The current migration layer only applies conservative repairs: missing `preflightCommands`, missing phase-state entries from the graph, invalid `currentPhase`, and safe automerge-policy defaults. It does not rewrite arbitrary files.

## Clean Repo Workflow

1. Copy or scaffold the package.
2. Run `agentic init --repo-root .`.
3. Run `agentic boom --repo-root . --idea "Build X" --dry-run`.
4. Apply starter files after review.
5. Run `agentic run --repo-root . --phase PHASE-01A --mode manual --dry-run`.
6. Configure a provider preset only after command templates are reviewed.

## Existing Repo Workflow

1. Run `agentic doctor --repo-root .`.
2. Run `agentic onboard --repo-root . --dry-run`.
3. Run `agentic migrate --repo-root . --dry-run` if doctor recommends it.
4. Run `agentic boom --repo-root . --idea "Build X" --dry-run`.
5. Apply without `--force` first so existing files are skipped.
6. Merge proposed starter content manually where the repo already has authored docs/config.

## Supervised Agent Workflow

```bash
pnpm --dir agentic-phase-runner-package exec agentic configure-agent --repo-root . --preset codex --dry-run
pnpm --dir agentic-phase-runner-package exec agentic configure-agent --repo-root . --preset codex --apply
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --mode supervised --agents shell
```

Supervised mode can run configured shell commands. It does not create PRs or merge. `auto` mode still obeys deterministic gates and should be reserved for target repos with validated policy, checks, and rollback practices.

## Fake-Agent Test Workflow

The package test suite includes `fake-shell-test`, a local-only preset that invokes fixture scripts under `tests/fixtures/fake-agents/`. It proves the planner/executor/rechecker shell path can run, parse reports, write evidence, and reach deterministic gate behavior without calling real agents.

```bash
pnpm --dir agentic-phase-runner-package exec vitest run tests/fake-agent-supervised.test.ts
```

Do not use `fake-shell-test` for real implementation work.

## Security Model

Doctor performs lightweight command-safety checks over configured validation, preflight, and shell-agent templates. It blocks obvious destructive patterns such as `rm -rf /`, `git reset --hard`, `git push --force`, and pipe-to-shell install commands, and warns on commands that require review. This is not a full shell parser; treat it as a guardrail, not a sandbox.

## Resume

```bash
pnpm --dir agentic-phase-runner-package exec agentic resume --repo-root . --phase PHASE-01A --run-id <run-id>
```

Resume reads `run-state.json` and continues from the next stage. It does not bypass gates.

## How To Zip This Package

```bash
zip -r agentic-phase-runner-package.zip agentic-phase-runner-package \
  -x "agentic-phase-runner-package/node_modules/*" \
  -x "agentic-phase-runner-package/dist/*" \
  -x "agentic-phase-runner-package/.turbo/*"
```

## Safety Constraints

- No agent execution unless explicitly allowed.
- No PR creation unless explicitly allowed.
- No merge unless explicitly allowed.
- No worktree deletion unless clean.
- No phase completion unless evidence passes.
- No package-level access to secrets.

## Known Limitations

- This is a private zip-ready extraction, not a published package.
- The restricted-agent delegate stage is intentionally disabled/not implemented in the packaged export.
- YAML config parsing is minimal and intended for simple key/value path overrides.
- Full real-agent and GitHub flows must be validated in the target repo before production use.

## Migration Notes From Current Repo Implementation

The package was adapted from an existing local phase runner. Repo-specific domain concepts, current phase IDs, generated evidence, PR numbers, commit hashes, run IDs, and local machine paths were removed or templated. The reusable workflow and deterministic safety model were preserved.
