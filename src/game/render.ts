import { loadGameContent } from './content.js';
import { getEndingText, getOpeningText } from './dialogue.js';
import { defaultTacticalEffects } from './item-effects.js';
import type { GameState, ItemInstance, Position } from './types.js';

const content = loadGameContent();

const getItemDisplayName = (itemType: string): string => {
  const item = content.items.items.find((candidate) => candidate.id === itemType);
  if (!item) {
    throw new Error(`Missing item content: ${itemType}`);
  }
  return item.displayName;
};

const getItemDescription = (itemType: string): string => {
  const item = content.items.items.find((candidate) => candidate.id === itemType);
  if (!item) {
    throw new Error(`Missing item content: ${itemType}`);
  }
  return `${item.glyph} ${item.displayName}: ${item.description}`;
};

const RECENT_LOG_DISPLAY_LIMIT = 3;

const samePosition = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;

const enemyAt = (
  state: GameState,
  position: Position,
): GameState['enemies'][number] | undefined =>
  state.enemies.find((enemy) => samePosition(enemy, position));

const npcAt = (
  state: GameState,
  position: Position,
): GameState['npcs'][number] | undefined =>
  state.npcs.find((npc) => samePosition(npc, position));

const itemsAt = (state: GameState, position: Position): ItemInstance[] =>
  state.items.filter((item) => samePosition(item, position));

const inventoryLines = (inventory: string[]): string[] => {
  if (inventory.length === 0) {
    return ['Inventory: (empty)'];
  }
  const held = [...new Set(inventory)];
  return [
    `Inventory: ${held.map((itemType) => getItemDisplayName(itemType)).join(', ')}`,
    ...held.map((itemType) => `  - ${getItemDescription(itemType)}`),
  ];
};

const visibleItemDescriptions = (state: GameState): string => {
  const itemTypes = [...new Set(state.items.map((item) => item.type))];
  if (itemTypes.length === 0) {
    return 'Visible items: (none)';
  }
  return `Visible items: ${itemTypes.map((itemType) => getItemDescription(itemType)).join(' | ')}`;
};

const terminalSummary = (state: GameState): string => {
  switch (state.terminalStatus) {
    case 'WIN':
      return `Outcome: WIN - ${getEndingText()}`;
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
        const npc = npcAt(state, position);
        if (npc) {
          return npc.glyph;
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
  const tactical = state.tactical ?? defaultTacticalEffects();

  const dialogueLines =
    state.dialogue?.active === true
      ? [
          `Dialogue (${state.dialogue.npcId} @ ${state.dialogue.nodeId}):`,
          ...(() => {
            const tree = loadGameContent().events.dialogueTrees.find(
              (candidate) => candidate.id === state.dialogue?.treeId,
            );
            const node = tree?.nodes.find(
              (candidate) => candidate.id === state.dialogue?.nodeId,
            );
            return node ? [`- ${node.text}`] : ['- (unknown node)'];
          })(),
        ]
      : [];

  return [
    `Seven Floors to Dawn ${state.version}`,
    `Seed: ${state.seed} | Floor: ${state.floor}/${state.meta.totalFloors} | Turn: ${state.turn}/${state.meta.maxTurns}`,
    `Status: ${state.terminalStatus} | HP: ${state.player.hp}/${state.player.maxHp}`,
    terminalSummary(state),
    `Objective: ${state.meta.objective}`,
    `Opening: ${getOpeningText()}`,
    ...renderedRows,
    ...inventoryLines(state.player.inventory),
    visibleItemDescriptions(state),
    tactical.enemyTrackingDisabledUntilTurn > state.turn
      ? `Tactical: enemy pursuit blinded until turn ${tactical.enemyTrackingDisabledUntilTurn}.`
      : 'Tactical: none active.',
    ...dialogueLines,
    'Legend: @ You, K Keeper, s Slime, b Bat, S Shell, t Thief, g Ghost, ! Potion, ~ Smoke, % Swap, * Fire, ^ Warp, > Stairs, # Wall, . Floor',
    'Log:',
    ...state.log.slice(-RECENT_LOG_DISPLAY_LIMIT).map((entry) => `- ${entry}`),
  ].join('\n');
};
