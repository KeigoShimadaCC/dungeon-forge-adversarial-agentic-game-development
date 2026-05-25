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

## Problem It Solves

Agentic coding phases often fail because the model self-reports success without durable evidence. This package makes the runner, not the model, responsible for state, evidence, changed-path scope, secret scanning, and gate decisions.

## What It Does Not Do

- It does not publish an npm package.
- It does not make agent execution, PR creation, or merging automatic by default.
- It does not include generated run evidence, secrets, credentials, or local machine paths.
- It does not replace project-specific phase planning.
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
pnpm --dir agentic-phase-runner-package exec agentic init --repo-root .
pnpm --dir agentic-phase-runner-package exec agentic status --repo-root .
pnpm --dir agentic-phase-runner-package exec agentic next --repo-root . --from PHASE-01A
pnpm --dir agentic-phase-runner-package exec agentic bundle --repo-root . --phase PHASE-01A
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --dry-run
```

If the package is added as a workspace package or `file:` dependency, the shorter `pnpm exec agentic ...` form can be used instead.

## Initialize A Future Repo

```bash
pnpm --dir agentic-phase-runner-package exec agentic init --repo-root .
```

This copies generic `AGENTS.md`, `CLAUDE.md`, `PROGRESS.md`, concept docs, phase-plan templates, automation JSON, policies, and prompt templates. Existing files are not overwritten unless `--force` is passed.

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
```

Agent execution remains off unless `--allow-agent-execution` is passed. PR creation and merge still require separate `--allow-pr` and `--allow-merge` flags.

## Run Until Complete

```bash
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --from PHASE-01A --until-complete
```

The default parallelism is conservative. The runner stops on blocked or failed phases unless `--continue-on-blocked` is supplied.

## Configure Agent Command Templates

Edit `automation/autopilot-config.json` or `agentic.config.yaml`. Templates can use:

- `{{WORKSPACE}}`
- `{{PROMPT_PATH}}`
- `{{OUTPUT_PATH}}`
- `{{EVIDENCE_DIR}}`
- `{{PHASE_ID}}`

Use `provider: "manual"` for safe default behavior. Use `provider: "shell"` only when the command is approved for the target repo.

Preflight commands are config-driven through `preflightCommands`. The default template only checks `git status --short --branch`; add agent-specific checks such as CLI discovery only when that agent is required in the target repo.

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
