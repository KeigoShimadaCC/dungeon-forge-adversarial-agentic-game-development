# Dungeon Forge: Adversarial Agentic Game Development

Dungeon Forge is a planned local-first research and development testbed for building a small, finite, text/ASCII turn-based game through an adversarial agent loop. One agent acts as the game developer. Another agent acts as the player/reviewer. The reviewer must play the game through a stable interface, produce critique grounded in trace evidence, and pressure the developer toward better versions without breaking the protocol.

The project is intentionally bounded. The goal is not to create a large commercial game engine, a full autonomous game studio, or an open-ended LLM world simulator. The goal is to prove that a small playable game can improve over multiple versions while preserving deterministic gameplay, measurable evidence, and human-governed acceptance.

## Current Status

This repository is currently in the planning / early scaffold stage.

- Design truth lives in `concept-and-ideas/`.
- Implementation contracts live in `phase-plans/`.
- Agent coordination lives in `PROGRESS.MD`.
- No TypeScript app scaffold exists yet.
- Do not run install commands until `package.json` exists.

The active phase recorded in `PROGRESS.MD` is:

```text
phase-plans/PHASE-01A-PROJECT-STRUCTURE.md
```

Phase 01A is expected to create the initial TypeScript, Node.js, pnpm, and Vitest project skeleton.

## 1. High Super High Level Summary

Dungeon Forge asks one central question:

```text
Can an adversarial developer/reviewer agent loop improve a small playable game over multiple versions while preserving a stable game protocol and producing measurable evidence of improvement?
```

At the highest level, the system works like this:

```text
Developer agent creates or improves a game version
  -> Harness runs the game through a stable text/action interface
  -> Player/reviewer agent actually plays the game
  -> Trace evidence is saved
  -> Reviewer critiques what happened during play
  -> Developer receives a scoped improvement task
  -> Tests, simulations, traces, scorecards, and acceptance checks decide whether the new version is accepted
```

The first target game is a small Mystery Dungeon-style roguelike:

- finite floors
- turn-based movement and combat
- text/ASCII rendering
- structured actions rather than free-form commands
- seeded randomness
- explicit `WIN`, `LOSS`, and `ABORTED` terminal states
- local traces, reviews, scorecards, changelogs, and acceptance reports

The game is the test subject. The real product is the repeatable loop that turns actual play evidence into bounded, testable game improvements.

## 2. Business Level Description For Non-Engineers

### What This Project Is

Dungeon Forge is an experiment in AI-assisted creative production. It tests whether AI agents can collaborate in a disciplined way to improve a product over time.

Instead of asking one AI to invent a game in one shot, the project separates responsibilities:

- A developer agent builds or changes the game.
- A player/reviewer agent plays the game like a customer, critic, bug hunter, or genre-aware reviewer.
- A harness records what happened during play.
- A human owner remains the final decision maker.

This is similar to a tiny game studio feedback loop:

```text
Build -> Playtest -> Review -> Plan improvement -> Implement -> Verify -> Compare
```

The difference is that the loop is designed for agents from the beginning. The game is small enough that agents can play it, inspect it, and improve it without relying on screenshots, audio, reaction timing, or vague design documents.

### Why A Small Text Game

The project deliberately starts with a text/ASCII turn-based dungeon rather than a visually polished game.

This keeps the experiment measurable:

- A text game can be played by both humans and agents.
- Turn-based actions avoid timing and input-lag problems.
- Seeded randomness makes the same scenario reproducible.
- A finite ending makes runs comparable.
- Structured actions prevent the reviewer from inventing impossible moves.
- Local trace files show exactly what happened.

That constraint is a feature. It makes the game a good benchmark for whether agent feedback can produce real, versioned improvement.

### What The Project Produces

When fully built, each version of the game should produce a local evidence bundle:

- playable game code and content
- playthrough traces
- reviewer critiques
- developer patch plans or task handoffs
- scorecards
- changelogs
- developer notes
- acceptance or rejection decisions
- version comparison reports

The important output is not just "v002 feels better than v001." The important output is:

```text
v001 was played.
The reviewer found specific issues from trace evidence.
The developer changed specific systems in response.
v002 was played again.
The traces and scorecards show what changed.
The acceptance report explains whether the version passed.
```

### Business Value

Dungeon Forge is useful as a small, controlled testbed for questions that matter in agentic software and creative production:

- Can agents improve a product through repeated critique and implementation?
- Can AI-generated feedback be grounded in real usage rather than abstract opinions?
- Can a system prevent agents from expanding scope into untestable work?
- Can agent-generated improvements be accepted or rejected based on evidence?
- Can a human supervise an automated iteration loop without manually rediscovering every detail?

The project can eventually inform workflows for:

- AI playtesting
- automated QA
- structured product critique
- AI-assisted game design
- agent governance
- version acceptance gates
- trace-based evaluation of creative systems

The first milestone is intentionally modest: prove that a bounded adversarial loop can make a small game better across at least three versions.

### What Success Looks Like

The MVP succeeds when it demonstrates:

1. A first game version is playable but shallow.
2. A reviewer agent plays it and produces critique from evidence.
3. A developer agent implements one to three scoped improvements.
4. The next version remains playable and protocol-compatible.
5. Reviewer play identifies the changed experience.
6. At least one trace, scorecard, or metric changes meaningfully.
7. The process repeats across at least three versions.
8. The game remains finite, turn-based, text/ASCII-first, seedable, and structured-action based.

### What This Project Intentionally Avoids

The MVP should not become:

- a commercial game engine
- a real-time action game
- an image/audio asset pipeline
- an infinite open-world simulator
- a browser dashboard-first project
- a free-form LLM roleplaying world
- a system where reviewer output directly mutates game state
- a system where scorecards replace trace evidence

The project is governed by a simple principle:

```text
Build the smallest stable adversarial loop first, then expand gameplay depth and automation.
```

## 3. Technical Details

### Source Of Truth

The repository has three layers of guidance:

| Path | Purpose |
| --- | --- |
| `concept-and-ideas/01_NORTH_STAR_AND_VISION.md` | Product vision, invariants, bounded creative freedom, success criteria |
| `concept-and-ideas/02_STRUCTURE_AND_TECH_SPECS.md` | Planned stack, architecture, game interface, data shapes, harness flow |
| `concept-and-ideas/03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md` | Example version loops, reviewer/developer handoffs, version artifacts |
| `concept-and-ideas/04_HIGH_LEVEL_PROJECT_PHASES.md` | Layered roadmap, dependency graph, phase progression |
| `phase-plans/PHASE-00A-PLAN-STANDARDS-AND-GLOBAL-INVARIANTS.md` | Global implementation rules and forbidden MVP scope |
| `phase-plans/PHASE-01A-...` through `PHASE-12A-...` | Granular implementation contracts |
| `PROGRESS.MD` | Live coordination file for active phase, task queue, checklist, validation log |
| `AGENTS.md` and `CLAUDE.md` | Agent operating rules for this repository |

Treat `concept-and-ideas/` and `phase-plans/` as design truth. Treat `PROGRESS.MD` as live handoff state, not the canonical product design.

### Planned Stack

The planned MVP stack is:

| Layer | Planned Choice |
| --- | --- |
| Language | TypeScript |
| Runtime | Node.js |
| Package manager | pnpm |
| Test framework | Vitest |
| Game format | finite text/ASCII turn-based dungeon |
| Reviewer/player agent | LLM API, behind a validated adapter |
| Developer agent | Codex CLI, Claude Code, or similar coding agent |
| Storage | local files |
| Versioning | Git commits/tags plus local `runs/vXXX/` evidence |

Gameplay itself must run without API credentials. LLM calls may help reviewer behavior, but the game engine and baseline harness checks must be usable locally without model access.

### Planned Repository Boundaries

The planned architecture is intentionally small:

```text
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
  v003/

docs/
  NORTH_STAR.md
  RULES.md
```

Boundary rules:

- `src/game/**` owns game rules, state transitions, seeded randomness, rendering, and serializable state.
- `src/harness/**` owns playthrough execution, trace saving, scorecards, reviewer client boundaries, and validation.
- `src/agents/prompts/**` owns prompt templates, not game logic.
- `content/**` owns finite static data such as items, enemies, floor rules, and events.
- `tests/**` owns contract, engine, harness, content, and regression-seed coverage.
- `runs/**` owns generated evidence and should not become design truth.

### Stable Game Engine Contract

Future game versions must preserve this public interface:

```ts
export interface GameEngine {
  start(seed: string, config?: GameConfig): GameState;
  getAvailableActions(state: GameState): PlayerAction[];
  step(state: GameState, action: PlayerAction): StepResult;
  render(state: GameState): string;
  isTerminal(state: GameState): boolean;
}
```

Core terminal states:

```ts
export type TerminalStatus = "ACTIVE" | "WIN" | "LOSS" | "ABORTED";
```

Actions are structured. The reviewer chooses from available actions; it does not send arbitrary text commands.

```ts
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
```

Invalid actions should be represented as `StepResult.valid === false` with an error, not as ordinary uncaught exceptions in the harness.

### Core Game Invariants

Every accepted version must preserve these invariants:

- The game is finite.
- Terminal states are explicit: `ACTIVE`, `WIN`, `LOSS`, `ABORTED`.
- Output is text/ASCII first.
- Input is structured through available actions.
- Play is turn-based.
- Randomness is seeded and reproducible.
- Game state is serializable and inspectable.
- The reviewer must play before critique.
- Reviewer critique must cite trace evidence.
- Gameplay must run without API credentials.
- Reviewer output must not mutate game state directly.
- Every accepted version stores trace, review, scorecard, patch plan or developer task, changelog, developer notes, and acceptance decision artifacts.

### Forbidden MVP Scope

The MVP must not introduce:

- real-time combat
- timing-sensitive input
- image-only output
- required audio or voice
- generated media dependencies
- infinite floors
- no-ending sandbox play
- arbitrary free-text gameplay commands
- arbitrary LLM-generated world or story changes during play
- external API dependency during gameplay
- engine rewrites that break the stable game/harness protocol

Reviewer requests that conflict with these constraints should be translated into bounded alternatives.

Examples:

| Reviewer Request | Bounded Translation | Rejected Translation |
| --- | --- | --- |
| "I want visuals." | Improve ASCII map, legend, HUD, and log readability. | Require sprites, screenshots, or generated images. |
| "Characters feel shallow." | Add finite NPC dialogue choices and traceable events. | Add open-ended LLM NPC conversations. |
| "I want more replayability." | Add finite seeded variants or challenge seeds. | Add endless dungeon mode with no final state. |
| "Combat is boring." | Add turn-based tactical items and enemy behaviors. | Add real-time dodging or reaction combat. |

### Initial Game Target

The initial playable game is expected to be a small Mystery Dungeon-style roguelike, often described in the planning docs as `Seven Floors to Dawn`.

Initial design:

```text
Name: Seven Floors to Dawn
Genre: micro Mystery Dungeon
Format: turn-based text/ASCII dungeon
Floors: 5
Grid: small, such as 8x8 or 10x10
Goal: reach the final shrine/stairs and escape
Loss: HP reaches 0
Abort: max turns exceeded or invalid state detected
Randomness: seeded
```

Initial mechanics:

- player movement
- walls and floors
- stairs/floor progression
- HP
- melee attack
- Slime enemy
- Potion item
- pickup/use item
- enemy action
- max-turn abort
- ASCII render
- explicit win/loss condition

Fun is not the main goal of the earliest implementation. Stability, terminal behavior, seeded reproducibility, and testability matter first.

### ASCII Rendering

The renderer returns a plain string from `render(state)`.

Example target shape:

```text
Floor 1 / Turn 3

########
#@..s..#
#..#...#
#...>..#
########

HP 18/20
Inventory: Potion

Legend:
@ You
s Slime
> Stairs
# Wall
. Floor

Log:
- You moved east.
- The slime approaches.
```

Rendering must be deterministic for the same state and must not mutate game state.

### Seeded Randomness

Randomness is allowed and encouraged, but all procedural decisions must be reproducible.

The planned RNG layer should support:

- random float
- bounded integer
- deterministic shuffle
- deterministic weighted choice

Game logic should not call `Math.random()` directly. Any function that needs randomness should receive seeded RNG state or derive it from serializable game state.

Canonical regression seeds:

| Seed | Purpose |
| --- | --- |
| `seed_001` | normal balanced seed |
| `seed_002` | enemy-heavy seed |
| `seed_003` | item-sparse seed |
| `seed_004` | stairs-far seed |
| `seed_005` | trap/item-heavy seed |

### Baseline Players

Before LLM reviewer play is introduced, the project should add deterministic non-LLM baseline players for cheap smoke testing.

Planned baseline policies:

- random valid-action player
- stairs-seeking player
- cautious low-HP player
- greedy item-picker player

These policies are not meant to be strong players. They are test instruments for:

- crash detection
- softlock detection
- invalid action loops
- terminal-state coverage
- fixed-seed reproducibility

### LLM Reviewer / Player

The reviewer/player agent can use an LLM API after the harness exists, but it must only choose from explicit available actions.

Input shape:

```json
{
  "render": "...",
  "available_actions": [],
  "recent_log": [],
  "persona": "careful_player"
}
```

Expected output:

```json
{
  "action_id": "move_east",
  "reason": "The east corridor is unexplored."
}
```

The adapter must validate model output before use. Invalid JSON, missing action IDs, unavailable actions, and timeouts should fall back to deterministic safe behavior and record the failure in trace metadata.

Initial personas:

| Persona | Purpose |
| --- | --- |
| `careful_player` | reads state carefully and tries to win |
| `naive_player` | plays plausibly but may miss tactical details |
| `bug_hunter` | probes edge cases, invalid choices, and unclear states |

### Reviewer Critic

After a playthrough, the reviewer critic consumes trace evidence and scorecard context.

Reviewer input includes:

- trace JSON
- scorecard
- key rendered states
- persona

Reviewer output should include:

- summary
- scores for fun, clarity, fairness, tactical depth, and replay value
- top issues
- severity
- observation
- diagnosis
- recommendation
- suggested next changes
- trace evidence references such as turn numbers or observed outcomes

Reviews must be based on actual playthrough evidence, not design docs alone.

### Developer Agent Workflow

The developer agent receives bounded implementation work derived from reviewer evidence.

A developer task should include:

- previous review path
- previous scorecard path
- target version
- target scope
- allowed changes
- forbidden changes
- required test commands
- required patch plan path
- required changelog path
- expected implementation summary

The developer should implement one to three scoped changes per loop. The reviewer can request broad improvements, but the developer task must translate those into bounded changes that preserve global invariants.

### Harness Flow

The harness is deterministic infrastructure around the game. It owns playthrough execution and evidence generation.

Target flow:

```text
1. Build/check game.
2. Start game with seed.
3. Render state.
4. Get available actions.
5. Ask baseline player or reviewer agent to choose an action.
6. Validate the action.
7. Step the game.
8. Save event to trace.
9. Repeat until WIN, LOSS, ABORTED, or max turns.
10. Generate scorecard.
11. Ask reviewer critic to review trace when available.
12. Save review.
13. Generate developer task or patch plan.
14. Run tests and fixed-seed simulations.
15. Accept or reject the version with evidence.
```

The harness must not rely on developer self-report. It should inspect the actual engine behavior, generated traces, and required artifacts.

### Trace Format

Canonical trace JSON should include:

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
      "valid": true,
      "events": ["You move east."],
      "terminalStatus": "ACTIVE"
    }
  ]
}
```

Traces are core evidence. They make reviews, scorecards, and version comparisons auditable.

### Scorecards

Scorecards combine objective metrics from traces with subjective reviewer scores when available.

Objective metrics:

- result
- turns
- floors reached
- damage taken
- enemies defeated
- items used
- invalid actions
- softlocks or abort reasons

Subjective metrics:

- fun
- clarity
- fairness
- tactical depth
- replay value

Canonical scorecards should remain tied to trace and review source paths. They are comparison aids, not proof by themselves.

### Version Evidence Model

A version is more than a git commit. It is a local evidence bundle.

Target structure:

```text
runs/
  v003/
    traces/
      seed_001_careful_player.json
      seed_002_naive_player.json
      seed_003_bug_hunter.json

    reviews/
      review_careful_player.md
      review_naive_player.md
      review_bug_hunter.md

    scorecards/
      seed_001_scorecard.json
      seed_002_scorecard.json
      seed_003_scorecard.json

    patch_plan.md
    changelog.md
    developer_notes.md
    acceptance.md
```

Rejected versions should remain as evidence with reasons. Generated comparisons should be regenerated from traces and scorecards where possible rather than hand-edited.

### Version Acceptance Rules

A new version is accepted only if:

1. Typecheck passes.
2. Tests pass.
3. Fixed-seed simulations run.
4. Reviewer can play when reviewer layer is available.
5. The game reaches `WIN`, `LOSS`, or `ABORTED`, not an undefined state.
6. Required traces, reviews, scorecards, changelog, patch plan, and developer notes exist for the version scope.
7. No forbidden MVP feature was introduced.
8. Changelog explains what changed.
9. Human owner approves the final acceptance decision.

A version should be rejected or blocked if:

- the game does not start
- the action/state interface breaks
- reviewer cannot play
- terminal state disappears
- infinite mode replaces finite play
- required image/audio or external service dependency appears
- real-time input is introduced
- tests are removed instead of fixed
- evidence artifacts are missing
- scorecards are used without trace support

### Definition Of Improvement

A later version is better when evidence shows one or more of:

- reviewer completion becomes more reliable
- failures become more explainable
- bugs, invalid actions, protocol failures, or softlocks decrease
- win/loss rate moves closer to target
- tactical item, enemy, map, or story systems appear in traces and are used meaningfully
- reviewer confusion decreases
- critique moves from basic usability problems to deeper design issues
- a prior high-severity issue is explicitly addressed
- the game remains finite, playable, seedable, and harness-compatible

Subjective fun matters, but it should be tied to observed play.

### Phase Roadmap

The project is split into coding-agent-sized phases. Each phase should be small enough to build, test, and document in a bounded session.

| Phase | Purpose | Depends On |
| --- | --- | --- |
| `PHASE-00A` | Plan standards and global invariants | none |
| `PHASE-01A` | TypeScript project structure, pnpm, Vitest, folders, initial docs | none |
| `PHASE-02A` | Stable game contract and serializable types | `PHASE-01A` |
| `PHASE-02B` | Seeded RNG utility | `PHASE-01A` |
| `PHASE-02C` | Initial content data for items, enemies, floor rules | `PHASE-01A` |
| `PHASE-03A` | Minimal playable finite dungeon | `PHASE-02A`, `PHASE-02B`, `PHASE-02C` |
| `PHASE-04A` | ASCII renderer | `PHASE-03A` |
| `PHASE-04B` | Baseline non-LLM players | `PHASE-03A` |
| `PHASE-05A` | Headless playthrough harness, traces, basic scorecards | `PHASE-03A`, `PHASE-04A`, `PHASE-04B` |
| `PHASE-06A` | LLM player adapter with validated action selection | `PHASE-05A` |
| `PHASE-06B` | Trace-grounded reviewer critic | `PHASE-05A` |
| `PHASE-06C` | Objective and subjective scorecards | `PHASE-05A`, `PHASE-06B` |
| `PHASE-07A` | Version folders, comparison, evidence bundle | `PHASE-06A`, `PHASE-06B`, `PHASE-06C` |
| `PHASE-08A` | Developer-agent handoff workflow and templates | `PHASE-07A` |
| `PHASE-09A` | Tactical items | `PHASE-03A`, `PHASE-07A` |
| `PHASE-09B` | Enemy variety | `PHASE-03A`, `PHASE-07A` |
| `PHASE-09C` | Seeded procedural map generation | `PHASE-02B`, `PHASE-03A`, `PHASE-07A` |
| `PHASE-10A` | Light narrative, finite dialogue, events | `PHASE-07A`, preferably after `PHASE-09A/B/C` |
| `PHASE-10B` | Balance tuning across seeds and policies | `PHASE-07A`, preferably after `PHASE-09A/B/C` |
| `PHASE-11A` | Acceptance gate and report generation | `PHASE-07A`, `PHASE-08A` |
| `PHASE-12A` | End-to-end v001 -> v002 -> v003 demo loop | `PHASE-01A` through `PHASE-11A` |

Conceptual progression:

```text
Project structure
  -> Game engine contract
  -> Seeded, playable micro-dungeon
  -> ASCII rendering and baseline players
  -> Headless harness
  -> LLM player and trace-grounded critic
  -> Versioned evidence loop
  -> Developer-agent workflow
  -> Gameplay depth
  -> Balance and narrative layers
  -> Acceptance gate
  -> End-to-end demo
```

### Parallelization Plan

After `PHASE-01A`, some work can be parallelized:

```text
Wave 1:
  PHASE-02A, PHASE-02B, PHASE-02C

Wave 2:
  PHASE-04A, PHASE-04B after PHASE-03A

Wave 3:
  PHASE-06A, PHASE-06B, PHASE-06C after PHASE-05A

Wave 4:
  PHASE-09A, PHASE-09B, PHASE-09C after PHASE-07A

Wave 5:
  PHASE-10A and PHASE-10B after version loop and preferably after gameplay-depth phases
```

The project should still be integrated through the phase contracts and `PROGRESS.MD` so agents do not overwrite each other or silently broaden scope.

### Testing Strategy

Minimum tests from the start:

- `start(seed)` returns valid state
- `render(state)` returns a non-empty string
- `getAvailableActions(state)` returns explicit actions
- every available action can be passed to `step`
- terminal states are explicit
- max turns produce `ABORTED`
- fixed seed produces reproducible state
- random/baseline policy cannot crash the game

Additional phase-specific expectations:

- RNG changes prove same seed means same sequence.
- Content changes validate required fields.
- Engine mechanics test movement, walls, combat, items, stairs, and terminal conditions.
- Renderer tests verify tactical readability and terminal rendering.
- Harness tests verify trace and scorecard shape.
- Reviewer tests use mocked model responses and validate malformed/invalid output handling.
- Version-loop tests verify artifact paths and comparison shape.
- Acceptance-gate tests verify missing/failing evidence is reported.

Never remove tests to pass a phase.

### Commands

Current useful commands before scaffold exists:

```sh
git status --short --branch
rg "<term>" concept-and-ideas phase-plans
find . -maxdepth 3 -type f -print | sort
```

Planned commands after `package.json` exists:

```sh
pnpm test
pnpm run typecheck
pnpm run lint
```

Planned harness/regression commands will be defined by later phases. Do not claim game or harness completion until fixed-seed checks exist and pass or a concrete blocker is recorded.

### Working Rules For Agents

When doing phase-scoped work:

1. Read `PROGRESS.MD`.
2. Read `phase-plans/PHASE-00A-PLAN-STANDARDS-AND-GLOBAL-INVARIANTS.md`.
3. Read the active phase plan.
4. Add or claim a task in the `PROGRESS.MD` task queue.
5. Keep scope limited to the active phase unless the user explicitly expands it.
6. Update tests with behavior changes.
7. Append validation evidence to `PROGRESS.MD`.
8. Do not mark phase acceptance complete until acceptance criteria are rechecked against the repo.

Current repository guardrails:

- Do not run install commands before `package.json` exists.
- Do not add browser UI, database, Docker, dashboard, plugin framework, or deployment in early phases.
- Do not add external-service gameplay dependencies.
- Do not make UI the source of truth.
- Preserve generated evidence under `runs/**` once it exists.

### Security And Credentials

The game must run without API credentials.

If future reviewer LLM calls require credentials:

- do not commit secrets
- do not commit local `.env` files
- document variable names in `.env.example`
- validate model JSON before using it
- record fallback behavior when the model fails
- keep reviewer output separate from direct game-state mutation

### End-To-End Demo Target

The final MVP demo should include at least three real versions:

```text
v001: basic playable dungeon
v002: reviewer-driven tactical improvement
v003: reviewer-driven clarity, balance, or story improvement
```

Each version should include:

- traces
- reviews
- scorecards
- patch plans
- changelogs
- developer notes
- acceptance reports
- comparison summary

The demo should prove:

```text
Version N was played.
Version N was criticized.
Version N+1 changed because of that critique.
Version N+1 remained playable.
The difference is visible in trace, review, scorecard, and changelog.
```

Do not fake the loop. If a reviewer run, test, or comparison is blocked, keep the demo partial and record the blocker.

## Glossary

| Term | Meaning |
| --- | --- |
| Game engine | The stable game module exposing `start`, `getAvailableActions`, `step`, `render`, and `isTerminal` |
| Harness | Headless system that runs playthroughs, validates actions, saves traces, and generates scorecards |
| Reviewer/player agent | Agent that plays the game through available actions and later critiques trace evidence |
| Developer agent | Coding agent that implements scoped improvements from reviewer evidence |
| Trace | Turn-by-turn record of rendered state, available actions, chosen action, events, and terminal status |
| Scorecard | Comparable run/version metrics derived from trace and optional reviewer scores |
| Patch plan | Bounded implementation plan created from reviewer evidence before a developer change |
| Acceptance report | Version-level pass/fail/blocker report based on tests, traces, artifacts, and invariants |
| Regression seed | Fixed seed used to reproduce and compare known gameplay scenarios |
| Structured action | Explicit action object chosen from `getAvailableActions`, not arbitrary text |

## Reading Order

For a new contributor or agent:

1. Read this `README.md`.
2. Read `PROGRESS.MD` for active status.
3. Read `phase-plans/PHASE-00A-PLAN-STANDARDS-AND-GLOBAL-INVARIANTS.md`.
4. Read the active phase plan listed in `PROGRESS.MD`.
5. Read the relevant concept docs for product intent.
6. Only then edit implementation files.

For product context:

1. `concept-and-ideas/01_NORTH_STAR_AND_VISION.md`
2. `concept-and-ideas/02_STRUCTURE_AND_TECH_SPECS.md`
3. `concept-and-ideas/03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`
4. `concept-and-ideas/04_HIGH_LEVEL_PROJECT_PHASES.md`

For implementation:

1. `phase-plans/PHASE-00A-PLAN-STANDARDS-AND-GLOBAL-INVARIANTS.md`
2. Active phase plan from `PROGRESS.MD`
3. `AGENTS.md`
4. `CLAUDE.md`
