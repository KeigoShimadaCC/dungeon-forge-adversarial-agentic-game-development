# CLAUDE.md

## North Star

This repo builds an agentic adversarial game-development testbed: a developer agent improves a small finite game, while a reviewer/player agent plays it, critiques trace evidence, and pressures better versions. Preserve bounded autonomy, stable protocol, seeded reproducibility, and measurable improvement.

## Operating Model

- Read `PROGRESS.MD` first for active phase, task queue, checklist state, and validation evidence.
- Read `concept-and-ideas/` for product intent.
- Read `phase-plans/PHASE-00A-PLAN-STANDARDS-AND-GLOBAL-INVARIANTS.md` before implementation.
- Treat the active `phase-plans/PHASE-XX...md` as the task contract.
- Update `PROGRESS.MD` during work: add tasks, tick checklist items, log verification, defer out-of-scope ideas to Future backlog.
- Keep MVP work small: TypeScript, Node.js, pnpm, Vitest, local files, text/ASCII game.
- Do not turn roadmap ideas into current scope unless the active phase says so.

## Source Of Truth

1. `concept-and-ideas/` = product intent.
2. `phase-plans/PHASE-00A...` = global invariants.
3. Active phase file = implementation contract.
4. `PROGRESS.MD` = live coordination (tasks, checklist, evidence, backlog)—not product design.
5. Future `src/game/**` = canonical game rules and `GameEngine`.
6. Future `src/harness/**` = canonical playthrough, trace, scorecard, and acceptance logic.
7. Future `runs/**` = derived evidence, not source design truth.

## Non-Negotiable Rules

- Preserve the stable `GameEngine`: `start`, `getAvailableActions`, `step`, `render`, `isTerminal`.
- Keep gameplay finite, turn-based, text/ASCII-first, seedable, serializable, and structured-action based.
- Terminal states must be explicit: `ACTIVE`, `WIN`, `LOSS`, `ABORTED`.
- Do not add real-time input, required images/audio, infinite main mode, arbitrary free-text actions, or external API dependency during gameplay.
- Reviewer critique must be based on actual playthrough traces.
- The harness validates versions; do not accept developer-agent self-report as proof.
- Implement only the active phase scope unless the user explicitly expands it.
- Do not commit secrets. If reviewer API credentials are introduced, document env vars in `.env.example`.

## Commands

Current repo has no app scaffold or canonical test/build commands.

Use now:
- `git status --short --branch`
- `rg "<term>" concept-and-ideas phase-plans`
- `find . -maxdepth 3 -type f -print | sort`

Use after Phase 01A creates the TypeScript scaffold:
- `pnpm test`
- `pnpm run typecheck` if present

Use after Phase 03A creates harness scripts:
- Run the documented regression seed simulation command before claiming harness/game changes complete.

## Workflow

All phase-scoped work:
1. Read `PROGRESS.MD` (Active Phase, open tasks, checklist, last validation entries).
2. Add or claim a task in the Task queue before implementing.
3. On completion: tick Phase checklist, append Validation log, move deferred ideas to Future backlog.
4. When a phase is done: follow `PROGRESS.MD` rotation steps (archive, reset queue/log, new checklist).

Small changes:
1. Inspect the relevant concept/phase files and `PROGRESS.MD` if the change is phase-bound.
2. Make the minimal edit.
3. Run available targeted checks.
4. Report changed files and verification.

Medium/large changes:
1. Plan from the active phase; seed the plan into `PROGRESS.MD` Task queue and Phase checklist.
2. Identify touched boundaries: game, harness, reviewer, developer loop, artifacts, UI.
3. Implement one bounded step at a time.
4. Add or update tests with the behavior.
5. Review the diff against `PHASE-00A`.
6. Summarize residual risks.

Risky changes require confirmation first:
- destructive file operations
- broad refactors
- protocol changes
- dependency major upgrades
- external service mutation
- production/deployment actions
- anything that could lose run/version evidence

## Verification Gates

- Game contract changes need contract tests.
- Seeded randomness changes need reproducibility tests.
- Harness changes need trace/scorecard shape checks.
- Reviewer-agent changes need mocked response tests and invalid-output handling.
- Version-loop changes need acceptance/rejection artifact checks.
- UI changes must prove the headless harness still works.

## Agent / Subagent Usage

- Use `game-protocol-reviewer` when `src/game/**`, `src/harness/**`, actions, terminal states, traces, or scorecards change.
- Use `test-verifier` before claiming a phase is complete.
- Keep subagents read/review focused unless the user asks for implementation.

## Cursor Agent Orchestration

When the user requests Cursor Agent, Composer, or maximum automation, use Cursor Agent CLI as a bounded delegate and keep final responsibility in this orchestrator.

- Default model: `composer-2.5`.
- Default command shape: `agent --print --trust --model composer-2.5 --workspace <worktree-path> "<bounded prompt>"`.
- Use isolated worktrees for phase work when practical, and remove them after merged PRs.
- Give Cursor specific ownership, constraints, forbidden changes, and verification commands in the prompt.
- For read-only audits, prefer `--mode=ask` with explicit no-edit instructions if `--mode=plan` returns empty output.
- If `agent status` or `agent models` fails with macOS keychain errors, rerun with the required elevated access and record the result in `PROGRESS.MD`.
- Never accept Cursor output as proof by itself; inspect diffs and rerun relevant validation before committing or claiming completion.

## When Unsure

- Proceed with the conservative local choice when rollback is easy and tests can verify it.
- Ask before changing architecture, protocol shape, external systems, secrets, or version acceptance semantics.
- If commands are missing, say so and recommend the script instead of inventing success.

## Docs Map

| Path | Use |
|---|---|
| `concept-and-ideas/01_NORTH_STAR_AND_VISION.md` | Product intent and invariants |
| `concept-and-ideas/02_STRUCTURE_AND_TECH_SPECS.md` | Planned stack, interfaces, harness, tests |
| `concept-and-ideas/03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md` | Version loop examples and artifact shape |
| `phase-plans/PHASE-00A-PLAN-STANDARDS-AND-GLOBAL-INVARIANTS.md` | Global implementation contract |
| `phase-plans/PHASE-01A...` through `PHASE-10A...` | Sequential implementation phases |
| `PROGRESS.MD` | Active phase, agent task queue, checklist, validation log, future backlog |
