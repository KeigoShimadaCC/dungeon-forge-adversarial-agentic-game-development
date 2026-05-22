# Traps And Resources (Phase 16A)

Phase 16A adds finite, seeded traps and lightweight hunger/torch resource pressure to the dungeon engine.

## Content

- `content/traps.json` — trap definitions (`spike`, `needle`) with damage and ASCII glyphs.
- `content/floor-rules.json` — per-floor `trapIds` and `trapSpawnCount`.
- `seed_005` is trap-heavy: each floor places one extra trap beyond the floor rule.

## Gameplay

- **Traps** spawn on walkable tiles, render as `x` or `;` when visible, or `?` when torchlight is low.
- Stepping onto an armed trap fires a `trap_triggered` event, deals damage, and disarms that trap.
- **Resources** track rations (`hunger`, 0–100) and `torch` (0–100). Both drain each turn after player actions.
- Starvation (`hunger` at 0) deals 1 damage per turn with `resource_hunger` events.
- Low torch emits `resource_torch` warnings and hides distant trap glyphs until you are adjacent.

## Trace And Scorecard

Harness traces record trap/resource event types. Scorecards include optional `trap_resources`:

- `traps_triggered`
- `trap_damage_taken`
- `hunger_damage_taken`
- `resource_pressure_events`

## Verification

```bash
pnpm test tests/traps-resources.test.ts
pnpm run check
```
