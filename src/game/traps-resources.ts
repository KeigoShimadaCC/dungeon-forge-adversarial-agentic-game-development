import {
  getTrapDefinition,
  loadGameContent,
  type FloorRuleDefinition,
  type TrapDefinition,
} from './content.js';
import { chooseEntityPositions } from './map.js';
import type { FloorLayout } from './map.js';
import type { GameEvent, GameState, Position, TrapInstance } from './types.js';

export const TRAP_TRIGGERED_EVENT = 'trap_triggered' as const;
export const RESOURCE_HUNGER_EVENT = 'resource_hunger' as const;
export const RESOURCE_TORCH_EVENT = 'resource_torch' as const;

export const DEFAULT_HUNGER = 85;
export const DEFAULT_TORCH = 100;
export const HUNGER_MAX = 100;
export const TORCH_MAX = 100;
export const HUNGER_DRAIN_PER_TURN = 2;
export const TORCH_DRAIN_PER_TURN = 1;
export const TORCH_DRAIN_START_FLOOR = 2;
export const TORCH_VISIBILITY_THRESHOLD = 30;
export const STARVATION_DAMAGE = 1;
export const SEED_TRAP_HEAVY_BONUS = 1;

const positionKey = (position: Position): string => `${position.x},${position.y}`;

const samePosition = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;

const manhattanDistance = (a: Position, b: Position): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export const isTrapHeavySeed = (seed: string): boolean => seed === 'seed_005';

export const resolveTrapSpawnCount = (
  seed: string,
  rule: FloorRuleDefinition,
): number => {
  const base = rule.trapSpawnCount ?? 0;
  if (base <= 0) {
    return 0;
  }
  return base + (isTrapHeavySeed(seed) ? SEED_TRAP_HEAVY_BONUS : 0);
};

export const placeTraps = (params: {
  seed: string;
  floor: number;
  rule: FloorRuleDefinition;
  layout: FloorLayout;
  occupied: Set<string>;
}): TrapInstance[] => {
  const trapIds = params.rule.trapIds ?? [];
  const count = resolveTrapSpawnCount(params.seed, params.rule);
  if (trapIds.length === 0 || count <= 0) {
    return [];
  }

  const positions = chooseEntityPositions({
    seed: params.seed,
    floor: params.floor,
    layout: params.layout,
    count,
    occupied: params.occupied,
    slot: 'trap',
    safeFromPlayer: true,
  });

  return positions.map((position, index) => {
    const definition = getTrapDefinition(trapIds[index % trapIds.length]!);
    params.occupied.add(positionKey(position));
    return {
      id: `${definition.id}-${params.floor}-${index + 1}`,
      type: definition.id,
      label: definition.displayName,
      glyph: definition.glyph,
      armed: true,
      ...position,
    };
  });
};

export const isTrapVisible = (
  state: GameState,
  trap: TrapInstance,
): boolean => {
  const torch = state.resources?.torch ?? DEFAULT_TORCH;
  if (torch >= TORCH_VISIBILITY_THRESHOLD) {
    return true;
  }
  return manhattanDistance(state.player, trap) <= 1;
};

export const trapRenderGlyph = (state: GameState, trap: TrapInstance): string =>
  isTrapVisible(state, trap) ? trap.glyph : '?';

export const applyTrapOnEntry = (
  state: GameState,
  event: (
    turn: number,
    type: string,
    message: string,
    payload?: Record<string, string | number | boolean | null>,
  ) => GameEvent,
  events: GameEvent[],
): void => {
  const trapIndex = state.traps.findIndex(
    (trap) => trap.armed && samePosition(trap, state.player),
  );
  if (trapIndex < 0) {
    return;
  }

  const trap = state.traps[trapIndex] as TrapInstance;
  const definition = getTrapDefinition(trap.type);
  trap.armed = false;
  state.player.hp = Math.max(0, state.player.hp - definition.damage);
  events.push(
    event(
      state.turn,
      TRAP_TRIGGERED_EVENT,
      `${definition.displayName} triggers for ${definition.damage} damage.`,
      {
        trapId: trap.id,
        trapType: trap.type,
        damage: definition.damage,
        x: trap.x,
        y: trap.y,
      },
    ),
  );
};

export const applyResourcePressure = (
  state: GameState,
  event: (
    turn: number,
    type: string,
    message: string,
    payload?: Record<string, string | number | boolean | null>,
  ) => GameEvent,
  events: GameEvent[],
): void => {
  if (!state.resources) {
    state.resources = { hunger: DEFAULT_HUNGER, torch: DEFAULT_TORCH };
  }

  state.resources.hunger = Math.max(
    0,
    state.resources.hunger - HUNGER_DRAIN_PER_TURN,
  );

  if (state.floor >= TORCH_DRAIN_START_FLOOR) {
    state.resources.torch = Math.max(
      0,
      state.resources.torch - TORCH_DRAIN_PER_TURN,
    );
  }

  if (state.resources.hunger <= 0) {
    state.player.hp = Math.max(0, state.player.hp - STARVATION_DAMAGE);
    events.push(
      event(
        state.turn,
        RESOURCE_HUNGER_EVENT,
        `Hunger bites for ${STARVATION_DAMAGE} damage (rations empty).`,
        {
          hunger: state.resources.hunger,
          damage: STARVATION_DAMAGE,
        },
      ),
    );
  } else if (state.resources.hunger <= 20) {
    events.push(
      event(
        state.turn,
        RESOURCE_HUNGER_EVENT,
        'Your stomach growls; rations are low.',
        { hunger: state.resources.hunger, damage: 0 },
      ),
    );
  }

  if (state.resources.torch <= 0) {
    events.push(
      event(
        state.turn,
        RESOURCE_TORCH_EVENT,
        'Your torch sputters out; traps are harder to spot.',
        { torch: state.resources.torch },
      ),
    );
  } else if (state.resources.torch <= 15) {
    events.push(
      event(
        state.turn,
        RESOURCE_TORCH_EVENT,
        'Torchlight flickers; distant traps fade into shadow.',
        { torch: state.resources.torch },
      ),
    );
  }
};

export const defaultResources = (): GameState['resources'] => ({
  hunger: DEFAULT_HUNGER,
  torch: DEFAULT_TORCH,
});

export const formatResourceStatus = (state: GameState): string => {
  const resources = state.resources ?? defaultResources();
  return `Rations ${resources.hunger}/${HUNGER_MAX} | Torch ${resources.torch}/${TORCH_MAX}`;
};

export interface TrapResourceMetrics {
  traps_triggered: number;
  trap_damage_taken: number;
  hunger_damage_taken: number;
  resource_pressure_events: number;
}

export const deriveTrapResourceMetricsFromEvents = (
  steps: ReadonlyArray<{ events: ReadonlyArray<{ type: string; payload?: Record<string, unknown> }> }>,
): TrapResourceMetrics => {
  let traps_triggered = 0;
  let trap_damage_taken = 0;
  let hunger_damage_taken = 0;
  let resource_pressure_events = 0;

  for (const step of steps) {
    for (const entry of step.events) {
      if (entry.type === TRAP_TRIGGERED_EVENT) {
        traps_triggered += 1;
        const damage = entry.payload?.damage;
        if (typeof damage === 'number') {
          trap_damage_taken += damage;
        }
      }
      if (entry.type === RESOURCE_HUNGER_EVENT) {
        resource_pressure_events += 1;
        const damage = entry.payload?.damage;
        if (typeof damage === 'number' && damage > 0) {
          hunger_damage_taken += damage;
        }
      }
      if (entry.type === RESOURCE_TORCH_EVENT) {
        resource_pressure_events += 1;
      }
    }
  }

  return {
    traps_triggered,
    trap_damage_taken,
    hunger_damage_taken,
    resource_pressure_events,
  };
};

export const listTrapDefinitions = (): TrapDefinition[] =>
  loadGameContent().traps.traps;
