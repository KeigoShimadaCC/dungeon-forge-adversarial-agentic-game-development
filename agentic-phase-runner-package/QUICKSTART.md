# Quickstart

This guide shows the shortest safe path for using `agentic-phase-runner-package/` in a future repository.

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

## 4. Edit Project Intent

Fill in:

- `concept-and-ideas/01_NORTH_STAR_AND_VISION.md`
- `concept-and-ideas/02_STRUCTURE_AND_TECH_SPECS.md`
- `concept-and-ideas/03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`

These files explain what the target project is trying to build. The runner reads them into phase bundles, but they are not generated evidence.

## 5. Create A Phase Plan

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

## 6. Check Status

```bash
pnpm --dir agentic-phase-runner-package exec agentic status --repo-root .
```

This validates the graph and state files, then shows queued, blocked, failed, complete, and next-runnable phases.

## 7. Preview The Next Phase

```bash
pnpm --dir agentic-phase-runner-package exec agentic next --repo-root . --from PHASE-01A
```

Use this before running anything. It shows what the runner believes is eligible.

## 8. Build A Phase Bundle

```bash
pnpm --dir agentic-phase-runner-package exec agentic bundle --repo-root . --phase PHASE-01A
```

The bundle collects the phase plan, concept docs, progress file, configured prompts, and runner metadata. This is useful for inspection before agent execution.

## 9. Run A Dry Run First

```bash
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --dry-run
```

Dry-run mode writes prompts and run state but does not:

- invoke agents
- create PRs
- merge branches
- delete worktrees
- mark a phase complete

## 10. Configure Agent Commands

Edit:

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

## 11. Run One Phase With Explicit Authority

```bash
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --phase PHASE-01A --allow-agent-execution
```

This allows configured agent execution only. PR creation and merge still require separate flags:

```bash
--allow-pr
--allow-merge
```

## 12. Evaluate A Gate

```bash
pnpm --dir agentic-phase-runner-package exec agentic gate --repo-root . --phase PHASE-01A --evidence runs/phase-runner/PHASE-01A/<run-id>
```

The deterministic gate checks command results, changed paths, secret scan output, acceptance evidence, recheck status, dirty worktree state, and merge policy.

## 13. Resume A Run

```bash
pnpm --dir agentic-phase-runner-package exec agentic resume --repo-root . --phase PHASE-01A --run-id <run-id>
```

Resume reads `run-state.json` and continues from the next safe stage. It does not bypass failed gates.

## 14. Run Until Complete

```bash
pnpm --dir agentic-phase-runner-package exec agentic run --repo-root . --from PHASE-01A --until-complete
```

Use this only after one-phase runs are working reliably. Defaults remain conservative, and the runner stops on blocked or failed phases unless explicitly configured otherwise.

## 15. Zip The Package

From the source repo root:

```bash
zip -r agentic-phase-runner-package.zip agentic-phase-runner-package \
  -x "agentic-phase-runner-package/node_modules/*" \
  -x "agentic-phase-runner-package/dist/*" \
  -x "agentic-phase-runner-package/.turbo/*"
```

Do not include `.env*`, credentials, generated run evidence, or private local paths in the zip.
