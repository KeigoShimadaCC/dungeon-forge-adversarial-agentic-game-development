# Agentic Adversarial Game Development — Structural & Technical Specification

## 1. Technical objective

Build a minimal but extensible system where:

1. A game can be played through a stable text/action interface.
2. A reviewer agent can play the game without direct code access.
3. The reviewer can critique the game based on playthrough traces.
4. A developer agent can modify the game based on review.
5. Tests and harness checks prevent the developer from breaking the core protocol.
6. Every version is saved with trace, review, scorecard, and changelog.

The technical architecture should be simple enough for an MVP, but structured enough to avoid chaos.

## 2. Recommended MVP stack

```text
Language: TypeScript
Runtime: Node.js
Package manager: pnpm
Tests: Vitest
Game format: text/ASCII turn-based dungeon
Reviewer/player agent: LLM API
Developer agent: Claude Code or Codex CLI
Storage: local files
Versioning: Git commits/tags
```

## 3. Why TypeScript

TypeScript is recommended because:

- it supports a clean typed game-state/action interface
- it can later run in a browser UI
- the same game core can power headless agent play and human play
- JSON-heavy state and telemetry are natural
- tests and typechecking help preserve contracts
- the project can later add a lightweight web UI without rewriting the core

Python is acceptable for an ultra-fast prototype, but TypeScript better supports the likely long-term shape: headless game core plus optional browser-playable UI.

## 4. Minimal repository structure

```text
agentic-dungeon/
  package.json
  pnpm-workspace.yaml
  tsconfig.json

  src/
    game/
      engine.ts
      types.ts
      rng.ts
      map.ts
      enemies.ts
      items.ts
      combat.ts
      render.ts

    harness/
      run-playthrough.ts
      evaluate.ts
      reviewer-client.ts
      save-run.ts

    agents/
      prompts/
        developer.md
        reviewer.md

  content/
    items.json
    enemies.json
    floor-rules.json
    events.json

  tests/
    engine.test.ts
    contract.test.ts
    regression-seeds.test.ts

  runs/
    v001/
    v002/

  docs/
    NORTH_STAR.md
    RULES.md
```

This is enough for the MVP.

Avoid initially:

- database
- dashboard
- plugin framework
- complex permission engine
- full sandbox orchestrator
- multiple specialized subagents
- image/audio asset pipelines

## 5. Core game interface

The game must expose a stable interface.

```ts
export interface GameEngine {
  start(seed: string, config?: GameConfig): GameState;
  getAvailableActions(state: GameState): PlayerAction[];
  step(state: GameState, action: PlayerAction): StepResult;
  render(state: GameState): string;
  isTerminal(state: GameState): boolean;
}
```

Every game version must preserve this interface.

## 6. Core data types

```ts
export type TerminalStatus = "ACTIVE" | "WIN" | "LOSS" | "ABORTED";

export interface GameState {
  version: string;
  seed: string;
  turn: number;
  floor: number;
  terminalStatus: TerminalStatus;

  player: {
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    hunger?: number;
    inventory: string[];
  };

  map: {
    width: number;
    height: number;
    tiles: Tile[][];
  };

  enemies: EnemyInstance[];
  items: ItemInstance[];
  log: string[];

  meta: {
    maxTurns: number;
    objective: string;
  };
}

export interface PlayerAction {
  id: string;
  type:
    | "move"
    | "attack"
    | "wait"
    | "use_item"
    | "pickup"
    | "descend"
    | "talk"
    | "inspect";
  label: string;
  payload?: Record<string, unknown>;
}

export interface StepResult {
  state: GameState;
  events: GameEvent[];
  valid: boolean;
  error?: string;
}
```

The exact fields can change, but the shape should remain explicit and serializable.

## 7. MVP game design

Initial game:

```text
Name: Seven Floors to Dawn
Genre: micro Mystery Dungeon
Format: turn-based text/ASCII dungeon
Floors: 5
Grid: small, e.g. 8x8 or 10x10
Goal: reach final shrine and escape
Lose: HP reaches 0 or max turns exceeded
Randomness: seeded
```

Initial mechanics:

- player movement
- enemy movement
- melee attack
- HP
- stairs
- items
- simple enemy AI
- ASCII rendering
- win/loss condition
- max turn limit

## 8. Stable constraints

Developer must preserve:

```text
- text/ASCII output
- structured action input
- turn-based execution
- seeded randomness
- explicit WIN / LOSS / ABORTED terminal states
- max turn limit
- serializable game state
- reviewer-playable interface
```

Developer must not introduce:

```text
- real-time input
- image-only output
- voice/audio requirement
- infinite floors
- no-ending sandbox mode
- arbitrary free-text action parser
- external API dependency during play
- engine rewrite that breaks harness
```

## 9. Agent architecture

### 9.1 Reviewer / Player Agent

The reviewer agent is API-based.

It does not edit files.

It receives:

```json
{
  "rendered_state": "ASCII/text render here",
  "state_summary": {},
  "available_actions": [],
  "recent_log": [],
  "persona": "careful_player"
}
```

It returns:

```json
{
  "action_id": "use_smoke_bomb",
  "reason": "HP is low and an enemy is adjacent."
}
```

After the playthrough, it receives the trace and returns a review:

```json
{
  "summary": "The game is playable but combat is repetitive.",
  "fun_score": 6,
  "clarity_score": 7,
  "fairness_score": 6,
  "top_issues": [
    {
      "severity": "major",
      "observation": "Most turns were simple attack/move decisions.",
      "recommendation": "Add more tactical item effects."
    }
  ],
  "suggested_next_changes": [
    "Add one panic item.",
    "Add one enemy with different behavior.",
    "Improve ASCII map legend."
  ]
}
```

### 9.2 Developer Agent

The developer agent is a coding agent such as Claude Code or Codex CLI.

It receives:

- current review
- current game rules
- allowed/disallowed changes
- test commands
- target scope

It edits the repo, then tests are run.

The developer should be asked to implement only one to three changes per loop.

Example task:

```text
Improve v0.2 based on the reviewer report.

Allowed:
- add items
- tune enemies
- improve ASCII render
- add simple events

Forbidden:
- change GameEngine interface
- remove seed determinism
- remove terminal states
- add image/audio dependencies
- add infinite floors

Implement at most 3 improvements.
Run tests.
Write changelog.
```

### 9.3 Harness

The harness is deterministic code.

It owns:

- running the game
- asking reviewer agent for actions
- saving traces
- generating scorecards
- running tests
- rejecting broken versions

The harness must not rely on the developer agent’s self-report.

## 10. Recommended agent call strategy

### Use LLM API for

- choosing player actions
- reviewing traces
- producing critique
- scoring subjective dimensions
- suggesting bounded changes

### Use coding agents for

- implementing actual code changes
- fixing bugs
- adding mechanics
- updating tests
- writing changelog

### Do not use coding agents for every small decision

For cheap changes, let the API propose structured JSON patches and apply them manually or through deterministic scripts later.

In the MVP, it is acceptable to keep this manual:

1. Reviewer produces critique.
2. Human selects changes.
3. Coding agent implements.
4. Harness tests.

Automation can be added later.

## 11. Harness flow

```text
1. Build/check game.
2. Start game with seed.
3. Render state.
4. Send state + available actions to reviewer agent.
5. Receive action.
6. Step game.
7. Save event to trace.
8. Repeat until WIN / LOSS / ABORTED / max turns.
9. Send trace to reviewer agent.
10. Save review.
11. Generate scorecard.
12. Developer agent implements next version.
13. Run tests and regression seeds.
14. Accept or reject version.
```

## 12. Playthrough trace format

```json
{
  "version": "v001",
  "seed": "seed_001",
  "persona": "careful_player",
  "result": "WIN",
  "turns": 134,
  "steps": [
    {
      "turn": 1,
      "render": "ASCII render",
      "available_actions": ["move_north", "move_east", "wait"],
      "chosen_action": "move_east",
      "reason": "The east corridor is unexplored.",
      "events": ["You move east."]
    }
  ]
}
```

## 13. Scorecard format

```json
{
  "version": "v001",
  "seed": "seed_001",
  "result": "WIN",
  "turns": 134,
  "floors_reached": 5,
  "damage_taken": 31,
  "items_used": 3,
  "enemies_defeated": 7,
  "invalid_actions": 0,
  "softlocks": 0,
  "reviewer_scores": {
    "fun": 6,
    "clarity": 7,
    "fairness": 6,
    "tactical_depth": 5,
    "replay_value": 6
  }
}
```

## 14. Tests to keep from day one

Minimum tests:

```text
- start(seed) returns valid state
- render(state) returns non-empty string
- getAvailableActions(state) returns valid actions
- every available action can be passed to step()
- terminal states are explicit
- game aborts at max turns
- fixed seed produces reproducible initial state
- simple random policy cannot crash game
```

Regression seeds:

```text
seed_001: normal balanced seed
seed_002: enemy-heavy seed
seed_003: item-sparse seed
seed_004: stairs-far seed
seed_005: trap/item-heavy seed
```

## 15. Version acceptance rule

A new version is accepted only if:

```text
1. Typecheck passes.
2. Tests pass.
3. Fixed-seed simulations run.
4. Reviewer can play without protocol failure.
5. Game reaches WIN / LOSS / ABORTED, not an undefined state.
6. No forbidden feature was introduced.
7. Changelog explains what changed.
```

A version is rejected if:

```text
- game does not start
- action/state interface breaks
- reviewer cannot play
- terminal state disappears
- infinite mode replaces finite mode
- image/audio dependency becomes required
- real-time input is introduced
- tests are removed instead of fixed
```

## 16. MVP development phases

### Phase 0 — Skeleton

- TypeScript project
- game interface
- seedable RNG
- minimal tests

### Phase 1 — Playable dungeon

- grid
- player
- enemies
- stairs
- HP
- win/loss
- ASCII renderer

### Phase 2 — Harness

- run seeded playthrough
- save trace
- deterministic random player
- basic scorecard

### Phase 3 — API reviewer

- reviewer chooses actions
- reviewer writes critique after trace
- save review

### Phase 4 — Developer loop

- coding agent receives review
- implements 1–3 changes
- tests run
- changelog saved

### Phase 5 — Repeat and compare

- run v001, v002, v003
- compare traces and reviews
- decide whether adversarial loop improved the game

## 17. Future layers

Only after the MVP loop works:

- multiple reviewer personas
- structured patch proposals
- automatic JSON patching
- worktree-based coding agent isolation
- plugin system
- browser UI
- human playtesting
- dashboard
- richer scenario systems
- content generation constraints
- visual/audio experiments

The first implementation should stay small.
