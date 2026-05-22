# Agentic Adversarial Game Development — North Star & Vision

## 1. One-sentence concept

Build a small playable game through an adversarial loop where a **Game Developer Agent** creates and improves the game, while a **Game Player / Reviewer Agent** actually plays the game, critiques it, and pressures the developer toward better versions.

## 2. North Star

> Can an adversarial developer/reviewer agent loop improve a small playable game over multiple versions, while preserving a stable game protocol and producing measurable evidence of improvement?

This project is not primarily about making a commercially polished game.  
It is an experiment in **agentic creative production with bounded autonomy**.

The goal is to test whether agents can:

1. Build a finite playable game.
2. Play the game through a stable interface.
3. Produce grounded critique based on actual play.
4. Translate critique into scoped improvements.
5. Iterate across versions without breaking the game.
6. Produce a visible improvement trail through traces, reviews, changelogs, and scorecards.

## 3. Core product idea

The platform consists of two main agents:

### Game Developer Agent

The Game Developer Agent creates and modifies the game.

It may act as:

- game designer
- scenario planner
- systems designer
- balance tuner
- engineer
- bug fixer
- content writer

Its job is to improve the game based on player/reviewer feedback.

### Game Player / Reviewer Agent

The Game Player / Reviewer Agent plays the game and critiques it.

It may act as:

- normal player
- harsh reviewer
- bug hunter
- balance analyst
- genre-aware critic
- Steam-review-like player persona

Its job is not merely to read the design document.  
It must **play the game first**, then critique the game from evidence.

## 4. What the platform should produce

The platform should produce **small, finite, turn-based, text/ASCII games** that evolve over versions.

The strongest initial genre is a **micro Mystery Dungeon / turn-based roguelike**:

- grid-based
- turn-based
- finite floors
- procedural but seeded
- explicit win/loss ending
- text/ASCII rendered
- playable by both human and agent
- random enough to avoid trivial brute-force enumeration
- deterministic enough to evaluate across versions

The platform should produce artifacts such as:

- playable game versions
- playthrough traces
- reviewer critiques
- developer patch plans
- changelogs
- scorecards
- version comparisons
- acceptance/rejection decisions

## 5. What the platform should not produce

The platform should not attempt to produce open-ended, multimedia, real-time commercial games in the early stage.

It should not produce or require:

- PNG/sprite-based visual assets as part of the core loop
- voice acting
- music
- real-time combat
- mouse/timing-sensitive gameplay
- infinite floors with no ending
- open-world infinite simulation
- arbitrary free-form LLM world generation during play
- Unity/Godot-scale engine complexity in the MVP
- external API calls during gameplay
- reviewer evaluation based only on vibes or design documents

The platform should remain:

- finite
- measurable
- turn-based
- text/ASCII-first
- seedable
- replayable
- versioned
- inspectable

## 6. Core invariants

Every game produced by the platform must satisfy the following invariants:

1. **Finite game**  
   The game must have explicit terminal states: `WIN`, `LOSS`, or `ABORTED`.

2. **Text/ASCII output**  
   The game may use prose, ASCII maps, Unicode panels, text HUDs, and logs. It must not require images or audio.

3. **Structured action input**  
   The agent must choose from explicit available actions, not arbitrary unbounded text.

4. **Turn-based play**  
   No real-time input, dodging, aiming, input lag, animation timing, or reaction tests.

5. **Seeded randomness**  
   Randomness is allowed and encouraged, but it must be reproducible by seed.

6. **Stable action/state interface**  
   The reviewer and harness must always be able to start the game, inspect state, get valid actions, step the game, render the state, and detect terminal status.

7. **Reviewer must play before critique**  
   Critique must be grounded in actual playthrough traces.

8. **Developer may improve but must not break the protocol**  
   The developer can add mechanics, enemies, items, dialogue, ASCII visuals, events, and balance changes, but must preserve the core interface and explicit ending.

9. **Every version must be stored**  
   Each loop creates a versioned record: trace, review, scorecard, changelog, and change summary.

## 7. Why Mystery Dungeon–style game design fits

A visual novel is easy to test, but it can become too brute-forceable.  
A real-time action game is fun, but evaluation becomes noisy.

A micro Mystery Dungeon sits in the middle:

| Requirement | Mystery Dungeon fit |
|---|---|
| Feels like a real game | High |
| Turn-based | Yes |
| Agent-playable | Yes |
| Random but reproducible | Yes, with seeds |
| Finite | Yes, with fixed floors |
| Tactical | Yes |
| Text/ASCII compatible | Yes |
| Measurable | Yes |
| Brute-force resistant | Better than VN |

The game can start simple:

- 5 floors
- small grid
- one enemy type
- stairs
- HP
- a few items
- ASCII map
- win/loss condition

Then the reviewer can pressure it to improve:

- “combat is too shallow”
- “map is hard to read”
- “items are boring”
- “there are no characters”
- “the game is too easy”
- “the game lacks surprise”
- “the ending is unsatisfying”

The developer then implements bounded improvements.

## 8. Bounded creative freedom

The developer agent should have freedom, but not total freedom.

### The developer may add

- items
- enemies
- traps
- hunger/resource systems
- ASCII/Unicode rendering improvements
- simple dialogue
- NPCs
- finite conversation trees
- scripted events
- floor rules
- balance changes
- finite challenge modes
- seeded mystery variants
- simple character traits
- tactical combat actions

### The developer may not add

- image-only rendering
- voice acting
- music as required output
- real-time combat
- infinite floors
- no-ending sandbox play
- arbitrary LLM-generated story during gameplay
- dependency on external services during play
- engine rewrites that break the harness
- unbounded free-text action systems

## 9. Reviewer pressure vs implementation authority

The reviewer is allowed to ask for broad improvements, but the reviewer does not directly decide architecture.

Example:

Reviewer says:

> “I want visuals.”

Allowed translation:

> Add ASCII/Unicode map rendering, symbols, HUD, room panels, and status log.

Rejected translation:

> Add PNG sprites and require image-based play.

Example:

Reviewer says:

> “I want deeper characters.”

Allowed translation:

> Add finite NPC dialogue trees, relationship flags, and character events.

Rejected translation:

> Add open-ended always-on LLM companions with arbitrary conversations.

Example:

Reviewer says:

> “I want more replayability.”

Allowed translation:

> Add finite seeded variations, challenge seeds, alternate item tables, or optional 10-floor mode.

Rejected translation:

> Add infinite floors with no explicit ending.

## 10. Definition of improvement

Improvement should not be purely subjective.

A version is better when there is evidence such as:

- reviewer completes more reliably
- game has fewer bugs
- fewer invalid actions occur
- win/loss rate is closer to target
- tactical item usage increases
- reviewer confusion decreases
- reviewer’s critique becomes more advanced rather than basic
- playthrough traces show use of new systems
- prior high-severity critique is addressed
- the game remains finite, playable, and seedable

Subjective fun is allowed, but it should be tied to observed play.

## 11. MVP success criteria

The MVP succeeds if it demonstrates the following loop:

1. Version 0.1 is playable but shallow.
2. Reviewer agent plays it and produces grounded criticism.
3. Developer agent improves one to three things.
4. Version 0.2 remains playable.
5. Reviewer plays again and identifies changed experience.
6. At least one metric or trace changes meaningfully.
7. The game does not break the core contract.
8. The process can repeat at least three times.

## 12. Long-term vision

If the core loop works, the project can evolve into a small “agentic game studio testbed”:

- multiple reviewer personas
- richer roguelike systems
- browser-playable UI
- automatic patch proposals
- scoped coding-agent implementation
- leaderboard of game versions
- human playtesting comparison
- automated balance analysis
- extension system
- eventually visual/audio layers

But these are later layers.

The MVP should prove only this:

> A bounded adversarial loop can turn a small playable game into a better small playable game over multiple versions.
