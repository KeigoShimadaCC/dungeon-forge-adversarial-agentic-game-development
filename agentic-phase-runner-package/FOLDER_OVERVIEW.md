# Folder Overview

`agentic-phase-runner-package/` is a portable copy of a phase-based automation workflow. It is designed to live inside a target repository, initialize that repository with phase-planning templates, and run a conservative local CLI that turns phase plans into auditable implementation runs.

The folder is intentionally self-contained. It includes the TypeScript runner, CLI commands, generic templates, JSON schemas, examples, smoke tests, and package-local docs needed to reuse the workflow in another repo.

## What The Folder Is For

Use this folder when you want a repeatable agentic development loop where a deterministic runner controls:

- which phase is eligible to run
- what files are in scope
- what prompts are generated
- where evidence is written
- which validation commands count
- whether changed paths are allowed
- whether secret scans passed
- whether a PR or merge is permitted
- whether a run can resume safely

The runner is meant to make model output auditable. Agent reports are treated as inputs, not proof.

## What The Folder Is Not

This folder is not:

- an npm-published package
- generated run evidence
- a replacement for project-specific design docs
- a guarantee that agent, PR, or merge automation is safe in every repo
- a place for secrets, `.env` files, credentials, or local private paths

The default behavior is conservative. Agent execution, PR creation, and merging require explicit authority flags and target-repo configuration.

## Main Areas

```text
agentic-phase-runner-package/
  QUICKSTART.md
  FOLDER_OVERVIEW.md
  PACKAGE_MANIFEST.md
  MIGRATION_NOTES.md
  LICENSE_NOTES.md
  package.json
  tsconfig.json
  src/
  templates/
  schemas/
  examples/
  tests/
```

## Source Code

`src/` contains the reusable runner implementation.

- `src/cli/**` implements the `agentic` command.
- `src/core/**` handles graph/state loading, phase selection, bundling, run state, runner flow, autopilot orchestration, doctor checks, repo profiling, and deterministic starter plan generation.
- `src/adapters/**` wraps shell commands, agent command templates, Git, and GitHub CLI behavior.
- `src/evidence/**` collects changed paths, command results, report parsing, and secret scan data.
- `src/config/**` loads default paths and package configuration.

## Templates

`templates/` contains generic files that `agentic init` copies into a target repository.

- `templates/repo-files/**` provides starter `AGENTS.md`, `CLAUDE.md`, and `PROGRESS.md`.
- `templates/concept-and-ideas/**` provides project-intent documents.
- `templates/phase-plans/**` provides phase-plan standards and a phase template.
- `templates/automation/**` provides graph, state, autopilot config, merge policy, and prompt templates.

These templates are intentionally generic. Target repos should edit them before trusting automated phase runs.

## Schemas

`schemas/` documents the JSON shapes used by the runner:

- phase graph
- phase state
- autopilot config
- automerge policy
- agent report
- merge evidence
- run state

The schemas are included for validation, editor support, and future hardening.

## Example Repo

`examples/minimal-target-repo/` is a small target-repo fixture showing the expected layout after initialization.

It is not a real product repo. It exists to make smoke testing and migration easier.

## Tests

`tests/` contains package smoke tests and focused unit tests. These check initialization, doctor, onboarding, deterministic planning, status, next-phase selection, bundling, run modes, and safe CLI behavior without invoking real agents.

Run them with:

```bash
pnpm --dir agentic-phase-runner-package run test
```

## Safety Model

The runner defaults to safe behavior:

- no agent execution unless explicitly allowed
- no PR creation unless explicitly allowed
- no merge unless explicitly allowed
- no worktree deletion unless clean
- no phase completion unless evidence passes
- no package-level access to secrets

Deterministic evidence is the release gate. Model-written reports can help explain what happened, but validation commands, changed paths, secret scan results, and merge policy decide whether a phase is eligible to complete.

## Typical Workflow

1. Copy the folder into a target repo.
2. Install and build the package-local CLI.
3. Run `agentic init`.
4. Run `agentic doctor --repo-root .`.
5. Run `agentic onboard --repo-root . --dry-run`.
6. Run `agentic plan --repo-root . --idea "..." --dry-run`.
7. Apply starter plans after review. Use `--force` only when replacing unedited init placeholders.
8. Fill in or refine concept docs.
9. Run `agentic status`.
10. Build a bundle.
11. Run `agentic run --repo-root . --phase PHASE-01A --mode manual --dry-run`.
12. Enable supervised agent execution only after configuration is reviewed.
13. Run validation and gate checks.
14. Resume or continue only from recorded run state.

See `QUICKSTART.md` for concrete commands.

## Toward Plug-And-Boom Workflow

The folder is moving toward a `doctor -> onboard -> plan -> dry-run -> supervised execution` workflow. The current `plan --idea` command is deterministic starter planning only; it does not call an LLM or claim to produce a complete product roadmap. `auto` mode still relies on deterministic gates before PR or merge actions can proceed.
