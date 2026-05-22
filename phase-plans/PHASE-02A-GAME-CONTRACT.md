# PHASE-02A - Game Contract

## Purpose

Define the stable game engine interface and serializable data types that all future game and harness work must preserve.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-02A-GAMECONTRACT-BUILDING` and the core interface in `02_STRUCTURE_AND_TECH_SPECS.md`.

## Target Outcome

`GameEngine` and core types exist, compile, and support start, render, available-action lookup, stepping, and terminal-state checks.

## In Scope

- `GameEngine` interface.
- `GameState`, `PlayerAction`, `StepResult`, `GameEvent`, `TerminalStatus`, and `GameConfig`.
- Terminal statuses: `ACTIVE`, `WIN`, `LOSS`, `ABORTED`.
- Contract tests for serializable state/action/result shapes.

## Out Of Scope

- Full dungeon mechanics.
- Procedural generation.
- LLM player or reviewer behavior.
- Changing the contract to support arbitrary free-text gameplay.

## Technical Spec

Dependencies: `PHASE-01A-PROJECT-STRUCTURE`.

The engine must expose:

```ts
start(seed: string, config?: GameConfig): GameState
getAvailableActions(state: GameState): PlayerAction[]
step(state: GameState, action: PlayerAction): StepResult
render(state: GameState): string
isTerminal(state: GameState): boolean
```

All public types must be JSON-serializable. `PlayerAction` must include an `id`, a structured `type`, a human-readable `label`, and optional structured `payload`. Invalid actions must be represented through `StepResult.valid === false` and an error, not thrown into the harness as normal flow.

## Deliverables

- `src/game/types.ts`.
- `src/game/engine.ts` contract or minimal implementation.
- Contract tests under `tests/**`.

## Tests And Validation

- `start(seed)` returns a valid `GameState`.
- `render(state)` returns a non-empty string.
- `getAvailableActions(state)` returns an array of explicit actions.
- Every action returned by `getAvailableActions(state)` can be passed to `step(state, action)` without crashing.
- `isTerminal(state)` matches `terminalStatus`.
- `StepResult` can be serialized to JSON and back.

## Acceptance Criteria

- The stable protocol can support both human and agent play.
- No state requires functions, classes, sockets, credentials, or external handles to serialize.
- Later phases can add mechanics without changing the public engine contract casually.

## AI Coder Handoff Notes

Treat this as the protocol boundary. If later gameplay needs more data, add serializable fields without breaking existing harness assumptions.
