# Project Progress

Living coordination file for AI agents. One active phase at a time. Update on every meaningful slice of work so the next agent can continue without re-deriving state.

---

## Active Phase

| Field | Value |
| --- | --- |
| Phase | `phase-plans/PHASE-01A-PROJECT-STRUCTURE.md` |
| Goal | _(one sentence from the phase plan Target Outcome)_ |
| Branch | _(working branch name)_ |
| Worktree | _(optional isolated path, or `main checkout`)_ |
| Base | _(e.g. `origin/main`)_ |
| Status | `not_started` \| `in_progress` \| `blocked` \| `ready_for_review` \| `done` |

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

- _(add tasks here, e.g. `[ ] T-001 Scaffold package.json and pnpm scripts (agent, 2026-05-22)`)_

### Done

- _(move completed queue items here with `[x]`)_

### Blocked / skipped

- _(use `[!]` or `[-]` with a one-line reason)_

---

## Phase checklist

_Derived from the active phase plan: deliverables, tests/validation, acceptance criteria. Tick when verified, not when merely attempted._

### Phase 01A — Project structure

- [ ] Read phase plan and confirm scope boundaries.
- [ ] _(copy deliverables from phase plan as checkboxes)_
- [ ] _(copy tests/validation steps as checkboxes)_
- [ ] _(copy acceptance criteria as checkboxes)_
- [ ] Re-read acceptance criteria against actual repo state.
- [ ] Commit / PR only when user asks.

---

## Future backlog

_Ideas noticed during work that are **out of active-phase scope** but worth tracking. Do not implement here unless the user or phase plan expands scope._

| ID | Idea | Suggested phase | Why deferred | Noted |
| --- | --- | --- | --- | --- |
| F-001 | _(add ideas here)_ | _(phase)_ | _(why deferred)_ | _(agent, date)_ |

_Add rows as you go. Promote to Task queue when a phase plan or user explicitly schedules the work._

---

## Validation log

_Append-only evidence: commands run, pass/fail, commits, PRs, blockers. Newest entries at the bottom._

- _(YYYY-MM-DD) agent-id — what was run and outcome_

---

## Phase archive

_Completed phases: summary only. Do not edit except to fix factual errors. Start a fresh checklist when rotating the active phase._

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
