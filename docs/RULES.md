# Rules

Canonical invariants live in `phase-plans/PHASE-00A-PLAN-STANDARDS-AND-GLOBAL-INVARIANTS.md` and `concept-and-ideas/`. This file summarizes the current operational rules for implemented code, evidence, and validation.

## Non-negotiables

1. **Finite game** — terminal status must be explicit: `ACTIVE`, `WIN`, `LOSS`, or `ABORTED`.
2. **Text/ASCII-first output** — images, audio, generated media, and browser views are optional presentation layers, not required gameplay.
3. **Structured actions** — players choose from explicit available actions, not arbitrary free text.
4. **Turn-based play** — no real-time or reaction-based input.
5. **Seeded randomness** — same seed and config must produce reproducible behavior.
6. **Stable interface** — preserve `start`, `getAvailableActions`, `step`, `render`, and `isTerminal`.
7. **Reviewer plays first** — critique must be grounded in playthrough evidence.
8. **Harness validates versions** — developer self-report is not proof.
9. **Versioned artifacts** — traces, reviews, scorecards, changelogs, developer notes, patch plans or task handoffs, summaries, comparisons, and acceptance reports remain auditable.
10. **Gameplay is credential-free** — optional LLM paths must not be required to run the game or default local checks.

## Implemented interfaces

The game layer owns deterministic state transitions and rendering under `src/game/**`. The harness layer owns playthrough execution, evidence generation, acceptance, replay, analytics, phase automation, and validation under `src/harness/**`.

The public engine contract is:

```ts
export interface GameEngine {
  start(seed: string, config?: GameConfig): GameState;
  getAvailableActions(state: GameState): PlayerAction[];
  step(state: GameState, action: PlayerAction): StepResult;
  render(state: GameState): string;
  isTerminal(state: GameState): boolean;
}
```

Player and model choices must resolve to an available `PlayerAction`. Invalid, missing, malformed, or timed-out model choices must be rejected or fall back deterministically with trace metadata.

## Evidence rules

- Treat `runs/**` as generated evidence, not design truth.
- Do not hand-edit generated comparisons, summaries, dashboards, or static demos when they can be regenerated from traces and scorecards.
- Preserve rejected, blocked, or partial evidence with reasons.
- Scorecards are useful only when backed by trace paths and run facts.
- Reviews must cite observed play, not only design documents.
- Static dashboards and demos present existing evidence; they do not define acceptance facts.

## Validation expectations

For normal code changes, run the relevant focused tests plus the repo gates expected by the active phase. Common gates include:

```sh
pnpm test
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run check
git diff --check
```

For documentation-only phases, run the phase-required checks and any read-only smoke commands that prove command names and evidence surfaces still exist. Do not rename package scripts or change runtime behavior merely to make documentation easier to write.

## Security and LLM boundaries

- Do not commit secrets, local `.env` files, credentials, or unrelated private files.
- Document credential variable names in `.env.example` when adding provider support.
- Validate model JSON before using it.
- Keep reviewer output separate from direct game-state mutation.
- Record credential blockers or fallback behavior honestly in traces, reports, or `PROGRESS.MD`.

## Forbidden scope

Do not silently introduce:

- real-time gameplay
- infinite/no-terminal dungeon modes
- arbitrary text commands as gameplay input
- required external services for gameplay
- required images, audio, browser UI, or generated media
- open-ended LLM world mutation during play
- source-of-truth UI state outside the engine/harness protocol
- acceptance claims without trace-backed evidence
- removed tests as a substitute for fixed behavior

Out-of-scope ideas belong in `PROGRESS.MD` future backlog or a future phase plan.
