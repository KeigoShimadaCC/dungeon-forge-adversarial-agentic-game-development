# Project Progress

Living coordination file for AI agents. One active phase at a time. Update on every meaningful slice of work so the next agent can continue without re-deriving state.

---

## Active Phase

| Field | Value |
| --- | --- |
| Phase | `phase-plans/PHASE-05A-HARNESS.md` |
| Goal | Build the headless playthrough harness that runs seeded games, records traces, and produces initial scorecards. |
| Branch | `phase-05a-harness` |
| Worktree | `/Users/keigoshimada/Documents/dungeon-forge-phase-05a-harness-wt` |
| Base | `main` at `bec1d1a` |
| Status | `in_progress` |

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
- [ ] 2026-05-22 — cursor-agent — Implement canonical trace/scorecard types, runner, policy registry, artifact saving, and CLI under allowed Phase 05A paths.
- [ ] 2026-05-22 — cursor-agent — Add harness tests for saved artifacts, deterministic traces, canonical fields, terminal recording, invalid action metrics, max-step stops, and canonical seeds.
- [ ] 2026-05-22 — orchestrator — Review Cursor implementation diff for scope, GameEngine protocol usage, deterministic JSON output, and generated-evidence handling.
- [ ] 2026-05-22 — orchestrator — Run local validation gates: `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, `git diff --check`, and `pnpm run simulate-seed -- --seed seed_001 --policy stairs-seeking --version v001`.
- [ ] 2026-05-22 — cursor-agent — Run read-only Phase 05A audit after implementation.
- [ ] 2026-05-22 — orchestrator — Fix validated audit gaps, re-run relevant gates, finalize `PROGRESS.MD`, push branch, and open PR.

### Done

- [x] 2026-05-22 — orchestrator — Seed Phase 05A progress state, checklist, and validation log before source changes.

### Blocked / skipped

- _(use `[!]` or `[-]` with a one-line reason)_

---

## Phase checklist

_Derived from the active phase plan: deliverables, tests/validation, acceptance criteria. Tick when verified, not when merely attempted._

### Phase 05A — Harness

- [x] Read Phase 05A plan and confirm scope boundaries (no LLM calls, reviewer critique generation, developer orchestration, dashboard, or database storage).
- [ ] Harness runner module under `src/harness/**`.
- [ ] CLI/script entry point such as `run-playthrough` or `simulate-seed`.
- [ ] Trace writer that saves versioned evidence under `runs/v001/traces/`.
- [ ] Basic scorecard writer that derives metrics from trace facts only and saves under `runs/v001/scorecards/`.
- [ ] Canonical trace JSON includes `version`, `seed`, `persona`, `result`, `turns`, and `steps[]`.
- [ ] Each step includes `turn`, `state_summary`, `render`, `available_actions`, `chosen_action`, optional `reason`, `valid`, `events`, and `terminalStatus`.
- [ ] Runner uses only the public `GameEngine` protocol: `start`, `render`, `getAvailableActions`, `step`, and `isTerminal`.
- [ ] Policy registry maps baseline policy IDs: `random`, `stairs-seeking`, `cautious-low-hp`, and `greedy-item-picker`.
- [ ] Invalid policy output is recorded as an invalid harness step and terminates the trace as `ABORTED`.
- [ ] Trace file is saved.
- [ ] Scorecard file is saved.
- [ ] Fixed seed and fixed policy produce reproducible trace output.
- [ ] Trace files contain all canonical fields.
- [ ] Terminal status is recorded.
- [ ] Invalid action count is recorded.
- [ ] Harness stops at terminal status or configured max turns.
- [ ] Canonical regression seeds `seed_001` through `seed_005` can be simulated with at least one baseline policy.
- [ ] `pnpm test` passes.
- [ ] `pnpm run typecheck` passes.
- [ ] `pnpm run lint` passes.
- [ ] `git diff --check` passes.
- [ ] `pnpm run simulate-seed -- --seed seed_001 --policy stairs-seeking --version v001` writes inspectable evidence.
- [ ] Generated `runs/**` evidence is ignored by git but inspectable on disk.
- [ ] Re-read acceptance criteria against actual repo state.
- [ ] Push branch and open PR when implemented.

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

- 2026-05-22 — orchestrator — Phase 05A preflight: read `PROGRESS.MD`, `phase-plans/PHASE-05A-HARNESS.md`, Phase 00A invariants, north star, examples/workflows, and technical specs. `git status --short --branch` on root worktree: clean `main...origin/main`. `git fetch origin` exit 0. `agent --list-models` initially failed inside sandbox with `SecItemCopyMatching failed -50`; escalated preflight exit 0 and confirmed `composer-2.5` is available. Preserved dirty unregistered checkout at `/Users/keigoshimada/Documents/dungeon-forge-phase-05a-harness`; created registered worktree `/Users/keigoshimada/Documents/dungeon-forge-phase-05a-harness-wt` on branch `phase-05a-harness` from `main` at `bec1d1a`.
- 2026-05-22 — orchestrator — Seeded Phase 05A progress state only in `PROGRESS.MD`: Active Phase rotated to `PHASE-05A-HARNESS.md`, Phase 05A task queue/checklist added, Phase 04B archived as merged PR #9, and implementation work left untouched for the next commit.

---

## Phase archive

_Completed phases: summary only. Do not edit except to fix factual errors. Start a fresh checklist when rotating the active phase._

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
