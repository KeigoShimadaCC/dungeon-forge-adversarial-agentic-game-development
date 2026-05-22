import {
  getItemDefinition,
  POTION_ITEM_ID,
  type ItemDefinition,
  type ItemEffectId,
} from './content.js';
import { isWalkableTile } from './map.js';
import type {
  EnemyInstance,
  GameEvent,
  GameState,
  PlayerAction,
  Position,
  TacticalEffects,
} from './types.js';

const samePosition = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;

const manhattanDistance = (a: Position, b: Position): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const enemyAt = (
  state: GameState,
  position: Position,
): EnemyInstance | undefined =>
  state.enemies.find((enemy) => samePosition(enemy, position));

export const defaultTacticalEffects = (): TacticalEffects => ({
  enemyTrackingDisabledUntilTurn: 0,
});

const tacticalState = (state: GameState): TacticalEffects =>
  state.tactical ?? defaultTacticalEffects();

export const isEnemyTrackingDisabled = (state: GameState): boolean =>
  state.turn < tacticalState(state).enemyTrackingDisabledUntilTurn;

const inRange = (origin: Position, target: Position, range: number): boolean =>
  manhattanDistance(origin, target) <= range;

const canOccupyTile = (
  state: GameState,
  position: Position,
  excludeEnemyId?: string,
): boolean => {
  if (!isWalkableTile(state.map, position)) {
    return false;
  }
  if (samePosition(position, state.player)) {
    return false;
  }
  const blocker = state.enemies.find(
    (enemy) => samePosition(enemy, position) && enemy.id !== excludeEnemyId,
  );
  return blocker === undefined;
};

const walkableTilesExcludingActors = (state: GameState): Position[] => {
  const tiles: Position[] = [];
  for (let y = 0; y < state.map.height; y += 1) {
    for (let x = 0; x < state.map.width; x += 1) {
      const position = { x, y };
      if (canOccupyTile(state, position)) {
        tiles.push(position);
      }
    }
  }
  return tiles;
};

const minDistanceToEnemies = (state: GameState, position: Position): number => {
  if (state.enemies.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.min(
    ...state.enemies.map((enemy) => manhattanDistance(position, enemy)),
  );
};

export const chooseWarpDestination = (
  state: GameState,
  range: number,
): Position | undefined => {
  const candidates = walkableTilesExcludingActors(state).filter(
    (position) =>
      !samePosition(position, state.player) &&
      inRange(state.player, position, range),
  );
  if (candidates.length === 0) {
    return undefined;
  }

  candidates.sort((a, b) => {
    const distanceDiff =
      minDistanceToEnemies(state, b) - minDistanceToEnemies(state, a);
    if (distanceDiff !== 0) {
      return distanceDiff;
    }
    const playerDistanceDiff =
      manhattanDistance(b, state.player) - manhattanDistance(a, state.player);
    if (playerDistanceDiff !== 0) {
      return playerDistanceDiff;
    }
    if (a.x !== b.x) {
      return a.x - b.x;
    }
    return a.y - b.y;
  });

  return candidates[0];
};

export function canUseItem(
  state: GameState,
  definition: ItemDefinition,
): boolean {
  switch (definition.effect) {
    case 'heal':
      return state.player.inventory.includes(POTION_ITEM_ID);
    case 'blind_enemies':
      return state.enemies.length > 0;
    case 'swap_position':
      return state.enemies.some(
        (enemy) =>
          inRange(state.player, enemy, definition.swapRange ?? 2) &&
          canOccupyTile(state, enemy, enemy.id),
      );
    case 'area_damage':
      return state.enemies.some((enemy) =>
        inRange(state.player, enemy, definition.damageRange ?? 2),
      );
    case 'warp':
      return chooseWarpDestination(state, definition.warpRange ?? 3) !== undefined;
    default:
      return false;
  }
}

export function buildUseItemActions(
  state: GameState,
  definition: ItemDefinition,
): PlayerAction[] {
  if (!state.player.inventory.includes(definition.id)) {
    return [];
  }
  if (!canUseItem(state, definition)) {
    return [];
  }

  const basePayload = {
    itemType: definition.id,
    effect: definition.effect,
  };

  switch (definition.effect) {
    case 'heal':
      return [
        {
          id: `use_${definition.id}`,
          type: 'use_item',
          label: `Use ${definition.displayName}`,
          payload: basePayload,
        },
      ];
    case 'blind_enemies':
      return [
        {
          id: `use_${definition.id}`,
          type: 'use_item',
          label: `Use ${definition.displayName} (blind pursuit ${definition.duration ?? 3} turns)`,
          payload: basePayload,
        },
      ];
    case 'swap_position':
      return state.enemies
        .filter(
          (enemy) =>
            inRange(state.player, enemy, definition.swapRange ?? 2) &&
            canOccupyTile(state, enemy, enemy.id),
        )
        .map((enemy) => ({
          id: `use_${definition.id}_${enemy.id}`,
          type: 'use_item' as const,
          label: `Use ${definition.displayName} on ${enemy.label}`,
          payload: {
            ...basePayload,
            targetId: enemy.id,
          },
        }));
    case 'area_damage':
      return [
        {
          id: `use_${definition.id}`,
          type: 'use_item',
          label: `Use ${definition.displayName} (burst ${definition.damage ?? 3} damage nearby)`,
          payload: basePayload,
        },
      ];
    case 'warp': {
      const destination = chooseWarpDestination(state, definition.warpRange ?? 3);
      if (!destination) {
        return [];
      }
      return [
        {
          id: `use_${definition.id}`,
          type: 'use_item',
          label: `Use ${definition.displayName} to ${destination.x},${destination.y}`,
          payload: {
            ...basePayload,
            x: destination.x,
            y: destination.y,
          },
        },
      ];
    }
    default:
      return [];
  }
}

export function buildInventoryUseItemActions(state: GameState): PlayerAction[] {
  const actions: PlayerAction[] = [];
  const seen = new Set<string>();
  for (const itemType of state.player.inventory) {
    if (seen.has(itemType)) {
      continue;
    }
    seen.add(itemType);
    const definition = getItemDefinition(itemType);
    actions.push(...buildUseItemActions(state, definition));
  }
  return actions;
}

const removeFirstInventoryItem = (inventory: string[], itemType: string): string[] => {
  const nextInventory = [...inventory];
  const index = nextInventory.indexOf(itemType);
  if (index >= 0) {
    nextInventory.splice(index, 1);
  }
  return nextInventory;
};

export interface ApplyItemEffectParams {
  state: GameState;
  definition: ItemDefinition;
  matchedAction: PlayerAction;
  event: (
    turn: number,
    type: string,
    message: string,
    payload?: Record<string, string | number | boolean | null>,
  ) => GameEvent;
}

export function applyItemEffect(params: ApplyItemEffectParams): GameEvent[] {
  const { state, definition, matchedAction, event } = params;
  const events: GameEvent[] = [];
  const turn = state.turn;

  state.player.inventory = removeFirstInventoryItem(
    state.player.inventory,
    definition.id,
  );

  switch (definition.effect as ItemEffectId) {
    case 'heal': {
      const before = state.player.hp;
      state.player.hp = Math.min(
        state.player.maxHp,
        state.player.hp + (definition.healAmount ?? 0),
      );
      events.push(
        event(turn, 'use_item', `You use ${definition.displayName}.`, {
          itemType: definition.id,
          effect: definition.effect,
          healed: state.player.hp - before,
        }),
      );
      break;
    }
    case 'blind_enemies': {
      const duration = definition.duration ?? 3;
      const tactical = tacticalState(state);
      state.tactical = tactical;
      tactical.enemyTrackingDisabledUntilTurn = turn + duration;
      events.push(
        event(
          turn,
          'use_item',
          `You hurl ${definition.displayName}. Enemies lose pursuit tracking for ${duration} turns.`,
          {
            itemType: definition.id,
            effect: definition.effect,
            duration,
            disabledUntilTurn: tactical.enemyTrackingDisabledUntilTurn,
          },
        ),
      );
      break;
    }
    case 'swap_position': {
      const targetId = matchedAction.payload?.targetId;
      const enemy = state.enemies.find((candidate) => candidate.id === targetId);
      if (!enemy) {
        break;
      }
      const playerPosition = { x: state.player.x, y: state.player.y };
      state.player.x = enemy.x;
      state.player.y = enemy.y;
      enemy.x = playerPosition.x;
      enemy.y = playerPosition.y;
      events.push(
        event(
          turn,
          'use_item',
          `You use ${definition.displayName} and swap places with ${enemy.label}.`,
          {
            itemType: definition.id,
            effect: definition.effect,
            targetId: enemy.id,
            enemyType: enemy.type,
            playerX: state.player.x,
            playerY: state.player.y,
            enemyX: enemy.x,
            enemyY: enemy.y,
          },
        ),
      );
      break;
    }
    case 'area_damage': {
      const range = definition.damageRange ?? 2;
      const damage = definition.damage ?? 3;
      const hits: string[] = [];
      for (const enemy of [...state.enemies]) {
        if (!inRange(state.player, enemy, range)) {
          continue;
        }
        const dealt = Math.max(1, damage);
        enemy.hp = Math.max(0, enemy.hp - dealt);
        hits.push(enemy.id);
        events.push(
          event(turn, 'attack', `Fire bursts hit ${enemy.label} for ${dealt}.`, {
            targetId: enemy.id,
            enemyType: enemy.type,
            damage: dealt,
            source: definition.id,
          }),
        );
        if (enemy.hp <= 0) {
          const index = state.enemies.findIndex((candidate) => candidate.id === enemy.id);
          if (index >= 0) {
            state.enemies.splice(index, 1);
            events.push(
              event(turn, 'enemy_defeated', `${enemy.label} dissolves.`, {
                targetId: enemy.id,
              }),
            );
          }
        }
      }
      events.unshift(
        event(
          turn,
          'use_item',
          `You plant ${definition.displayName}. ${hits.length} enem${hits.length === 1 ? 'y' : 'ies'} caught in the blaze.`,
          {
            itemType: definition.id,
            effect: definition.effect,
            damage,
            range,
            targetsHit: hits.length,
          },
        ),
      );
      break;
    }
    case 'warp': {
      const x = matchedAction.payload?.x;
      const y = matchedAction.payload?.y;
      if (typeof x !== 'number' || typeof y !== 'number') {
        break;
      }
      const destination = { x, y };
      if (!canOccupyTile(state, destination) || enemyAt(state, destination)) {
        break;
      }
      const from = { x: state.player.x, y: state.player.y };
      state.player.x = destination.x;
      state.player.y = destination.y;
      events.push(
        event(
          turn,
          'use_item',
          `You use ${definition.displayName} and warp to ${destination.x},${destination.y}.`,
          {
            itemType: definition.id,
            effect: definition.effect,
            fromX: from.x,
            fromY: from.y,
            x: destination.x,
            y: destination.y,
          },
        ),
      );
      break;
    }
    default:
      break;
  }

  return events;
}
