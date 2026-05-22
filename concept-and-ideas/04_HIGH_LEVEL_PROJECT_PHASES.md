# 04 — High-Level Project Phases

## Agentic Adversarial Game Development

## 1. Purpose

This report defines the high-level build phases for the **Agentic Adversarial Game Development** project.

The goal is to break the system into coding-agent-sized phases. Each phase should be small enough for one medium-sized coding agent session to build, check, test, and document.

The build philosophy is:

> Build the smallest stable adversarial loop first, then expand gameplay depth and automation.

The core loop is:

```text
Game Developer Agent creates or improves a game version
    ↓
Game Player / Reviewer Agent plays the game
    ↓
Reviewer critiques the actual playthrough
    ↓
Developer applies scoped improvements
    ↓
Harness tests and records the new version
```

---

# 2. Phase naming convention

Each phase uses this convention:

```text
PHASE-XX-NAME-BUILDING
```

Example:

```text
PHASE-01-PROJECTSTRUCTURE-BUILDING
```

If phases can be done in parallel, use letter suffixes:

```text
PHASE-02A-GAMECONTRACT-BUILDING
PHASE-02B-SEEDEDRNG-BUILDING
PHASE-02C-CONTENTDATA-BUILDING
```

Each phase should include:

```text
1. Goal
2. What to build
3. How to build it
4. Dependencies
5. Tests/checks
6. Output artifact
```

---

# 3. Critical build principle

Do not start by building a large autonomous AI game studio.

Start by proving:

```text
A small finite game can be built, played by an agent, reviewed by an agent, improved by a coding agent, and compared across versions.
```

The first build priorities are:

```text
1. Stable repo structure
2. Stable game contract
3. Deterministic seeded game logic
4. Minimal playable dungeon
5. Headless harness
6. Reviewer agent playthrough
7. Versioned review/scorecard loop
8. Developer-agent improvement workflow
```

Only after this works should the system add richer gameplay and more automation.

---

# 4. Dependency overview

## 4.1 Main dependency graph

```text
PHASE-01
  ↓
PHASE-02A, PHASE-02B, PHASE-02C
  ↓
PHASE-03
  ↓
PHASE-04A, PHASE-04B
  ↓
PHASE-05
  ↓
PHASE-06A, PHASE-06B, PHASE-06C
  ↓
PHASE-07
  ↓
PHASE-08
  ↓
PHASE-09A, PHASE-09B, PHASE-09C
  ↓
PHASE-10A, PHASE-10B
  ↓
PHASE-11
  ↓
PHASE-12
```

## 4.2 Conceptual progression

```text
Project structure
→ Game engine contract
→ Playable micro-dungeon
→ Headless simulation harness
→ Reviewer/player agent
→ Versioned review loop
→ Developer-agent workflow
→ Gameplay depth
→ Acceptance gate
→ End-to-end demo
```

---

# 5. Phase details

## PHASE-01-PROJECTSTRUCTURE-BUILDING

### Goal

Create the initial repository foundation.

### What to build

```text
- TypeScript project setup
- pnpm/package manager setup
- Vitest test framework
- lint/typecheck commands
- folder structure
- initial docs
```

Suggested structure:

```text
agentic-dungeon/
  package.json
  pnpm-workspace.yaml
  tsconfig.json
  src/
    game/
    harness/
    agents/
  content/
    items.json
    enemies.json
    floor-rules.json
  tests/
  runs/
  docs/
    NORTH_STAR.md
    RULES.md
    PHASES.md
```

### How to build it

Keep this phase minimal. Do not add Next.js, database, dashboard, plugin framework, or LLM integration yet.

### Dependencies

None.

### Tests/checks

```text
pnpm install
pnpm typecheck
pnpm test
pnpm lint
```

### Output artifact

A working repo skeleton with passing basic checks.

---

## PHASE-02A-GAMECONTRACT-BUILDING

### Goal

Define the stable game interface that all future versions must preserve.

### What to build

Core interface:

```ts
start(seed: string, config?: GameConfig): GameState
getAvailableActions(state: GameState): PlayerAction[]
step(state: GameState, action: PlayerAction): StepResult
render(state: GameState): string
isTerminal(state: GameState): boolean
```

Core types:

```text
- GameState
- PlayerAction
- StepResult
- GameEvent
- TerminalStatus
- GameConfig
```

Terminal statuses:

```text
ACTIVE
WIN
LOSS
ABORTED
```

### How to build it

Keep the contract simple and serializable. The reviewer must always choose from explicit available actions.

### Dependencies

```text
PHASE-01-PROJECTSTRUCTURE-BUILDING
```

### Tests/checks

```text
- start(seed) returns valid GameState
- render(state) returns non-empty string
- getAvailableActions(state) returns array
- isTerminal(state) works
- StepResult is serializable
```

### Output artifact

Stable game contract and type foundation.

---

## PHASE-02B-SEEDEDRNG-BUILDING

### Goal

Implement deterministic randomness.

### What to build

Seeded RNG utility:

```text
- random integer
- random float
- shuffle
- weighted choice
```

### How to build it

Never use `Math.random()` directly inside game logic. All procedural generation should use this RNG.

### Dependencies

```text
PHASE-01-PROJECTSTRUCTURE-BUILDING
```

### Tests/checks

```text
- same seed produces same sequence
- different seeds produce different sequences
- shuffle is deterministic
- weighted choice is deterministic
```

### Output artifact

Seeded randomness utility.

---

## PHASE-02C-CONTENTDATA-BUILDING

### Goal

Create the first data-driven content layer.

### What to build

```text
content/
  items.json
  enemies.json
  floor-rules.json
```

Initial content:

```text
- Enemy: Slime
- Item: Potion
- Basic floor rules
```

### How to build it

Keep validation lightweight. The goal is to let future developer agents adjust content without editing core engine code.

### Dependencies

```text
PHASE-01-PROJECTSTRUCTURE-BUILDING
```

### Tests/checks

```text
- content files load
- required fields exist
- invalid content fails validation
- Slime and Potion are available to game logic
```

### Output artifact

Basic data-driven content layer.

---

## PHASE-03-MINIMALDUNGEON-BUILDING

### Goal

Build the first complete playable finite dungeon.

### What to build

```text
- grid map
- player
- walls/floors
- stairs
- Slime enemy
- Potion item
- HP
- movement
- melee attack
- pickup/use item
- descend stairs
- win/loss condition
- max-turn abort
```

Suggested initial game:

```text
Name: Seven Floors to Dawn
Floors: 5
Grid size: 8x8 or 10x10
Win: reach final shrine/final stairs
Loss: HP reaches 0
Abort: max turns reached
```

### How to build it

Keep the first dungeon small. It does not need to be highly fun yet. It needs to be complete, finite, playable, and testable.

### Dependencies

```text
PHASE-02A-GAMECONTRACT-BUILDING
PHASE-02B-SEEDEDRNG-BUILDING
PHASE-02C-CONTENTDATA-BUILDING
```

### Tests/checks

```text
- player can move to valid tiles
- player cannot move through walls
- invalid actions are handled safely
- Slime can act
- combat changes HP
- Potion restores HP
- stairs advance floor
- final floor can produce WIN
- HP 0 produces LOSS
- max turns produces ABORTED
```

### Output artifact

First complete playable micro-dungeon.

---

## PHASE-04A-ASCIIRenderer-BUILDING

### Goal

Make the game readable through text/ASCII.

### What to build

A render like:

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

### How to build it

The renderer must return a plain string. The goal is tactical legibility.

### Dependencies

```text
PHASE-03-MINIMALDUNGEON-BUILDING
```

### Tests/checks

```text
- render returns non-empty string
- render includes player symbol
- render includes floor and turn
- render includes HP
- render includes inventory
- render includes legend
- render works for terminal states
```

### Output artifact

Readable text/ASCII game representation.

---

## PHASE-04B-BASELINEPLAYERS-BUILDING

### Goal

Add non-LLM automated players for cheap smoke testing.

### What to build

Baseline policies:

```text
- random valid action player
- stairs-seeking player
- cautious low-HP player
- greedy item picker
```

### How to build it

Baseline players should be deterministic when given a seed. They are not meant to be smart; they catch crashes, softlocks, and invalid action loops.

### Dependencies

```text
PHASE-03-MINIMALDUNGEON-BUILDING
```

### Tests/checks

```text
- each baseline player can run
- baseline players only choose valid actions
- game reaches WIN / LOSS / ABORTED
- baseline run does not crash
```

### Output artifact

Cheap automated playtest layer.

---

## PHASE-05-HARNESS-BUILDING

### Goal

Build the headless playthrough harness.

### What to build

CLI/scripts:

```text
- run-playthrough
- simulate-seed
- save-trace
- generate-scorecard
```

The harness should:

```text
1. Start the game with a seed.
2. Choose actions using a player policy.
3. Step the game.
4. Save each turn to a trace.
5. Stop at WIN / LOSS / ABORTED.
6. Generate a scorecard.
```

### How to build it

Use local files only.

Save outputs under:

```text
runs/
  v001/
    traces/
    scorecards/
```

### Dependencies

```text
PHASE-03-MINIMALDUNGEON-BUILDING
PHASE-04A-ASCIIRenderer-BUILDING
PHASE-04B-BASELINEPLAYERS-BUILDING
```

### Tests/checks

```text
- trace file is saved
- scorecard file is saved
- fixed seed produces reproducible trace
- terminal status is recorded
- invalid action count is recorded
```

### Output artifact

Headless evaluation harness.

---

## PHASE-06A-LLMPLAYER-BUILDING

### Goal

Allow an LLM reviewer/player agent to play the game through the harness.

### What to build

LLM player wrapper.

Input to LLM:

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

### How to build it

The LLM player only chooses from available actions. It does not edit files.

Add fallback behavior for invalid JSON, unavailable actions, missing action IDs, or timeouts.

### Dependencies

```text
PHASE-05-HARNESS-BUILDING
```

### Tests/checks

Use mocked LLM responses:

```text
- valid response selects action
- invalid action is handled
- malformed JSON is handled
- reason is saved into trace
```

### Output artifact

API-based player/reviewer agent.

---

## PHASE-06B-REVIEWERCRITIC-BUILDING

### Goal

Generate grounded reviews from actual playthrough traces.

### What to build

Reviewer critic receives:

```text
- trace JSON
- scorecard
- key rendered states
- persona
```

It returns:

```json
{
  "summary": "...",
  "fun_score": 6,
  "clarity_score": 7,
  "fairness_score": 6,
  "tactical_depth_score": 5,
  "replay_value_score": 6,
  "top_issues": [
    {
      "severity": "major",
      "observation": "...",
      "diagnosis": "...",
      "recommendation": "..."
    }
  ],
  "suggested_next_changes": []
}
```

### How to build it

Reviews must separate observation, diagnosis, recommendation, and severity. Reviews must cite trace evidence.

### Dependencies

```text
PHASE-05-HARNESS-BUILDING
```

### Tests/checks

```text
- review is generated from mocked trace
- review includes top issues
- review includes suggested changes
- review is saved under runs/vXXX/reviews/
- missing trace data is handled gracefully
```

### Output artifact

Trace-grounded review generation.

---

## PHASE-06C-SCORECARD-BUILDING

### Goal

Create objective and subjective scorecards.

### What to build

Objective metrics:

```text
- result
- turns
- floors reached
- damage taken
- enemies defeated
- items used
- invalid actions
- softlocks
```

Subjective metrics:

```text
- fun
- clarity
- fairness
- tactical depth
- replay value
```

### How to build it

Objective metrics come from traces. Subjective metrics come from reviewer output. Missing subjective scores should not break scorecard generation.

### Dependencies

```text
PHASE-05-HARNESS-BUILDING
PHASE-06B-REVIEWERCRITIC-BUILDING
```

### Tests/checks

```text
- scorecard can be generated from trace
- required objective fields exist
- subjective fields merge when available
- scorecard is saved to file
```

### Output artifact

Comparable run/version scorecards.

---

## PHASE-07-VERSIONLOOP-BUILDING

### Goal

Create a complete versioned evaluation loop.

### What to build

Version folder structure:

```text
runs/
  v001/
    traces/
    reviews/
    scorecards/
    changelog.md
    developer_notes.md
    acceptance.md
```

Commands/scripts:

```text
- new-version
- run-version
- summarize-version
- compare-versions
```

### How to build it

A version is not only a git commit. It includes traces, reviews, scorecards, changelog, developer notes, and acceptance status.

### Dependencies

```text
PHASE-06A-LLMPLAYER-BUILDING
PHASE-06B-REVIEWERCRITIC-BUILDING
PHASE-06C-SCORECARD-BUILDING
```

### Tests/checks

```text
- version folder is created
- traces save under correct version
- reviews save under correct version
- scorecards save under correct version
- comparison report can be generated
```

### Output artifact

Complete versioned evaluation loop.

---

## PHASE-08-DEVELOPERAGENT-WORKFLOW-BUILDING

### Goal

Define the developer-agent workflow.

### What to build

Create:

```text
- developer task template
- reviewer-to-developer handoff format
- allowed/forbidden change checklist
- changelog template
- test command checklist
```

Developer receives:

```text
- previous review
- previous scorecard
- allowed changes
- forbidden changes
- target scope
- test commands
```

Developer must output:

```text
- code changes
- tests
- changelog
- implementation summary
```

### How to build it

Start manual. A human can copy the generated task into Claude Code or Codex CLI. Do not over-automate coding-agent orchestration yet.

### Dependencies

```text
PHASE-07-VERSIONLOOP-BUILDING
```

### Tests/checks

```text
- developer task can be generated from review
- task includes allowed/forbidden changes
- task includes test commands
- changelog path is required
```

### Output artifact

Repeatable coding-agent developer workflow.

---

## PHASE-09A-TACTICALITEMS-BUILDING

### Goal

Increase gameplay depth through tactical items.

### What to build

Items such as:

```text
- Smoke Bomb
- Swap Scroll
- Reveal Dust
- Fire Seed
- Warp Feather
```

### How to build it

Items should create tactical decisions. Avoid pure stat boosts.

Each item should have a definition, effect, valid use condition, render description, trace event, and tests.

### Dependencies

```text
PHASE-03-MINIMALDUNGEON-BUILDING
PHASE-07-VERSIONLOOP-BUILDING
```

Can run in parallel with:

```text
PHASE-09B-ENEMYVARIETY-BUILDING
PHASE-09C-MAPGENERATION-BUILDING
```

### Tests/checks

```text
- each item can be used
- item effects change game state
- item descriptions render
- item usage is recorded in trace
```

### Output artifact

Richer tactical item system.

---

## PHASE-09B-ENEMYVARIETY-BUILDING

### Goal

Add enemy variety so combat and movement are less repetitive.

### What to build

Enemies such as:

```text
- Bat
- Shell
- Thief
- Ghost
```

### How to build it

Each enemy should create a distinct tactical problem. Keep enemy AI simple.

### Dependencies

```text
PHASE-03-MINIMALDUNGEON-BUILDING
PHASE-07-VERSIONLOOP-BUILDING
```

Can run in parallel with:

```text
PHASE-09A-TACTICALITEMS-BUILDING
PHASE-09C-MAPGENERATION-BUILDING
```

### Tests/checks

```text
- each enemy can spawn
- each enemy can act
- behavior is deterministic under seed
- enemy actions are recorded in trace
- enemy behavior does not crash game
```

### Output artifact

More varied tactical encounters.

---

## PHASE-09C-MAPGENERATION-BUILDING

### Goal

Improve seeded procedural dungeon generation.

### What to build

Map generation with:

```text
- rooms
- corridors
- valid spawn points
- item placement
- enemy placement
- stairs placement
- floor difficulty scaling
```

### How to build it

Every generated floor must be valid:

```text
- player spawn is valid
- stairs are reachable
- enemies/items spawn on valid tiles
- generation is deterministic by seed
```

### Dependencies

```text
PHASE-02B-SEEDEDRNG-BUILDING
PHASE-03-MINIMALDUNGEON-BUILDING
PHASE-07-VERSIONLOOP-BUILDING
```

Can run in parallel with:

```text
PHASE-09A-TACTICALITEMS-BUILDING
PHASE-09B-ENEMYVARIETY-BUILDING
```

### Tests/checks

```text
- same seed produces same map
- different seeds produce different maps
- stairs are reachable
- player spawn is valid
- enemies/items spawn on valid tiles
- fixed regression seeds pass
```

### Output artifact

Procedural but bounded dungeon generation.

---

## PHASE-10A-DIALOGUEEVENTS-BUILDING

### Goal

Add a light narrative and character layer.

### What to build

```text
- opening text
- ending text
- floor events
- one optional talkable NPC
- finite dialogue choices
```

### How to build it

Dialogue must be finite and structured. No open-ended LLM NPC conversations.

### Dependencies

```text
PHASE-07-VERSIONLOOP-BUILDING
```

Preferably after PHASE-09A/B/C.

Can run in parallel with PHASE-10B.

### Tests/checks

```text
- talk action is valid when NPC is present
- dialogue choices work
- dialogue can exit back to game
- no dialogue softlock
- game ending remains reachable
```

### Output artifact

Light narrative and finite character interaction layer.

---

## PHASE-10B-BALANCETUNING-BUILDING

### Goal

Add balance evaluation across seeds and baseline players.

### What to build

Batch evaluation over:

```text
- fixed seeds
- baseline players
- selected LLM reviewer runs
```

Compute:

```text
- win rate
- average turns
- death floor
- item usage
- damage taken
- enemies defeated
- invalid actions
```

### How to build it

Use deterministic baseline players first. LLM reviewer runs are more expensive and should be selective.

### Dependencies

```text
PHASE-07-VERSIONLOOP-BUILDING
```

Preferably after PHASE-09A/B/C.

Can run in parallel with PHASE-10A.

### Tests/checks

```text
- batch simulation runs
- balance summary is saved
- failed seeds are reported
- version-to-version balance comparison works
```

### Output artifact

Balance evaluation layer.

---

## PHASE-11-ACCEPTANCEGATE-BUILDING

### Goal

Add version acceptance/rejection checks.

### What to build

Acceptance checks:

```text
- typecheck passes
- tests pass
- fixed seeds simulate
- reviewer can play
- terminal state is reached
- changelog exists
- no forbidden features introduced
```

Generate:

```text
runs/vXXX/acceptance.md
```

### How to build it

Mostly deterministic. Human can still make the final call. Developer agent must not self-certify.

### Dependencies

```text
PHASE-07-VERSIONLOOP-BUILDING
PHASE-08-DEVELOPERAGENT-WORKFLOW-BUILDING
```

### Tests/checks

```text
- acceptance report is generated
- failing tests cause rejection
- missing changelog causes rejection
- invalid terminal state causes rejection
- missing traces/reviews are flagged
```

### Output artifact

Simple governance layer for accepting versions.

---

## PHASE-12-DEMOLOOP-BUILDING

### Goal

Produce a complete end-to-end proof-of-concept demo.

### What to build

Create at least three game versions:

```text
v001: basic playable dungeon
v002: reviewer-driven tactical improvement
v003: reviewer-driven clarity/balance/story improvement
```

Each version should include:

```text
- traces
- reviews
- scorecards
- changelog
- acceptance report
- comparison summary
```

### How to build it

The demo should be real. Reviewer plays should be actual playthroughs. Developer changes should be actual code/content changes.

### Dependencies

```text
PHASE-01 through PHASE-11
```

### Tests/checks

```text
- all three version folders are complete
- final game is playable
- comparison report exists
- demo can be rerun
- scorecards show meaningful changes
```

### Output artifact

End-to-end adversarial game-development demo.

---

# 6. Simplified phase summary

## Sequential foundation

```text
PHASE-01-PROJECTSTRUCTURE-BUILDING
- Build the TypeScript repo skeleton, tests, lint/typecheck, docs, and folder layout.

PHASE-02A-GAMECONTRACT-BUILDING
- Define the stable game interface and core game-state/action/result types.

PHASE-02B-SEEDEDRNG-BUILDING
- Implement deterministic seeded randomness for reproducible procedural generation.

PHASE-02C-CONTENTDATA-BUILDING
- Add initial data files for enemies, items, and floor rules.

PHASE-03-MINIMALDUNGEON-BUILDING
- Build the first complete playable finite dungeon with movement, enemies, items, stairs, HP, and win/loss.

PHASE-04A-ASCIIRenderer-BUILDING
- Add readable ASCII/text rendering with map, HUD, inventory, log, and legend.

PHASE-04B-BASELINEPLAYERS-BUILDING
- Add non-LLM baseline players for cheap automated smoke testing.

PHASE-05-HARNESS-BUILDING
- Build the headless playthrough harness that runs games, saves traces, and generates scorecards.
```

## Agent layer

```text
PHASE-06A-LLMPLAYER-BUILDING
- Add API-based reviewer/player agent that chooses actions from the available action list.

PHASE-06B-REVIEWERCRITIC-BUILDING
- Add trace-grounded reviewer critique generation.

PHASE-06C-SCORECARD-BUILDING
- Add objective and subjective scorecards for comparing runs and versions.

PHASE-07-VERSIONLOOP-BUILDING
- Add version folders, run summaries, and version comparison output.

PHASE-08-DEVELOPERAGENT-WORKFLOW-BUILDING
- Add the coding-agent developer workflow template for scoped improvements from reviews.
```

## Gameplay depth layer

```text
PHASE-09A-TACTICALITEMS-BUILDING
- Add tactical items that create meaningful decisions.

PHASE-09B-ENEMYVARIETY-BUILDING
- Add varied enemy types with distinct behaviors.

PHASE-09C-MAPGENERATION-BUILDING
- Improve seeded procedural floor generation while preserving reachability and determinism.

PHASE-10A-DIALOGUEEVENTS-BUILDING
- Add light narrative, events, endings, and finite talkable characters.

PHASE-10B-BALANCETUNING-BUILDING
- Add batch balance evaluation across seeds and baseline players.
```

## Governance/demo layer

```text
PHASE-11-ACCEPTANCEGATE-BUILDING
- Add acceptance/rejection checks for every new version.

PHASE-12-DEMOLOOP-BUILDING
- Produce a full v001 → v002 → v003 adversarial game-development demo.
```

---

# 7. Parallelization plan

## Wave 1 — Foundation

Start with:

```text
PHASE-01-PROJECTSTRUCTURE-BUILDING
```

Then parallelize:

```text
PHASE-02A-GAMECONTRACT-BUILDING
PHASE-02B-SEEDEDRNG-BUILDING
PHASE-02C-CONTENTDATA-BUILDING
```

Then:

```text
PHASE-03-MINIMALDUNGEON-BUILDING
```

## Wave 2 — Playability and harness

After PHASE-03, parallelize:

```text
PHASE-04A-ASCIIRenderer-BUILDING
PHASE-04B-BASELINEPLAYERS-BUILDING
```

Then:

```text
PHASE-05-HARNESS-BUILDING
```

## Wave 3 — Reviewer loop

After PHASE-05, parallelize:

```text
PHASE-06A-LLMPLAYER-BUILDING
PHASE-06B-REVIEWERCRITIC-BUILDING
PHASE-06C-SCORECARD-BUILDING
```

Then:

```text
PHASE-07-VERSIONLOOP-BUILDING
PHASE-08-DEVELOPERAGENT-WORKFLOW-BUILDING
```

## Wave 4 — Gameplay expansion

After PHASE-07, parallelize:

```text
PHASE-09A-TACTICALITEMS-BUILDING
PHASE-09B-ENEMYVARIETY-BUILDING
PHASE-09C-MAPGENERATION-BUILDING
```

Then parallelize or semi-parallelize:

```text
PHASE-10A-DIALOGUEEVENTS-BUILDING
PHASE-10B-BALANCETUNING-BUILDING
```

## Wave 5 — Governance and demo

Finish with:

```text
PHASE-11-ACCEPTANCEGATE-BUILDING
PHASE-12-DEMOLOOP-BUILDING
```

---

# 8. Recommended first coding-agent batch

The first batch should not include gameplay expansion or LLM agents.

Start with:

```text
PHASE-01-PROJECTSTRUCTURE-BUILDING
PHASE-02A-GAMECONTRACT-BUILDING
PHASE-02B-SEEDEDRNG-BUILDING
PHASE-02C-CONTENTDATA-BUILDING
```

Then implement:

```text
PHASE-03-MINIMALDUNGEON-BUILDING
```

Only after the game exists should the project add the reviewer/harness layers.

---

# 9. Definition of project readiness

The project is ready for adversarial iteration when:

```text
1. The game starts from a seed.
2. The game exposes available actions.
3. The game can step from action to next state.
4. The game renders text/ASCII output.
5. The game reaches WIN / LOSS / ABORTED.
6. A baseline player can play without crashing.
7. A trace can be saved.
8. A scorecard can be generated.
9. A reviewer agent can play and critique.
10. A developer agent can implement a scoped improvement.
```

Until these are true, focus on stability rather than game richness.

---

# 10. Final build philosophy

Build in layers:

```text
Layer 1: Stable game
Layer 2: Stable harness
Layer 3: Agent reviewer
Layer 4: Version loop
Layer 5: Developer-agent workflow
Layer 6: Gameplay depth
Layer 7: Acceptance gate
Layer 8: Demo
```

The MVP should remain small.

The most important thing is not whether the first game is impressive.

The most important thing is whether the system can demonstrate:

```text
Version N was played.
Version N was criticized.
Version N+1 changed because of that critique.
Version N+1 remained playable.
The difference is visible in trace, review, scorecard, and changelog.
```

That is the core of adversarial agentic game development.
