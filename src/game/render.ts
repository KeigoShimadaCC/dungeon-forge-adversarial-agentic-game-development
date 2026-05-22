import { loadGameContent } from './content.js';
import type { GameState, ItemInstance, Position } from './types.js';

const content = loadGameContent();

const getItemDisplayName = (itemType: string): string => {
  const item = content.items.items.find((candidate) => candidate.id === itemType);
  if (!item) {
    throw new Error(`Missing item content: ${itemType}`);
  }
  return item.displayName;
};

const RECENT_LOG_DISPLAY_LIMIT = 3;

const samePosition = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;

const enemyAt = (
  state: GameState,
  position: Position,
): GameState['enemies'][number] | undefined =>
  state.enemies.find((enemy) => samePosition(enemy, position));

const itemsAt = (state: GameState, position: Position): ItemInstance[] =>
  state.items.filter((item) => samePosition(item, position));

const inventoryLabel = (inventory: string[]): string => {
  if (inventory.length === 0) {
    return '(empty)';
  }
  return inventory
    .map((itemType) => getItemDisplayName(itemType))
    .join(', ');
};

const terminalSummary = (state: GameState): string => {
  switch (state.terminalStatus) {
    case 'WIN':
      return 'Outcome: WIN - You escaped the dungeon.';
    case 'LOSS':
      return 'Outcome: LOSS - You fell in the dungeon.';
    case 'ABORTED':
      return 'Outcome: ABORTED - The run stopped before a win or loss.';
    case 'ACTIVE':
      return 'Outcome: ACTIVE - Run in progress.';
  }
};

const renderMapRows = (state: GameState): string[] =>
  state.map.tiles.map((row, y) =>
    row
      .map((tile, x) => {
        const position = { x, y };
        if (samePosition(state.player, position)) {
          return '@';
        }
        const enemy = enemyAt(state, position);
        if (enemy) {
          return enemy.glyph;
        }
        const item = itemsAt(state, position)[0];
        if (item) {
          return item.glyph;
        }
        return tile.glyph;
      })
      .join(''),
  );

/**
 * Pure ASCII render of a game state. Does not mutate `state`.
 */
export const render = (state: GameState): string => {
  const renderedRows = renderMapRows(state);

  return [
    `Seven Floors to Dawn ${state.version}`,
    `Seed: ${state.seed} | Floor: ${state.floor}/${state.meta.totalFloors} | Turn: ${state.turn}/${state.meta.maxTurns}`,
    `Status: ${state.terminalStatus} | HP: ${state.player.hp}/${state.player.maxHp}`,
    terminalSummary(state),
    `Objective: ${state.meta.objective}`,
    ...renderedRows,
    `Inventory: ${inventoryLabel(state.player.inventory)}`,
    'Legend: @ You, s Slime, b Bat, S Shell, t Thief, g Ghost, ! Potion, > Stairs, # Wall, . Floor',
    'Log:',
    ...state.log.slice(-RECENT_LOG_DISPLAY_LIMIT).map((entry) => `- ${entry}`),
  ].join('\n');
};
