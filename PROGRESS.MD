# Project Progress

Living coordination file for AI agents. One active phase at a time. Update on every meaningful slice of work so the next agent can continue without re-deriving state.

---

## Active Phase

| Field | Value |
| --- | --- |
| Phase | `phase-plans/PHASE-02B-SEEDED-RNG.md` |
| Goal | Add deterministic seeded randomness helpers for reproducible floats, integers, shuffles, and weighted choices. |
| Branch | `phase-02b-seeded-rng` |
| Worktree | `/Users/keigoshimada/Documents/dungeon-forge-phase-02b-seeded-rng` |
| Base | `origin/main` |
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

- [~] T-02B-007 Publish: commit logical checkpoints, push branch, and open PR (orchestrator, 2026-05-22)

### Open

- _(none)_

### Done

- [x] T-02B-003 Implementation: `src/game/rng.ts` Mulberry32 helpers (`createSeededRng`, `restoreSeededRng`, float/int/shuffle/weightedChoice/snapshot) and `tests/rng.test.ts` (Composer, 2026-05-22)
- [x] T-02B-004 Review Cursor output: inspected changed files/diff; scope limited to `PROGRESS.MD`, `src/game/rng.ts`, and `tests/rng.test.ts` with no engine/harness/content/run changes (orchestrator, 2026-05-22)
- [x] T-02B-005 Validation: `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, `rg "Math\\.random" src tests`, and `git diff --check` passed or matched only the guidance comment (orchestrator, 2026-05-22)
- [x] T-02B-006 Acceptance review: re-read Phase 02B plan and concept constraints against repo state; implementation satisfies scoped RNG requirements (orchestrator, 2026-05-22)
- [x] T-02B-001 Progress setup: rotate `PROGRESS.MD` to Phase 02B and add task queue/checklist before implementation (orchestrator, 2026-05-22)
- [x] T-02B-002 Preflight: confirmed branch/worktree, `agent` CLI, Phase 02B plan, and placeholder `src/game/rng.ts`; `node_modules` missing in worktree before validation (orchestrator, 2026-05-22)

### Blocked / skipped

- _(use `[!]` or `[-]` with a one-line reason)_

---

## Phase checklist

_Derived from the active phase plan: deliverables, tests/validation, acceptance criteria. Tick when verified, not when merely attempted._

### Phase 02B — Seeded RNG

- [x] Read phase plan and confirm scope boundaries (no map generation, cryptographic randomness, direct game-logic `Math.random()`, or nondeterministic content loading).
- [x] `src/game/rng.ts` provides seed-to-RNG initialization.
- [x] RNG API provides deterministic float helper.
- [x] RNG API provides deterministic bounded integer helper.
- [x] RNG API provides deterministic shuffle helper.
- [x] RNG API provides deterministic weighted-choice helper.
- [x] RNG guidance documents that game logic must not call `Math.random()` directly.
- [x] Tests prove same seed produces the same float sequence.
- [x] Tests prove same seed produces the same integer sequence.
- [x] Tests prove different seeds usually produce different sequences.
- [x] Tests prove shuffle is deterministic.
- [x] Tests prove weighted choice is deterministic for a fixed seed and weights.
- [x] `pnpm test` passes.
- [x] `pnpm run typecheck` passes.
- [x] `pnpm run lint` passes.
- [x] Search confirms no game module introduced in this phase uses `Math.random()` directly (only guidance comment in `rng.ts`).
- [x] RNG helpers are easy to inject into later game systems (acceptance).
- [x] Re-running a fixed seed can reproduce procedural decisions (acceptance).
- [x] Re-read acceptance criteria against actual repo state.
- [ ] Commit / PR only when user asks.

---

## Future backlog

_Ideas noticed during work that are **out of active-phase scope** but worth tracking. Do not implement here unless the user or phase plan expands scope._

| ID | Idea | Suggested phase | Why deferred | Noted |
| --- | --- | --- | --- | --- |
| F-001 | _(add ideas here)_ | _(phase)_ | _(why deferred)_ | _(agent, date)_ |
| F-02B-001 | Complete the stable `GameEngine` contract from `PHASE-02A-GAME-CONTRACT.md`. | Phase 02A | User requested Phase 02B next; 02A remains not implemented. | orchestrator, 2026-05-22 |

_Add rows as you go. Promote to Task queue when a phase plan or user explicitly schedules the work._

---

## Validation log

_Append-only evidence: commands run, pass/fail, commits, PRs, blockers. Newest entries at the bottom._

- 2026-05-22 — orchestrator — Rotated active phase from merged Phase 01A to Phase 02A after PR #2 merge (`e17e843`). Phase 02A not started.
- 2026-05-22 — orchestrator — Post-merge main validation: initial `pnpm test`, `pnpm run typecheck`, and `pnpm run lint` failed because `node_modules` was missing in the main checkout; ran `pnpm install` exit 0, then `pnpm test` exit 0 (1 file, 3 tests), `pnpm run typecheck` exit 0, and `pnpm run lint` exit 0.
- 2026-05-22 — orchestrator — User requested implementing `phase-plans/PHASE-02B-SEEDED-RNG.md` next. Created worktree `/Users/keigoshimada/Documents/dungeon-forge-phase-02b-seeded-rng` on branch `phase-02b-seeded-rng` from `origin/main`; Phase 02A remains deferred/not implemented.
- 2026-05-22 — orchestrator — Preflight: `git status --short --branch` showed `phase-02b-seeded-rng...origin/main [ahead 1]`; `command -v agent` found `/Users/keigoshimada/.local/bin/agent`; `src/game/rng.ts` was still the Phase 01A placeholder; `node_modules` was missing in the worktree.
- 2026-05-22 — Composer — Phase 02B implementation: replaced `src/game/rng.ts` placeholder with Mulberry32 `createSeededRng` / `restoreSeededRng` API; added `tests/rng.test.ts` (10 tests).
- 2026-05-22 — Composer — `pnpm install` exit 0 (worktree had no `node_modules`).
- 2026-05-22 — Composer — `pnpm test` exit 0 (2 files, 13 tests).
- 2026-05-22 — Composer — `pnpm run typecheck` exit 0.
- 2026-05-22 — Composer — `pnpm run lint` exit 0.
- 2026-05-22 — Composer — `rg "Math\\.random" src tests` → one match: guidance comment in `src/game/rng.ts` (no runtime `Math.random()` usage).
- 2026-05-22 — orchestrator — Diff review: changed files are `PROGRESS.MD`, `src/game/rng.ts`, and `tests/rng.test.ts`; no Phase 02A engine/types work, dungeon mechanics, harness behavior, content changes, or generated `runs/**` artifacts.
- 2026-05-22 — orchestrator — `pnpm test` exit 0 (2 files, 13 tests).
- 2026-05-22 — orchestrator — `pnpm run typecheck` exit 0.
- 2026-05-22 — orchestrator — `pnpm run lint` exit 0.
- 2026-05-22 — orchestrator — `rg "Math\\.random" src tests` found one match: guidance comment in `src/game/rng.ts`; no runtime game/test use.
- 2026-05-22 — orchestrator — `git diff --check` exit 0.
- 2026-05-22 — orchestrator — Acceptance re-read against Phase 02B, north-star seeded-randomness invariant, and technical spec: RNG is deterministic, injectable, locally tested, and limited to Phase 02B scope; Phase 02A remains deferred.
- 2026-05-22 — orchestrator — Post-cleanup validation rerun: `pnpm test` exit 0 (2 files, 13 tests), `pnpm run typecheck` exit 0, `pnpm run lint` exit 0, `rg "Math\\.random" src tests` matched only the guidance comment, and `git diff --check` exit 0.

---

## Phase archive

_Completed phases: summary only. Do not edit except to fix factual errors. Start a fresh checklist when rotating the active phase._

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
