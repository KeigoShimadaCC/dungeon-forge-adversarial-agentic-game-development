# PHASE-04A - ASCII Renderer

## Purpose

Make the game readable through a plain text/ASCII render that both humans and reviewer agents can inspect.

## Source Context

Derived from `04_HIGH_LEVEL_PROJECT_PHASES.md` `PHASE-04A-ASCIIRenderer-BUILDING` and the text/ASCII-first invariant in `01_NORTH_STAR_AND_VISION.md`.

## Target Outcome

`render(state)` returns a legible string containing map, HUD, inventory, legend, and recent log information.

## In Scope

- ASCII map symbols for player, floors, walls, stairs, enemies, and items.
- Floor and turn display.
- HP and inventory display.
- Legend.
- Recent event log.
- Terminal-state rendering.

## Out Of Scope

- Required image/sprite rendering.
- Browser-only UI.
- Animation, audio, or real-time input.
- Changing game state during render.

## Technical Spec

Dependencies: `PHASE-03A-MINIMAL-DUNGEON`.

The renderer must be pure from the caller perspective: given a `GameState`, it returns a plain string. A typical render includes:

```text
Floor 1 / Turn 3
########
#@..s..#
#..#...#
#...>..#
########
HP 18/20
Inventory: Potion
Legend: @ You, s Slime, > Stairs, # Wall, . Floor
Log:
- You moved east.
```

It must work for `ACTIVE`, `WIN`, `LOSS`, and `ABORTED` states.

## Deliverables

- Renderer implementation under `src/game/render.ts` or equivalent.
- Render tests.
- Any symbol constants needed by the game.

## Tests And Validation

- Render returns a non-empty string.
- Render includes player symbol.
- Render includes floor and turn.
- Render includes HP.
- Render includes inventory.
- Render includes legend.
- Render includes recent log.
- Render works for terminal states.

## Acceptance Criteria

- A reviewer can make tactical decisions from the render plus available actions.
- The renderer remains text/ASCII first and does not require media assets.
- Rendering is deterministic for the same state.

## AI Coder Handoff Notes

Optimize for tactical legibility. Do not make UI the source of truth; state and actions remain canonical.
