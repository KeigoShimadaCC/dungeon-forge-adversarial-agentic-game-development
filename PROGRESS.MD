# Project Progress

Living coordination file for AI agents. One active phase at a time. Update on every meaningful slice of work so the next agent can continue without re-deriving state.

---

## Active Phase

| Field | Value |
| --- | --- |
| Phase | `phase-plans/PHASE-04B-BASELINE-PLAYERS.md` |
| Goal | Add deterministic non-LLM automated baseline players for cheap smoke testing before reviewer agents exist. |
| Branch | `phase-04b-baseline-players` |
| Worktree | `/Users/keigoshimada/Documents/dungeon-forge-phase-04b` |
| Base | `origin/main` |
| Status | `pr_open` |

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

- [x] 2026-05-22 — orchestrator — Seed PROGRESS.MD for Phase 04B baseline players (user chose 04B over stale 04A Active Phase).
- [x] 2026-05-22 — cursor-agent — Baseline player modules under `src/harness/baseline-players/**` (random, stairs-seeking, cautious low-HP, greedy item-picker) plus `runBaselinePolicyPlaythrough` helper.
- [x] 2026-05-22 — cursor-agent — Deterministic policy RNG via `createSeededRng` in `createRandomValidActionPolicy`; all policies return members of `getAvailableActions`.
- [x] 2026-05-22 — cursor-agent — `tests/baseline-players.test.ts` (valid action, no mutation, reproducibility, canonical seeds `seed_001`–`seed_005`).
- [x] 2026-05-22 — cursor-agent — Validation: `pnpm install`; `pnpm test` exit 0 (6 files, 51 tests); `pnpm run typecheck` exit 0; `pnpm run lint` exit 0.
- [x] 2026-05-22 — cursor-agent — Read-only Phase 04B audit against plan and invariants: PASS; no blocking findings.
- [x] 2026-05-22 — orchestrator — Re-read Phase 04B acceptance criteria against actual repo state after audit follow-up.
- [x] 2026-05-22 — orchestrator — Pushed `phase-04b-baseline-players` and opened PR #9 to `main`.
- [x] 2026-05-22 — orchestrator — Re-audited Phase 04B plan implementation at user request; fixed heuristic-test coverage and stairs lookup robustness.
- [x] 2026-05-22 — orchestrator — Rebased PR #9 on merged Phase 04A `origin/main`, resolved `PROGRESS.MD` conflict, and preserved Phase 04A in the archive.

### Blocked / skipped

- _(use `[!]` or `[-]` with a one-line reason)_

---

## Phase checklist

_Derived from the active phase plan: deliverables, tests/validation, acceptance criteria. Tick when verified, not when merely attempted._

### Phase 04B — Baseline players

- [x] Read Phase 04B plan and confirm scope boundaries (no LLM player integration, optimal pathfinding requirements, human UI, or game engine contract changes for policy convenience).
- [x] Baseline player modules under `src/harness/**` or another clear non-game-engine boundary.
- [x] Random valid-action player.
- [x] Stairs-seeking player.
- [x] Cautious low-HP player.
- [x] Greedy item-picker player.
- [x] Deterministic policy RNG where needed; policies choose only from `getAvailableActions(state)` and are deterministic for a fixed seed and state sequence.
- [x] Tests proving valid action selection.
- [x] Minimal runner helper for policy smoke tests if needed.
- [x] Each baseline player can run.
- [x] Baseline players only choose valid actions.
- [x] A game driven by a baseline player reaches `WIN`, `LOSS`, or `ABORTED`.
- [x] Baseline runs do not crash.
- [x] Fixed policy seed produces reproducible choices.
- [x] Canonical regression seeds `seed_001` through `seed_005` complete without undefined terminal states.
- [x] `pnpm test` passes.
- [x] `pnpm run typecheck` passes.
- [x] `pnpm run lint` passes.
- [x] Cheap crash and softlock detection before LLM costs are introduced (acceptance).
- [x] Baseline players do not mutate game state directly (acceptance).
- [x] Gameplay remains structured-action based (acceptance).
- [x] Re-read acceptance criteria against actual repo state.
- [x] Push branch and open PR when implemented.

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

_Append-only evidence: commands run, pass/fail, commits, PRs, blockers. Newest entries at the bottom._

- 2026-05-22 — orchestrator — PR #7 merged at `2fdc283`; rebased local `main` onto `origin/main` while preserving local docs commit `6b9d787`; rotated active phase to `PHASE-04A-ASCII-RENDERER.md` and archived Phase 03A summary. Post-merge validation: `pnpm test` exit 0 (5 files, 43 tests), `pnpm run typecheck` exit 0, `pnpm run lint` exit 0, `git diff --check` exit 0, and `rg "Math\\.random" src tests` matched only the existing guidance comment in `src/game/rng.ts`.
- 2026-05-22 — orchestrator — Phase 04B progress seed: read `phase-plans/PHASE-04B-BASELINE-PLAYERS.md` and `PROGRESS.MD`; user explicitly chose Phase 04B over stale Active Phase 04A. Preflight: `origin/main` baseline clean for worktree setup; `composer-2.5` available for delegated passes; branch `phase-04b-baseline-players` and worktree `/Users/keigoshimada/Documents/dungeon-forge-phase-04b` created from `origin/main`. Updated Active Phase, task queue, and Phase 04B checklist only (no source/tests/package changes in this slice).
- 2026-05-22 — cursor-agent — Phase 04B implementation: `src/harness/baseline-players/**` (policy interface, four policies, shared helpers, `runBaselinePolicyPlaythrough`); `tests/baseline-players.test.ts`. `pnpm install`; `pnpm test` exit 0 (6 files, 51 tests); `pnpm run typecheck` exit 0; `pnpm run lint` exit 0. No `src/game/**` or package changes.
- 2026-05-22 — orchestrator — Reviewed Cursor implementation and tightened runner/test contract so policies must return the exact `PlayerAction` object from the supplied `availableActions` list. Local validation: initial `pnpm test` failed after stricter assertion because the test helper compared against a fresh action array; fixed helper. Final local validation: `pnpm test` exit 0 (6 files, 51 tests); `pnpm run typecheck` exit 0; `pnpm run lint` exit 0; `git diff --check` exit 0; `rg "Math\\.random" src tests` matched only the existing guidance comment in `src/game/rng.ts`.
- 2026-05-22 — cursor-agent — Read-only audit (`agent --print --trust --mode=ask --model composer-2.5 --workspace /Users/keigoshimada/Documents/dungeon-forge-phase-04b`): PASS. Audit noted test-hardening gaps around explicit action reference identity and cloned-action rejection; orchestrator added `tests/baseline-players.test.ts` coverage for both.
- 2026-05-22 — orchestrator — Final Phase 04B validation after audit follow-up: `pnpm test` exit 0 (6 files, 52 tests); `pnpm run typecheck` exit 0; `pnpm run lint` exit 0; `git diff --check` exit 0; `rg "Math\\.random" src tests` matched only the existing guidance comment in `src/game/rng.ts`. Acceptance re-read: cheap baseline crash/softlock smoke coverage exists, policies do not mutate game state directly, and gameplay remains structured-action based with no `src/game/**` contract changes.
- 2026-05-22 — orchestrator — Pushed branch with `git push -u origin phase-04b-baseline-players` and opened PR #9: https://github.com/KeigoShimadaCC/dungeon-forge-adversarial-agentic-game-development/pull/9
- 2026-05-22 — orchestrator — User-requested implementation-plan recheck: confirmed scope stayed limited to `PROGRESS.MD`, `src/harness/baseline-players/**`, and `tests/baseline-players.test.ts`; no `src/game/**`, package, content, runs, or docs diff. Fixed one robustness gap by making `findStairsPosition` scan the map for the stairs tile before falling back to the current convention. Added direct heuristic tests for `stairsSeeking`, `cautiousLowHp`, and `greedyItemPicker`. Validation after fixes: `pnpm test` exit 0 (6 files, 55 tests); `pnpm run typecheck` exit 0; `pnpm run lint` exit 0; `git diff --check` exit 0; `rg "Math\\.random" src tests` matched only the existing guidance comment in `src/game/rng.ts`.
- 2026-05-22 — orchestrator — PR #9 conflict fix: fetched `origin/main` at `b6d87c5` (merged Phase 04A), rebased `phase-04b-baseline-players`, resolved `PROGRESS.MD` conflict by keeping Phase 04B active and adding Phase 04A to the phase archive. Post-rebase validation: `pnpm test` exit 0 (7 files, 65 tests); `pnpm run typecheck` exit 0; `pnpm run lint` exit 0; `git diff --check` exit 0; `rg "Math\\.random" src tests` matched only the existing guidance comment in `src/game/rng.ts`.

---

## Phase archive

_Completed phases: summary only. Do not edit except to fix factual errors. Start a fresh checklist when rotating the active phase._

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
