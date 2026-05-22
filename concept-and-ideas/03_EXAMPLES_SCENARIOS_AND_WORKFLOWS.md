# Agentic Adversarial Game Development — Examples, Scenarios & Workflows

## 1. Purpose of this document

This document describes how the adversarial game-development loop behaves over time.

It gives concrete examples of:

- what the game starts as
- how the reviewer plays
- what the reviewer says
- how the developer responds
- what changes are allowed
- what changes are rejected
- what artifacts are saved
- how multiple versions evolve

## 2. Baseline workflow

The full loop is:

```text
Version N exists
    ↓
Harness runs the game on fixed seeds
    ↓
Reviewer agent plays the game
    ↓
Trace is saved
    ↓
Reviewer agent critiques the playthrough
    ↓
Developer agent receives critique
    ↓
Developer implements 1–3 scoped changes
    ↓
Tests and simulations run
    ↓
Version N+1 is accepted or rejected
```

## 3. Time-series example: first three versions

### Version 0.1 — Minimal dungeon

Initial game:

```text
- 5 floors
- 8x8 grid
- player
- one enemy: Slime
- one item: Potion
- stairs
- HP
- win by reaching floor 5 shrine
- lose by HP = 0
```

Example render:

```text
Floor 1 / Turn 3

########
#@..s..#
#..#...#
#...>..#
########

HP 18/20
Inventory: Potion

Actions:
1. move_east
2. move_south
3. wait
```

Reviewer play result:

```text
Result: WIN
Turns: 88
Items used: 1
Enemies defeated: 4
Invalid actions: 0
```

Reviewer critique:

```text
The game works and has a clear ending, but it is shallow.

Major issues:
1. Combat is repetitive. Most decisions are simply move or attack.
2. Potion is boring because it only restores HP.
3. The map is readable enough, but symbols are not explained.
4. There is no surprise after floor 1.

Suggested changes:
- Add two tactical items.
- Add one enemy with different behavior.
- Add symbol legend to ASCII render.
```

Developer task:

```text
Implement at most 3 improvements:
1. Add Smoke Bomb.
2. Add Bat enemy.
3. Add symbol legend.
Do not change GameEngine interface.
Do not add images/audio.
Do not add infinite floors.
```

Accepted change:

```text
- Smoke Bomb: enemies lose tracking for 3 turns.
- Bat: low HP, moves faster or acts more aggressively.
- ASCII legend added.
```

Rejected alternative:

```text
- Add animated smoke cloud images.
- Add real-time bat dodging.
```

Reason rejected:

```text
Breaks text-only and turn-based constraints.
```

---

### Version 0.2 — Tactical item version

New game state:

```text
- Slime enemy
- Bat enemy
- Potion
- Smoke Bomb
- symbol legend
```

Reviewer play result:

```text
Result: LOSS
Turns: 61
Floor reached: 3
Items used: 1
Cause of death: trapped by Bat near corridor
```

Reviewer critique:

```text
The game is more interesting than v0.1. The Smoke Bomb created a meaningful escape option.

However:
1. Bat pressure may be too high on early floors.
2. The reviewer did not understand when Smoke Bomb should be used.
3. Item pickup is not obvious from render.
4. Losing on floor 3 felt fair but slightly sudden.

Suggested changes:
- Add one tutorial log message for Smoke Bomb.
- Reduce Bat spawn rate on floors 1–2.
- Make item tiles more visually obvious.
```

Developer task:

```text
Implement at most 3 improvements:
1. Tune Bat spawn rate by floor.
2. Add tutorial log when Smoke Bomb is first picked up.
3. Improve item symbol legend.

Allowed:
- content changes
- spawn tuning
- render text improvements

Forbidden:
- new renderer requiring images
- changing action protocol
- removing loss condition
```

Accepted change:

```text
- Bat spawn rate reduced on floors 1–2.
- First pickup of Smoke Bomb logs: "Smoke Bomb can break enemy pursuit."
- Item symbol "!" changed to "*" with legend.
```

Rejected alternative:

```text
- Add a full tutorial pop-up UI requiring mouse click.
```

Reason rejected:

```text
Mouse/UI dependency is outside text/action protocol.
```

---

### Version 0.3 — Clarity and balance version

Reviewer play result:

```text
Result: WIN
Turns: 117
Items used: 3
Near-death events: 2
Enemies defeated: 6
```

Reviewer critique:

```text
This is the first version that feels like a small game.

Positive:
1. Smoke Bomb created a near-death recovery moment.
2. Bat pressure is more reasonable.
3. Item symbols are clearer.

Remaining issues:
1. There is no story or motivation.
2. Floors feel mechanically similar.
3. The ending is abrupt.

Suggested changes:
- Add short shrine objective text.
- Add one scripted event before final floor.
- Add a better ending message.
```

Developer task:

```text
Implement narrative flavor only.
Do not add large systems.
Do not add conversation system yet.
Do not add voice, images, music, or cutscenes.
```

Accepted change:

```text
- Opening text explains the Dawn Bell.
- Floor 4 has a scripted message: "The walls pulse with morning light."
- Win ending describes escape at sunrise.
```

Rejected alternative:

```text
- Add cinematic cutscene with generated art and voice narration.
```

Reason rejected:

```text
Multimodal asset generation is outside MVP.
```

## 4. Scenario set: three potential games

## Game A: Seven Floors to Dawn

### Base concept

A micro Mystery Dungeon where the player descends through finite floors to recover the Dawn Bell.

### Review 1: “Items are boring.”

Possible implementation:

```text
Add tactical items:
- Smoke Bomb
- Swap Scroll
- Reveal Dust
```

Rejected implementation:

```text
Add animated item effects with PNG sprites.
```

Why rejected:

```text
Breaks text-only output.
```

### Review 2: “I want visuals.”

Possible implementation:

```text
Improve ASCII renderer:
- room borders
- symbol legend
- status HUD
- event log
```

Rejected implementation:

```text
Generate image maps and require screenshot-based review.
```

Why rejected:

```text
Makes reviewer dependent on image interpretation.
```

### Review 3: “I want more replayability.”

Possible implementation:

```text
Add finite challenge seeds and optional 10-floor mode.
```

Rejected implementation:

```text
Add endless dungeon mode with no final floor.
```

Why rejected:

```text
No explicit ending; evaluation becomes unbounded.
```

---

## Game B: The Clockwork Inn

### Base concept

A mystery roguelike inside a rearranging inn. The player must identify the liar before dawn.

### Review 1: “Characters feel shallow.”

Possible implementation:

```text
Add finite NPC dialogue trees:
- talk action
- clue flags
- relationship state
- accusation options
```

Rejected implementation:

```text
Add open-ended LLM conversations with arbitrary NPC responses.
```

Why rejected:

```text
Unbounded generation; hard to test and can contradict game state.
```

### Review 2: “The mystery is too easy.”

Possible implementation:

```text
Add seeded clue variants:
- 3 culprit configurations
- clue placement varies by seed
- testimony changes by culprit
```

Rejected implementation:

```text
Generate an entirely new mystery with free-form LLM output every run.
```

Why rejected:

```text
May create unsolvable mysteries; hard to regression test.
```

### Review 3: “I want dramatic scenes.”

Possible implementation:

```text
Add scripted text events:
- lights go out
- clock stops
- portrait changes
```

Rejected implementation:

```text
Add cinematic cutscenes with images, camera movement, music, and voice.
```

Why rejected:

```text
Multimodal cutscenes are outside text/ASCII MVP.
```

---

## Game C: Ashen Caravan

### Base concept

A survival roguelike where the player escorts a caravan across a finite cursed desert route.

### Review 1: “Party members need personality.”

Possible implementation:

```text
Add finite traits and event reactions:
- brave
- cautious
- healer
- selfish
```

Rejected implementation:

```text
Add always-on open-ended LLM party companions.
```

Why rejected:

```text
Unbounded and difficult to test.
```

### Review 2: “The world feels static.”

Possible implementation:

```text
Add finite seeded weather/events:
- sandstorm
- heatwave
- merchant camp
- raider tracks
```

Rejected implementation:

```text
Add infinite open-world travel in any direction.
```

Why rejected:

```text
No bounded session or guaranteed ending.
```

### Review 3: “Combat is too simple.”

Possible implementation:

```text
Add turn-based combat actions:
- guard
- flank
- protect ally
- retreat
- use item
```

Rejected implementation:

```text
Add real-time action combat with dodging and aiming.
```

Why rejected:

```text
Timing/input lag becomes a core evaluation problem.
```

## 5. Detailed agent workflow example

### Step 1 — Harness starts playthrough

```json
{
  "version": "v002",
  "seed": "seed_003",
  "persona": "careful_player",
  "max_turns": 250
}
```

### Step 2 — Game returns initial state

```json
{
  "floor": 1,
  "turn": 0,
  "terminalStatus": "ACTIVE",
  "player": {
    "hp": 20,
    "maxHp": 20,
    "inventory": []
  },
  "availableActions": [
    {"id": "move_east", "label": "Move east"},
    {"id": "move_south", "label": "Move south"},
    {"id": "wait", "label": "Wait"}
  ],
  "render": "Floor 1 / Turn 0\n\n########\n#@..s..#\n#..#...#\n#...>..#\n########"
}
```

### Step 3 — Reviewer chooses action

```json
{
  "action_id": "move_east",
  "reason": "The east corridor leads toward visible open space and no enemy is adjacent."
}
```

### Step 4 — Harness steps game and logs event

```json
{
  "turn": 1,
  "chosen_action": "move_east",
  "events": [
    "You move east.",
    "The slime moves closer."
  ],
  "terminalStatus": "ACTIVE"
}
```

### Step 5 — Play continues until terminal state

Possible terminal results:

```text
WIN: player reaches final shrine
LOSS: HP reaches 0
ABORTED: max turns reached or invalid state detected
```

### Step 6 — Reviewer receives trace

The reviewer receives:

```text
- full action log
- rendered states
- HP/item/floor history
- terminal result
- invalid actions
- notable events
```

### Step 7 — Reviewer writes critique

Example:

```text
Review summary:
The game is playable and tactical, but item use is underexplained.

Evidence:
- I picked up Smoke Bomb on turn 27 but did not know what it did.
- I died on floor 3 with Smoke Bomb unused.
- The available action label only said "use_smoke_bomb", not its effect.

Severity:
Major clarity issue.

Recommendation:
Add item descriptions to inventory display and first-pickup tutorial logs.
```

### Step 8 — Developer receives scoped task

```text
Task:
Improve item clarity based on reviewer report.

Allowed:
- render text changes
- item description data
- pickup log messages
- tests for item display

Forbidden:
- change GameEngine interface
- add image UI
- add mouse input
- add audio
- remove seed determinism

Implement at most 2 changes.
```

### Step 9 — Developer implements change

Example changelog:

```text
v003 changelog:
- Added item descriptions to inventory display.
- Added first-pickup tutorial messages for tactical items.
- Added test ensuring inventory render includes item descriptions.
```

### Step 10 — Harness validates

```text
pnpm test
pnpm run simulate --seed seed_001
pnpm run simulate --seed seed_002
pnpm run simulate --seed seed_003
```

Acceptance:

```text
Accepted if:
- tests pass
- game remains playable
- reviewer can complete playthrough
- no forbidden feature introduced
```

## 6. What a version folder contains

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

    changelog.md
    developer_notes.md
    acceptance.md
```

## 7. Example scorecard comparison

```text
v001:
- Fun: 4
- Clarity: 6
- Tactical depth: 3
- Fairness: 7
- Replay value: 3

v002:
- Fun: 6
- Clarity: 6
- Tactical depth: 6
- Fairness: 5
- Replay value: 5

v003:
- Fun: 7
- Clarity: 8
- Tactical depth: 6
- Fairness: 7
- Replay value: 6
```

Interpretation:

```text
v002 improved tactical depth but made fairness worse.
v003 fixed clarity and fairness without losing tactical depth.
The adversarial loop produced a meaningful improvement trail.
```

## 8. Developer freedom examples

### Allowed: add item

Reviewer:

```text
The game needs emergency escape options.
```

Developer:

```text
Add Smoke Bomb.
```

Accepted because:

```text
- turn-based
- text-only
- finite
- easy to test
```

### Allowed: add talkable NPC

Reviewer:

```text
The dungeon has no personality.
```

Developer:

```text
Add one finite NPC who appears on floor 3 and offers two dialogue choices.
```

Accepted because:

```text
- structured talk actions
- finite dialogue tree
- no arbitrary LLM conversation
```

### Allowed: add ASCII visuals

Reviewer:

```text
The map is hard to parse.
```

Developer:

```text
Add Unicode borders, legend, and status HUD.
```

Accepted because:

```text
- still text output
- improves readability
```

### Rejected: add voice acting

Reviewer:

```text
Characters would be better with voice.
```

Developer:

```text
Add generated voice acting.
```

Rejected because:

```text
- audio dependency
- outside MVP
- not required for agent play
```

### Rejected: infinite floors

Reviewer:

```text
I want replayability.
```

Developer:

```text
Add infinite dungeon.
```

Rejected because:

```text
- no explicit ending
- evaluation becomes unbounded
```

### Rejected: real-time combat

Reviewer:

```text
Combat lacks excitement.
```

Developer:

```text
Add dodge timing and real-time enemy attacks.
```

Rejected because:

```text
- input timing becomes part of evaluation
- violates turn-based constraint
```

## 9. Human-in-the-loop role

In the MVP, the human owner should remain the final product governor.

The human decides:

- which reviewer suggestions are worth implementing
- whether a version is accepted
- whether a forbidden feature should remain forbidden
- whether the project should expand scope

Automation can increase later, but early human governance prevents overfitting to agent preferences.

## 10. Minimal demonstration script

A good demo would show:

```text
1. v001 game is playable but shallow.
2. Reviewer plays and criticizes it.
3. Developer implements tactical item and ASCII improvements.
4. v002 is replayed.
5. Reviewer identifies better tactical depth but worse balance.
6. Developer tunes enemy/item balance.
7. v003 is replayed.
8. Scorecard and reviews show improvement.
```

This demonstrates the core claim:

> A bounded adversarial agent loop can iteratively improve a small playable game while preserving a measurable, replayable structure.
