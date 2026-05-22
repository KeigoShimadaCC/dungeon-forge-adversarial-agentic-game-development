import { describe, expect, it } from 'vitest';

import {
  loadGameContent,
  NEEDLE_TRAP_ID,
  PHASE_16A_TRAP_IDS,
  SPIKE_TRAP_ID,
  TRAPS_SCHEMA_VERSION,
  validateTrapsBundle,
} from '../src/game/content.js';
import { getAvailableActions, start, step } from '../src/game/engine.js';
import { generateFloorLayout } from '../src/game/map.js';
import { render } from '../src/game/render.js';
import {
  deriveTrapResourceMetricsFromEvents,
  isTrapHeavySeed,
  placeTraps,
  RESOURCE_HUNGER_EVENT,
  RESOURCE_TORCH_EVENT,
  resolveTrapSpawnCount,
  trapRenderGlyph,
  TRAP_TRIGGERED_EVENT,
} from '../src/game/traps-resources.js';
import { deriveScorecardFromTrace, validateScorecard } from '../src/harness/scorecard.js';
import { runPlaythrough } from '../src/harness/runner.js';
import type { GameState, PlayerAction } from '../src/game/types.js';

const regressionSeeds = [
  'seed_001',
  'seed_002',
  'seed_003',
  'seed_004',
  'seed_005',
] as const;

function requireMove(state: ReturnType<typeof start>): PlayerAction {
  const action = getAvailableActions(state).find((candidate) => candidate.type === 'move');
  expect(action).toBeDefined();
  return action as PlayerAction;
}

describe('Phase 16A traps and resources', () => {
  it('loads trap content with validation', () => {
    const content = loadGameContent();
    expect(content.traps.schemaVersion).toBe(TRAPS_SCHEMA_VERSION);
    expect(content.traps.traps.map((trap) => trap.id)).toEqual(PHASE_16A_TRAP_IDS);
    expect(() =>
      validateTrapsBundle({
        schemaVersion: TRAPS_SCHEMA_VERSION,
        traps: [{ id: 'bad' }],
      }),
    ).toThrow();
  });

  it('places traps deterministically for the same seed and floor', () => {
    const rule = loadGameContent().floors.floors[0]!;
    const layout = generateFloorLayout({ seed: 'seed_005', floor: rule.floor, rule });
    const occupied = new Set<string>();
    const first = placeTraps({ seed: 'seed_005', floor: rule.floor, rule, layout, occupied });
    const second = placeTraps({
      seed: 'seed_005',
      floor: rule.floor,
      rule,
      layout,
      occupied: new Set<string>(),
    });
    expect(first).toEqual(second);
    expect(first.length).toBe(resolveTrapSpawnCount('seed_005', rule));
  });

  it('adds extra traps on seed_005 compared with other regression seeds', () => {
    const rule = loadGameContent().floors.floors[3]!;
    const layout = generateFloorLayout({ seed: 'seed_001', floor: rule.floor, rule });
    const normal = placeTraps({
      seed: 'seed_001',
      floor: rule.floor,
      rule,
      layout,
      occupied: new Set<string>(),
    });
    const heavy = placeTraps({
      seed: 'seed_005',
      floor: rule.floor,
      rule,
      layout,
      occupied: new Set<string>(),
    });
    expect(isTrapHeavySeed('seed_005')).toBe(true);
    expect(heavy.length).toBe(normal.length + 1);
  });

  it('records trap_triggered events when stepping on an armed trap', () => {
    const base = start('seed_001');
    const move = requireMove(base);
    const destination = {
      x: base.player.x + (move.payload?.dx as number),
      y: base.player.y + (move.payload?.dy as number),
    };
    const state: GameState = {
      ...base,
      traps: [
        {
          id: 'spike-test-1',
          type: SPIKE_TRAP_ID,
          label: 'Spike Trap',
          glyph: '^',
          armed: true,
          ...destination,
        },
      ],
    };

    const result = step(state, move);
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: TRAP_TRIGGERED_EVENT,
          payload: expect.objectContaining({
            trapType: SPIKE_TRAP_ID,
            damage: 3,
          }),
        }),
      ]),
    );
    expect(result.state.traps[0]?.armed).toBe(false);
    expect(result.state.player.hp).toBe(base.player.hp - 3);
  });

  it('shows resource and trap context in render output', () => {
    const state = start('seed_001');
    const rendered = render(state);
    expect(rendered).toContain('Rations');
    expect(rendered).toContain('Torch');
    expect(rendered).toContain('Traps armed');
    expect(rendered).toContain('x/; Traps');
  });

  it('hides distant traps when torchlight is low and reveals adjacent traps', () => {
    const state = start('seed_005');
    const trap = state.traps[0];
    expect(trap).toBeDefined();

    const farState: GameState = {
      ...state,
      player: { ...state.player, x: trap!.x + 4, y: trap!.y + 4 },
      resources: { ...state.resources, torch: 0 },
    };
    const adjacentX = trap!.x + 1 < state.map.width ? trap!.x + 1 : trap!.x - 1;
    const nearState: GameState = {
      ...state,
      player: { ...state.player, x: adjacentX, y: trap!.y },
      resources: { ...state.resources, torch: 0 },
    };

    expect(trapRenderGlyph(farState, trap!)).toBe('?');
    expect(trapRenderGlyph(nearState, trap!)).toBe(trap!.glyph);
  });

  it('derives trap/resource scorecard metrics from trace events', async () => {
    const playthrough = await runPlaythrough({
      seed: 'seed_005',
      policyId: 'stairs-seeking',
      version: 'v001',
      dryRun: true,
    });

    const trapEvents = playthrough.trace.steps.flatMap((step) =>
      step.events.filter((event) => event.type === TRAP_TRIGGERED_EVENT),
    );
    const metrics = deriveTrapResourceMetricsFromEvents(playthrough.trace.steps);
    expect(metrics.traps_triggered).toBe(trapEvents.length);
    expect(playthrough.scorecard.trap_resources).toEqual(metrics);
    validateScorecard(playthrough.scorecard);
  });

  it.each(regressionSeeds)('keeps structured actions and terminal outcomes for %s', async (seed) => {
    const playthrough = await runPlaythrough({
      seed,
      policyId: 'random',
      version: 'v001',
      dryRun: true,
      maxSteps: 400,
    });

    expect(['WIN', 'LOSS', 'ABORTED']).toContain(playthrough.trace.result);
    for (const traceStep of playthrough.trace.steps) {
      for (const action of traceStep.available_actions) {
        expect(action.id).toEqual(expect.any(String));
        expect(action.label).toEqual(expect.any(String));
        expect([
          'move',
          'attack',
          'wait',
          'use_item',
          'pickup',
          'descend',
          'talk',
          'inspect',
        ]).toContain(action.type);
      }
    }
    expect(playthrough.scorecard.trap_resources).toBeDefined();
  });

  it('produces identical trap placements across two starts with the same seed', () => {
    const first = start('seed_005');
    const second = start('seed_005');
    expect(first.traps).toEqual(second.traps);
    expect(first.resources).toEqual(second.resources);
  });

  it('applies hunger pressure on wait turns', () => {
    const state = start('hunger-pressure-seed');
    const before = state.resources.hunger;
    const result = step(
      state,
      requireAction(state, (action) => action.id === 'wait'),
    );
    expect(result.valid).toBe(true);
    expect(result.state.resources.hunger).toBe(before - 2);
  });

  it('emits resource pressure events when hunger and torch are low', () => {
    const state: GameState = {
      ...start('resource-pressure-seed'),
      floor: 2,
      resources: { hunger: 1, torch: 16 },
    };
    const result = step(
      state,
      requireAction(state, (action) => action.id === 'wait'),
    );

    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: RESOURCE_HUNGER_EVENT,
          payload: expect.objectContaining({ damage: 1, hunger: 0 }),
        }),
        expect.objectContaining({
          type: RESOURCE_TORCH_EVENT,
          payload: expect.objectContaining({ torch: 15 }),
        }),
      ]),
    );
    expect(result.state.player.hp).toBe(state.player.hp - 1);
  });

  it('replays the same seed and policy with identical terminal and trap-resource metrics', async () => {
    const first = await runPlaythrough({
      seed: 'seed_005',
      policyId: 'stairs-seeking',
      version: 'v001',
      dryRun: true,
      maxSteps: 160,
    });
    const second = await runPlaythrough({
      seed: 'seed_005',
      policyId: 'stairs-seeking',
      version: 'v001',
      dryRun: true,
      maxSteps: 160,
    });

    expect({
      result: first.trace.result,
      turns: first.trace.turns,
      trap_resources: first.scorecard.trap_resources,
    }).toEqual({
      result: second.trace.result,
      turns: second.trace.turns,
      trap_resources: second.scorecard.trap_resources,
    });
  });

  it('includes trap types in inspect feedback', () => {
    const state = start('seed_002');
    const inspect = getAvailableActions(state).find((action) => action.type === 'inspect');
    expect(inspect).toBeDefined();
    const result = step(state, inspect as PlayerAction);
    expect(result.events[0]?.message).toContain('Rations');
    expect(result.events[0]?.payload?.trapCount).toBeGreaterThanOrEqual(0);
  });

  it('maps spike and needle trap ids to content definitions', () => {
    const traps = loadGameContent().traps.traps;
    expect(traps.find((trap) => trap.id === SPIKE_TRAP_ID)?.damage).toBe(3);
    expect(traps.find((trap) => trap.id === NEEDLE_TRAP_ID)?.damage).toBe(2);
  });

  it('derives scorecard trap metrics consistently from a synthetic trace', () => {
    const trace = {
      version: 'v001',
      seed: 'synthetic',
      persona: 'random',
      result: 'LOSS' as const,
      turns: 2,
      steps: [
        {
          turn: 1,
          valid: true,
          action: { id: 'move_east', type: 'move' as const, label: 'Move east' },
          chosen_action: { id: 'move_east', type: 'move' as const, label: 'Move east' },
          available_actions: [],
          render: 'map',
          terminalStatus: 'ACTIVE' as const,
          events: [
            {
              id: 'e1',
              type: TRAP_TRIGGERED_EVENT,
              message: 'Spike Trap triggers for 3 damage.',
              turn: 1,
              payload: { damage: 3, trapType: SPIKE_TRAP_ID },
            },
          ],
          state_summary: {
            turn: 1,
            floor: 1,
            hp: 17,
            maxHp: 20,
            terminalStatus: 'ACTIVE' as const,
            playerPosition: { x: 1, y: 1 },
            inventory: [],
            enemyCount: 1,
            itemCount: 0,
            npcCount: 0,
            inDialogue: false,
          },
        },
      ],
    };

    const scorecard = deriveScorecardFromTrace(trace, 'traces/synthetic.json');
    expect(scorecard.trap_resources).toEqual({
      traps_triggered: 1,
      trap_damage_taken: 3,
      hunger_damage_taken: 0,
      resource_pressure_events: 0,
    });
  });
});

function requireAction(
  state: ReturnType<typeof start>,
  predicate: (action: PlayerAction) => boolean,
): PlayerAction {
  const action = getAvailableActions(state).find(predicate);
  expect(action).toBeDefined();
  return action as PlayerAction;
}
