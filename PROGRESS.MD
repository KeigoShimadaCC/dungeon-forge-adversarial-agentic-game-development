# Project Progress

Living coordination file for AI agents. One active phase at a time. Update on every meaningful slice of work so the next agent can continue without re-deriving state.

---

## Active Phase

| Field | Value |
| --- | --- |
| Phase | Phase 06C Prep — Scorecard schema and review-score merge |
| Goal | Upgrade Phase 05A scorecards to the canonical Phase 06C shape while leaving real reviewer integration blocked on Phase 06B. |
| Branch | `phase-06c-scorecard-prep` |
| Worktree | `/Users/keigoshimada/Documents/dungeon-forge-phase-06c-scorecard-wt` |
| Base | `origin/main` at `ac573e5` |
| Status | `prep complete; PR open` |

### Contract (read before editing)

1. `concept-and-ideas/` — product intent
2. `phase-plans/PHASE-00A-PLAN-STANDARDS-AND-GLOBAL-INVARIANTS.md` — global invariants
3. Active `phase-plans/PHASE-XX...md` — implementation contract for this slice
4. `AGENTS.md` / `CLAUDE.md` — repo rules
5. `.claude/rules/progress-coordination.md` — progress-file edit rules
6. User task request — overrides only when explicit

### Agent workflow

1. **Read** this file and the active phase plan.
2. **Add** concrete work to [Task queue](#task-queue) before starting (or claim an existing open task).
3. **Execute** only active-phase scope unless the user expands it.
4. **Tick** [Phase checklist](#phase-checklist) and task-queue items as work completes.
5. **Log** commands, results, and evidence in [Validation log](#validation-log).
6. **Defer** out-of-scope ideas to [Future backlog](#future-backlog) — do not implement them silently.
7. **Do not** mark phase acceptance complete until checklist + phase acceptance criteria are rechecked against the repo.

### Task status legend

| Mark | Meaning |
| --- | --- |
| `[ ]` | Open / not started |
| `[~]` | In progress |
| `[x]` | Done |
| `[-]` | Skipped or N/A (say why in log) |
| `[!]` | Blocked (say why in log) |

---

## Task queue

_Agents add and own granular tasks here. Prefer small, verifiable items. Include date and agent id when useful._

### In progress

- _(none)_

### Open
- _(none)_

### Done

- [x] 2026-05-22 orchestrator — Seed Phase 06C Prep progress state and commit before implementation (`e8a57ee`).
- [x] 2026-05-22 orchestrator — Implement scorecard schema, mocked review merge, validator, public exports, and focused tests locally after Cursor implementation was blocked by host policy.
- [x] 2026-05-22 orchestrator — Review implementation diff for phase scope and no `src/game/**` changes.
- [x] 2026-05-22 orchestrator — Run local verification: `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`, `git diff --check`, and `pnpm run simulate-seed -- --seed seed_001 --policy stairs-seeking --version v001-prep`.
- [x] 2026-05-22 orchestrator — Re-read `phase-plans/PHASE-06C-SCORECARD.md`, update final prep notes, commit, push, and open PR.

### Blocked / skipped

- [!] Full Phase 06C acceptance — blocked until Phase 06B provides real reviewer-critic output; this branch may only add mocked review-score merge support.
- [!] Cursor read-only audit — blocked by host policy against transmitting workspace code to the external Cursor service; local scope audit completed instead.

---

## Phase checklist

_Derived from the active phase plan: deliverables, tests/validation, acceptance criteria. Tick when verified, not when merely attempted._

### Phase 06C Prep — Scorecard

- [x] Scorecard type includes canonical objective fields, `reviewer_scores`, trace linkage, and optional review source linkage.
- [x] Trace-only scorecard generation keeps objective metrics and normalizes subjective scores to `null`.
- [x] Mocked review-score input can enrich scorecards without implementing Phase 06B reviewer generation.
- [x] Required-field validation fails on missing objective fields while allowing null subjective scores.
- [x] Scorecard writer preserves deterministic `runs/vXXX/scorecards/` paths.
- [x] Public harness exports include updated scorecard types and validator.
- [x] Focused tests cover trace-only, trace-plus-review, partial subjective scores, validation failure, deterministic JSON, and saved file shape.
- [x] Local validation commands pass or blockers are logged.
- [!] Full Phase 06C acceptance with real reviewer output remains blocked on Phase 06B.

---

## Future backlog

_Ideas noticed during work that are **out of active-phase scope** but worth tracking. Do not implement here unless the user or phase plan expands scope._

| ID | Idea | Suggested phase | Why deferred | Noted |
| --- | --- | --- | --- | --- |
| F-001 | _(add ideas here)_ | _(phase)_ | _(why deferred)_ | _(agent, date)_ |
| F-03A-001 | Extract engine-local map/combat helpers into dedicated modules when those systems grow. | Phase 09B / Phase 09C | Phase 03A permits modules as needed; richer enemy variety and procedural map generation are explicitly scheduled later. | orchestrator, 2026-05-22 |

_Add rows as you go. Promote to Task queue when a phase plan or user explicitly schedules the work._

---

## Validation log

_Append-only evidence for the active phase: commands run, pass/fail, commits, PRs, blockers. Newest entries at the bottom._

- 2026-05-22 — orchestrator — Created worktree `/Users/keigoshimada/Documents/dungeon-forge-phase-06c-scorecard-wt` from `origin/main` at `ac573e5` on branch `phase-06c-scorecard-prep`.
- 2026-05-22 — orchestrator — Cursor preflight: `command -v agent` resolved `/Users/keigoshimada/.local/bin/agent`; `agent --list-models` confirmed `composer-2.5` available/current; `git status --short --branch` showed clean `phase-06c-scorecard-prep...origin/main`.
- 2026-05-22 — orchestrator — Re-read `phase-plans/PHASE-06C-SCORECARD.md`. Full acceptance depends on `PHASE-06B-REVIEWER-CRITIC`; this prep branch must use only mocked review-score input and must not implement reviewer generation.
- 2026-05-22 — orchestrator — Cursor implementation pass blocked by host policy: escalating `agent --print --trust --model composer-2.5 --workspace ...` was rejected because it would transmit workspace code to an external Cursor service. Proceeded with local implementation in the same scoped files.
- 2026-05-22 — orchestrator — Installed dependencies with `pnpm install` after first `pnpm test` failed because `node_modules` was missing; lockfile was already up to date and packages were reused from local store.
- 2026-05-22 — orchestrator — Local implementation smoke gates: `pnpm test` PASS (8 files, 82 tests); `pnpm run typecheck` PASS after validator cast fix; `pnpm run lint` PASS.
- 2026-05-22 — orchestrator — Commit `f4aeb35` added Phase 06C prep scorecard schema, mocked review-score merge input, validator, exports, and tests.
- 2026-05-22 — orchestrator — Final validation PASS: `pnpm test` (8 files, 82 tests), `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`, `git diff --check`, and `pnpm run simulate-seed -- --seed seed_001 --policy stairs-seeking --version v001-prep`. Simulation wrote ignored evidence under `runs/v001-prep/` and produced a scorecard with canonical nullable `reviewer_scores` and trace linkage.
- 2026-05-22 — orchestrator — Local scope audit PASS: `git diff --name-only origin/main...HEAD` is limited to `PROGRESS.MD`, `src/harness/index.ts`, `src/harness/runner.ts`, `src/harness/scorecard.ts`, `src/harness/types.ts`, and `tests/harness.test.ts`; no `src/game/**`, `content/**`, phase-plan, concept-doc, or tracked `runs/**` changes.
- 2026-05-22 — orchestrator — Cursor read-only audit was not run because the host policy rejected external Cursor workspace-code transmission. Local audit covered canonical fields, trace linkage, determinism tests, and absence of Phase 06B reviewer generation.
- 2026-05-22 — orchestrator — Re-read `phase-plans/PHASE-06C-SCORECARD.md` before finalization: implemented prep deliverables for scorecard generation/schema/writer/tests and mocked subjective-score merge; full Phase 06C acceptance remains blocked until Phase 06B supplies real reviewer output.
- 2026-05-22 — orchestrator — Pushed `phase-06c-scorecard-prep` and opened prep PR #11: https://github.com/KeigoShimadaCC/dungeon-forge-adversarial-agentic-game-development/pull/11.

---

## Phase archive

_Completed phases: summary only. Do not edit except to fix factual errors. Start a fresh checklist when rotating the active phase._

### Phase 05A — Harness

- **Status:** `done`
- **Branch / PR:** `phase-05a-harness` — https://github.com/KeigoShimadaCC/dungeon-forge-adversarial-agentic-game-development/pull/10
- **Merge commit:** `dc920ae`
- **Outcome:** Headless playthrough harness added under `src/harness/**` with canonical trace/scorecard types, deterministic JSON writing, baseline policy registry, public-`GameEngine` runner, invalid-policy `ABORTED` handling, stable artifact paths under ignored `runs/<version>/traces/` and `runs/<version>/scorecards/`, and `simulate-seed` CLI support.
- **Key evidence:** `tests/harness.test.ts`; final validation passed with `pnpm test` (8 files, 76 tests), `pnpm run typecheck`, `pnpm run lint`, `pnpm run build`, `git diff --check`, and `pnpm run simulate-seed -- --seed seed_001 --policy stairs-seeking --version v001`; Cursor read-only audit reported PASS with no blocking findings.

### Phase 04B — Baseline players

- **Status:** `done`
- **Branch / PR:** `phase-04b-baseline-players` — https://github.com/KeigoShimadaCC/dungeon-forge-adversarial-agentic-game-development/pull/9
- **Merge commit:** `bec1d1a`
- **Outcome:** Deterministic non-LLM baseline policies were added under `src/harness/baseline-players/**`: random valid action, stairs-seeking, cautious low-HP, and greedy item picker. Policies choose from available structured actions, include deterministic RNG where needed, and can drive canonical seeds through terminal outcomes without mutating game state directly.
- **Key evidence:** `tests/baseline-players.test.ts`; final validation passed with `pnpm test` (7 files, 65 tests), `pnpm run typecheck`, `pnpm run lint`, `git diff --check`, and `rg "Math\\.random" src tests` matching only the existing guidance comment in `src/game/rng.ts`; Cursor read-only audit reported PASS.

### Phase 04A — ASCII renderer

- **Status:** `done`
- **Branch / PR:** `phase-04a-ascii-renderer` — https://github.com/KeigoShimadaCC/dungeon-forge-adversarial-agentic-game-development/pull/8
- **Merge commit:** `b6d87c5`
- **Outcome:** Deterministic text/ASCII rendering moved into `src/game/render.ts` with `GameEngine.render(state)` preserved through the stable engine interface. Render output includes map symbols, floor/turn, HP, inventory, legend, recent log, and explicit terminal outcome text while remaining pure from the caller perspective.
- **Key evidence:** `tests/render.test.ts`; Phase 04A validation passed with `pnpm test` (6 files, 53 tests), `pnpm run typecheck`, `pnpm run lint`, and `git diff --check`; Cursor read-only audit reported PASS before merge.

### Phase 03A — Minimal dungeon

- **Status:** `done`
- **Branch / PR:** `phase-03a-minimal-dungeon` — https://github.com/KeigoShimadaCC/dungeon-forge-adversarial-agentic-game-development/pull/7
- **Merge commit:** `2fdc28326bb8f23eeae13baf4a7d773355b0af30`
- **Outcome:** First finite playable dungeon implemented under the stable `GameEngine` contract. The game starts from a seed, builds five 8x8 floors with walls/floors/stairs, uses Phase 02C Potion/Slime/floor content, exposes structured movement/attack/wait/pickup/use/descend/inspect actions, supports Slime turns, Potion healing, floor progression, `WIN`, `LOSS`, max-turn `ABORTED`, and invalid-state `ABORTED` events.
- **Key evidence:** `tests/engine.test.ts` covers deterministic setup, movement, wall blocking, invalid actions, Slime damage, melee combat, Potion pickup/use, stairs/final `WIN`, HP-zero `LOSS`, max-turn `ABORTED`, invalid-state `ABORTED`, and render basics; repeated `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, `git diff --check`, and `Math.random` search passes; Cursor read-only audit reported Phase 03A PASS before the invalid-state follow-up.

### Phase 02C — Content data

- **Status:** `done`
- **Branch / PR:** `phase-02c-content-data` — https://github.com/KeigoShimadaCC/dungeon-forge-adversarial-agentic-game-development/pull/5
- **Merge commit:** `8893bb642fbe89613c6fa5a2899931a455d53ac8`
- **Outcome:** Static local content layer added with finite Potion, Slime, and five floor-rule records. `src/game/content.ts` validates JSON bundles and content references, while `src/game/items.ts` and `src/game/enemies.ts` expose ID lookup helpers for later game logic. No dynamic LLM content, external runtime service, database, CMS, editor, plugin system, or large catalog was introduced.
- **Key evidence:** Cursor Agent implementation and test-only follow-up; conflict resolution with merged Phase 02A/02B; `pnpm test` exit 0 (4 files, 29 tests), `pnpm run typecheck` exit 0, `pnpm run lint` exit 0, `git diff --check` exit 0.

### Phase 02B — Seeded RNG

- **Status:** `done`
- **Branch / PR:** `phase-02b-seeded-rng` — https://github.com/KeigoShimadaCC/dungeon-forge-adversarial-agentic-game-development/pull/3
- **Merge commit:** `3094915988581f2477ceb4662257c11059ab5bd2`
- **Outcome:** Deterministic Mulberry32 RNG helpers added with create/restore, float, bounded integer, shuffle, weighted choice, and serializable snapshot support.
- **Key evidence:** `tests/rng.test.ts`; repeated `pnpm test`, `pnpm run typecheck`, and `pnpm run lint` passes; direct `Math.random()` search matched only the guidance comment in `src/game/rng.ts`.

### Phase 02A — Game contract

- **Status:** `done`
- **Branch / PR:** `phase-02a-game-contract` — https://github.com/KeigoShimadaCC/dungeon-forge-adversarial-agentic-game-development/pull/4
- **Merge commit:** `1f84233`
- **Outcome:** Stable `GameEngine` contract and serializable core game types added. Minimal protocol implementation supports `start`, `render`, `getAvailableActions`, `step`, terminal checks, invalid-action `StepResult` errors, and max-turn `ABORTED`.
- **Key evidence:** `tests/contract.test.ts`; `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, and `git diff --check` passes; acceptance audit confirmed no external-service/browser/image/audio or non-serializable game-state handles.

### Phase 01A — Project structure

- **Status:** `done`
- **Branch / PR:** `phase-01a-project-structure` — https://github.com/KeigoShimadaCC/dungeon-forge-adversarial-agentic-game-development/pull/2
- **Merge commit:** `e17e843975f0fb055336b0b80d1940770e898f9e`
- **Outcome:** TypeScript + Node + pnpm + Vitest + ESLint scaffold created. Planned `src/game`, `src/harness`, `src/agents/prompts`, `content`, `tests`, `docs`, and `runs` boundaries exist with compile-only placeholders; no gameplay depth, LLM integration, browser UI, database, Docker, deployment, or generated run evidence.
- **Key evidence:** Cursor Agent implementation with `composer-2.5`; local `pnpm install`; repeated `pnpm test`, `pnpm run typecheck`, and `pnpm run lint` passes; Cursor read-only verification found no blocking Phase 01A issues; PR review remediation completed before merge.

<details>
<summary>Phase 01A checklist (completed)</summary>

- [x] Read phase plan and confirm scope boundaries.
- [x] Create project config files and scripts.
- [x] Create initial source, content, test, docs, and run directories.
- [x] Add placeholder modules that compile.
- [x] Add basic Vitest scaffold tests.
- [x] Add minimal north-star/rules docs.
- [x] Run `pnpm install`.
- [x] Run `pnpm test`.
- [x] Run `pnpm run typecheck`.
- [x] Run `pnpm run lint`.
- [x] Re-read acceptance criteria against repo state.
- [x] Push branch and merge PR #2 to `main`.

</details>

### Phase 00A — Plan standards and global invariants

- **Status:** `done`
- **Branch / PR:** `phase-00a-plan-standards-impl` — https://github.com/KeigoShimadaCC/dungeon-forge-adversarial-agentic-game-development/pull/1
- **Outcome:** All 21 `phase-plans/*.md` files verified (10 required sections, dependencies/deliverables/tests/acceptance, no forbidden MVP scope in goals). Documentation-only; no scaffold.
- **Key evidence:** Cursor Agent read-only audit (Composer 2.5); local section-count and forbidden-scope keyword review; commits `aa0cc5f`, `625a0b6`.

<details>
<summary>Phase 00A checklist (completed)</summary>

- [x] Inspect base repository status.
- [x] Create isolated worktree from `origin/main`.
- [x] Create `PROGRESS.MD` before other tracked changes.
- [x] Confirm Cursor Agent CLI and model/auth.
- [x] Delegate read-only Phase 00A audit (or document blocker).
- [x] Verify all phase plans meet Phase 00A section and scope rules.
- [x] Confirm diff documentation-only.
- [x] Re-read acceptance criteria vs repo state.
- [x] Push branch and open PR to `main`.

</details>

---

## Rotating to a new phase

When the active phase is **done** and merged (or abandoned):

1. Move the current [Phase checklist](#phase-checklist) and relevant [Task queue](#task-queue) / [Validation log](#validation-log) summary into [Phase archive](#phase-archive).
2. Clear **Task queue** (open/in progress/done) and **Validation log** (or start a dated subsection).
3. Update [Active Phase](#active-phase) table and replace **Phase checklist** with items from the new phase plan.
4. Leave [Future backlog](#future-backlog) as-is unless items were implemented or are obsolete (strike or remove with a note).

---

## Notes

- Phase 00A required no `package.json`; Phase 01A+ may use `pnpm test`, `pnpm run typecheck`, etc. once scaffold exists.
- Treat `runs/**` as generated evidence, not design truth.
- Reviewer critique must be trace-based; harness validates versions.
