# PHASE-10A - Dialogue Events

## Purpose

Add a light narrative and character layer through finite, structured dialogue and events.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-10A-DIALOGUEEVENTS-BUILDING` and bounded character examples in `01_NORTH_STAR_AND_VISION.md` and `03_EXAMPLES_SCENARIOS_AND_WORKFLOWS.md`.

## Target Outcome

The game includes opening text, ending text, floor events, and one optional talkable NPC without introducing open-ended LLM conversation during gameplay.

## In Scope

- Opening and ending text.
- Finite floor events.
- One optional talkable NPC.
- Structured `talk` actions and dialogue choices.
- Dialogue exit back to normal play.
- Trace/log support for dialogue.

## Out Of Scope

- Arbitrary LLM NPC responses.
- Always-on companions.
- Voice acting, cutscenes, or required media assets.
- Dialogue that can softlock the game.

## Technical Spec

Dependencies: `PHASE-07A-VERSION-LOOP`; preferably after `PHASE-09A`, `PHASE-09B`, and `PHASE-09C`.

Dialogue must be finite and represented as serializable content or state:

- Dialogue node ID.
- Text.
- Choices.
- Structured choice action IDs.
- Effects, if any.
- Exit behavior.

Dialogue actions must come from `getAvailableActions` only when relevant. Ending remains reachable regardless of dialogue choices unless a choice intentionally and testably changes game outcome within finite rules.

## Deliverables

- Narrative/event content.
- Dialogue state/action implementation.
- Render/log/trace updates.
- Tests.

## Tests And Validation

- `talk` action is valid when NPC is present.
- Dialogue choices work.
- Dialogue can exit back to game.
- No dialogue softlock.
- Game ending remains reachable.
- Dialogue events are recorded in trace.

## Acceptance Criteria

- Narrative improves clarity or flavor without breaking playability.
- All dialogue is finite, structured, and inspectable.
- Gameplay still runs without API credentials.

## AI Coder Handoff Notes

Prefer small authored content. This phase can run in parallel with `PHASE-10B` after the version loop and preferably after gameplay-depth phases.
