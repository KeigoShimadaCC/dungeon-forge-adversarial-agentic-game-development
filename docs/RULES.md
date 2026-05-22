# Rules (scaffold mirror)

Canonical invariants live in `phase-plans/PHASE-00A-PLAN-STANDARDS-AND-GLOBAL-INVARIANTS.md` and `concept-and-ideas/`.

## Non-negotiables for future implementation

1. **Finite game** — explicit terminal states: `ACTIVE`, `WIN`, `LOSS`, `ABORTED`.
2. **Text/ASCII output** — no required images or audio.
3. **Structured actions** — choose from explicit available actions, not arbitrary free text.
4. **Turn-based play** — no real-time or reaction-based input.
5. **Seeded randomness** — reproducible by seed.
6. **Stable interface** — `start`, `getAvailableActions`, `step`, `render`, `isTerminal`.
7. **Reviewer plays first** — critique grounded in playthrough traces.
8. **Harness validates versions** — developer self-report is not proof.
9. **Versioned artifacts** — traces, reviews, scorecards, changelogs per version.

## Phase 01A scope boundary

This repository slice is scaffold-only: TypeScript, pnpm, Vitest, lint/typecheck scripts, and importable placeholders. No dungeon mechanics, harness playthroughs, LLM integration, or generated `runs/**` evidence yet.
