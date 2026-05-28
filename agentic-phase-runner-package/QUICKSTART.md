# Quickstart

This guide shows the shortest safe path for using `agentic-phase-runner-package/` in a future repository.

## Use This In A Repo

This is the practical first-run path when you have a repository and want to turn it into an agentic phase-runner repo.

### 1. Put The Package In Your Repo

Your target repo should contain the package folder at the repo root:

```text
my-repo/
  agentic-phase-runner-package/
```

If you already have a built copy of the package somewhere else, you can scaffold-copy it:

```bash
pnpm --dir agentic-phase-runner-package run build
pnpm --dir agentic-phase-runner-package exec create-agentic-runner --target /path/to/my-repo --dry-run
pnpm --dir agentic-phase-runner-package exec create-agentic-runner --target /path/to/my-repo --apply
```

### 2. Install And Build

From the target repo root:

```bash
pnpm --dir agentic-phase-runner-package install
pnpm --dir agentic-phase-runner-package run build
pnpm --dir agentic-phase-runner-package exec agentic version
```

### 3. Initialize Workflow Files

```bash
pnpm --dir agentic-phase-runner-package exec agentic init --repo-root .
```

This creates the default operating files, concept docs, phase-plan templates, automation config, policies, and prompts if they are missing. Do not use `--force` unless you intentionally want to overwrite existing workflow files.

### 4. Check And Profile The Repo

```bash
pnpm --dir agentic-phase-runner-package exec agentic doctor --repo-root .
pnpm --dir agentic-phase-runner-package exec agentic onboard --repo-root . --dry-run
```

If `doctor` recommends migration:

```bash
pnpm --dir agentic-phase-runner-package exec agentic migrate --repo-root . --dry-run
pnpm --dir agentic-phase-runner-package exec agentic migrate --repo-root . --apply
```

### 5. Generate A Starter Plan From Your Idea

Dry-run first:

```bash
pnpm --dir agentic-phase-runner-package exec agentic boom --repo-root . \
  --idea "Build a local-first knowledge management app with graph search" \
  --dry-run
```

Then apply after review:

```bash
pnpm --dir agentic-phase-runner-package exec agentic boom --repo-root . \
  --idea "Build a local-first knowledge management app with graph search" \
  --apply
```

If you just ran `init` and want to replace unedited placeholder starter files:

```bash
pnpm --dir agentic-phase-runner-package exec agentic boom --repo-root . \
  --idea "Build a local-first knowledge management app with graph search" \
  --apply --force
```

### 6. Review The Generated Workflow

Before running agents, review and edit:

```text
concept-and-ideas/**
phase-plans/**
automation/phase-graph.json
automation/phase-state.json
automation/policies/automerge-policy.json
automation/autopilot-config.json
PROGRESS.md
```

### 7. Inspect And Dry-Run The First Phase

```bash
pnpm --dir agentic-phase-runner-package exec agentic status --repo-root .
pnpm --dir agentic-phase-runner-package exec agentic next --repo-root . --from PHASE-01A
pnpm --dir agentic-phase-runner-package exec agentic inspect --repo-root .
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . \
  --phase PHASE-01A \
  --mode manual \
  --dry-run
```

Dry-run writes evidence and prompts but does not invoke agents, create PRs, merge, or delete worktrees.

### 8. Optional: Configure Agents

List presets:

```bash
pnpm --dir agentic-phase-runner-package exec agentic presets
```

Preview a provider preset:

```bash
pnpm --dir agentic-phase-runner-package exec agentic configure-agent --repo-root . \
  --preset codex \
  --dry-run
```

Apply only after reviewing the command templates:

```bash
pnpm --dir agentic-phase-runner-package exec agentic configure-agent --repo-root . \
  --preset codex \
  --apply
```

### 9. Run Supervised Execution

```bash
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . \
  --phase PHASE-01A \
  --mode supervised \
  --agents shell
```

Supervised mode may run configured shell agents, but it still does not create PRs or merge.

### 10. Diagnose Or Report A Run

```bash
pnpm --dir agentic-phase-runner-package exec agentic why-blocked --repo-root . --latest
pnpm --dir agentic-phase-runner-package exec agentic report --repo-root . --latest \
  --output .agentic/reports/latest-run.md
```

Resume after fixing blockers:

```bash
pnpm --dir agentic-phase-runner-package exec agentic resume --repo-root . \
  --phase PHASE-01A \
  --run-id <run-id>
```

### Safe Default Command Sequence

```bash
pnpm --dir agentic-phase-runner-package install
pnpm --dir agentic-phase-runner-package run build
pnpm --dir agentic-phase-runner-package exec agentic init --repo-root .
pnpm --dir agentic-phase-runner-package exec agentic doctor --repo-root .
pnpm --dir agentic-phase-runner-package exec agentic onboard --repo-root . --dry-run
pnpm --dir agentic-phase-runner-package exec agentic boom --repo-root . --idea "Build X" --dry-run
pnpm --dir agentic-phase-runner-package exec agentic boom --repo-root . --idea "Build X" --apply --force
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --mode manual --dry-run
```

## 1. Copy The Folder

Copy or unzip `agentic-phase-runner-package/` into the root of the target repository.

```text
target-repo/
  agentic-phase-runner-package/
```

## 2. Install And Build The Runner

From the target repo root:

```bash
pnpm --dir agentic-phase-runner-package install
pnpm --dir agentic-phase-runner-package run build
pnpm --dir agentic-phase-runner-package run test
pnpm --dir agentic-phase-runner-package exec agentic version
```

This installs dependencies only for the package folder and builds the local `agentic` CLI.

## 3. Initialize The Target Repo

```bash
pnpm --dir agentic-phase-runner-package exec agentic init --repo-root .
```

This creates the default workflow files if they do not already exist:

- `AGENTS.md`
- `CLAUDE.md`
- `PROGRESS.md`
- `concept-and-ideas/**`
- `phase-plans/**`
- `automation/**`

Use `--force` only if you intentionally want template files to overwrite existing target-repo files.

## 4. Run Doctor And Onboard

```bash
pnpm --dir agentic-phase-runner-package exec agentic doctor --repo-root .
pnpm --dir agentic-phase-runner-package exec agentic onboard --repo-root . --dry-run
```

`doctor` checks whether the repo has the files, graph/state consistency, prompt templates, validation command configuration, and optional tool readiness needed for phase execution. `onboard` profiles the repo and suggests validation commands and default path scopes without reading secret contents.

If doctor reports config drift:

```bash
pnpm --dir agentic-phase-runner-package exec agentic migrate --repo-root . --dry-run
pnpm --dir agentic-phase-runner-package exec agentic migrate --repo-root . --apply
```

Migrate currently adds only safe missing defaults: preflight commands, missing phase-state entries, valid current phase, and conservative automerge-policy fields.

## 5. Generate Starter Plans From An Idea

```bash
pnpm --dir agentic-phase-runner-package exec agentic boom --repo-root . --idea "Build a local-first note app with graph search" --dry-run
pnpm --dir agentic-phase-runner-package exec agentic boom --repo-root . --idea "Build a local-first note app with graph search" --apply
pnpm --dir agentic-phase-runner-package exec agentic plan --repo-root . --idea "Build a local-first note app with graph search" --dry-run
pnpm --dir agentic-phase-runner-package exec agentic plan --repo-root . --idea "Build a local-first note app with graph search" --apply --force
```

`boom` runs doctor, onboarding, and deterministic starter planning as one first-run macro. It does not execute agents, create PRs, or merge. `plan --idea` is deterministic starter planning, not full LLM planning. It proposes or writes starter concept docs, three implementation phases, phase graph/state, and a conservative merge policy. Existing files are skipped unless `--force` is passed.

Because `agentic init` creates placeholder workflow files, use `--force` only before editing those placeholders. If you have already customized concept docs, graph/state, or policy, run without `--force`, review skipped files in `.agentic/plan-runs/**/plan-application-report.json`, and merge the proposal manually.

## 6. Edit Project Intent

Fill in:

- `concept-and-ideas/01_NORTH_STAR_AND_VISION.md`
- `concept-and-ideas/02_STRUCTURE_AND_TECH_SPECS.md`
- `concept-and-ideas/03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`

These files explain what the target project is trying to build. The runner reads them into phase bundles, but they are not generated evidence.

## 7. Create Or Refine Phase Plans

Start from:

```text
phase-plans/PHASE-TEMPLATE.md
```

Each phase should define:

- goal
- scope
- allowed paths
- forbidden paths
- tasks
- acceptance criteria
- required validation
- risks
- out-of-scope work

Then register the phase in:

```text
automation/phase-graph.json
automation/phase-state.json
```

## 8. Check Status

```bash
pnpm --dir agentic-phase-runner-package exec agentic status --repo-root .
```

This validates the graph and state files, then shows queued, blocked, failed, complete, and next-runnable phases.

## 9. Preview The Next Phase

```bash
pnpm --dir agentic-phase-runner-package exec agentic next --repo-root . --from PHASE-01A
```

Use this before running anything. It shows what the runner believes is eligible.

## 10. Build A Phase Bundle

```bash
pnpm --dir agentic-phase-runner-package exec agentic bundle --repo-root . --phase PHASE-01A
```

The bundle collects the phase plan, concept docs, progress file, configured prompts, and runner metadata. This is useful for inspection before agent execution.

## 11. Run A Dry Run First

```bash
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --mode manual --dry-run
```

Dry-run mode writes prompts and run state but does not:

- invoke agents
- create PRs
- merge branches
- delete worktrees
- mark a phase complete

## 12. Configure Agent Commands

Start with presets:

```bash
pnpm --dir agentic-phase-runner-package exec agentic presets
pnpm --dir agentic-phase-runner-package exec agentic configure-agent --repo-root . --preset manual --dry-run
pnpm --dir agentic-phase-runner-package exec agentic configure-agent --repo-root . --preset codex --apply
```

`configure-agent` updates only the agent command-template section of the configured autopilot config. It preserves git, preflight, bootstrap, executor, and restricted-delegate settings. Presets are local templates; review shell commands before supervised execution.

You can also edit:

```text
automation/autopilot-config.json
```

or override paths in:

```text
agentic.config.yaml
```

Command templates can use:

- `{{WORKSPACE}}`
- `{{PROMPT_PATH}}`
- `{{OUTPUT_PATH}}`
- `{{EVIDENCE_DIR}}`
- `{{PHASE_ID}}`

Keep providers set to `manual` until the target repo has approved shell commands for its agent tooling.

The default `preflightCommands` list only checks Git status. Add tool-specific preflight commands in `automation/autopilot-config.json` only when those tools are required for the target repo.

## 13. Run One Phase With Explicit Authority

```bash
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --allow-agent-execution
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --mode supervised
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --mode supervised --agents shell
```

This allows configured agent execution only. PR creation and merge still require separate flags:

```bash
--allow-pr
--allow-merge
```

Run modes are aliases for common safety profiles:

- `manual`: no agent execution, no PR, no merge.
- `supervised`: agent execution allowed, no PR or merge.
- `auto`: agent execution, PR, and merge flags enabled, still blocked by deterministic gates.

Use `--agents manual` or `--agents shell` to set planner, executor, and rechecker adapters together. Explicit role flags override `--agents`.

After applying a shell preset, the practical supervised form is:

```bash
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --mode supervised --agents shell
```

## 14. Inspect And Explain Evidence

```bash
pnpm --dir agentic-phase-runner-package exec agentic inspect --repo-root .
pnpm --dir agentic-phase-runner-package exec agentic inspect --repo-root . --phase PHASE-01A --latest
pnpm --dir agentic-phase-runner-package exec agentic why-blocked --repo-root . --latest
pnpm --dir agentic-phase-runner-package exec agentic report --repo-root . --latest
pnpm --dir agentic-phase-runner-package exec agentic report --repo-root . --latest --output .agentic/reports/latest-run.md
```

`inspect` summarizes phase state and latest run evidence. `why-blocked` turns known final-decision, local validation, recheck, changed-path, and secret-scan blockers into suggested actions. `report` creates a single Markdown report without embedding full logs or secret material.

## 15. Evaluate A Gate

```bash
pnpm --dir agentic-phase-runner-package exec agentic gate --repo-root . --phase PHASE-01A --evidence runs/phase-runner/PHASE-01A/<run-id>/phase-merge-evidence.json
```

`--evidence` can point to either the `phase-merge-evidence.json` file or the run evidence directory that contains it.

The deterministic gate checks command results, changed paths, secret scan output, acceptance evidence, recheck status, dirty worktree state, and merge policy.

## 16. Resume A Run

```bash
pnpm --dir agentic-phase-runner-package exec agentic resume --repo-root . --phase PHASE-01A --run-id <run-id>
```

Resume reads `run-state.json` and continues from the next safe stage. It does not bypass failed gates.

## 17. Run Until Complete

```bash
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --from PHASE-01A --until-complete
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --from PHASE-01A --until-complete --mode supervised
```

Use this only after one-phase runs are working reliably. Defaults remain conservative, and the runner stops on blocked or failed phases unless explicitly configured otherwise.

## North-Star Workflow

The intended flow is:

```text
doctor -> onboard -> boom/plan -> inspect -> run supervised -> why-blocked -> resume
```

`boom` and `plan --idea` are deterministic starter planning. Full LLM planning remains future work, and deterministic gates remain the authority.

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

## Clean Repo Workflow

Run `init`, then `boom --dry-run`, then `boom --apply` after review. Keep the first run manual and dry-run only.

## Existing Repo Workflow

Run `doctor`, `onboard`, and `migrate --dry-run` before applying generated starter files. Apply without `--force` first so authored files are skipped instead of overwritten.

## Supervised Agent Workflow

```bash
pnpm --dir agentic-phase-runner-package exec agentic configure-agent --repo-root . --preset codex --apply
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --mode supervised --agents shell
```

Supervised mode can invoke configured shell agents. It still does not create PRs or merge.

## Fake-Agent Test Workflow

```bash
pnpm --dir agentic-phase-runner-package exec vitest run tests/fake-agent-supervised.test.ts
```

This uses local fake scripts only. It is a package confidence test, not a real implementation preset.

## Evidence Reports

Use `agentic report --latest --output .agentic/reports/latest-run.md` after blocked or completed runs to get a human-readable summary with evidence file paths.

## Provider Presets

Available presets include `manual`, `codex`, `cursor`, `claude-code`, `mixed-codex-cursor`, and `fake-shell-test`. `claude-code` is a placeholder that must be edited locally; `fake-shell-test` is test-only.

## Security Model

The runner defaults to no agents, no PR, and no merge. Doctor warns or fails on known unsafe command-template patterns, but this is a guardrail rather than a full shell sandbox.

## 18. Zip The Package

From the source repo root:

```bash
zip -r agentic-phase-runner-package.zip agentic-phase-runner-package \
  -x "agentic-phase-runner-package/node_modules/*" \
  -x "agentic-phase-runner-package/dist/*" \
  -x "agentic-phase-runner-package/.turbo/*"
```

Do not include `.env*`, credentials, generated run evidence, or private local paths in the zip.
