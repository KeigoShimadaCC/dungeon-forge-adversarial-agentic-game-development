import type { GameState } from '../game/types.js';
import type { PlayerAction } from '../game/types.js';

const RECENT_LOG_LINES = 6;

export const formatStatusPanel = (state: GameState): string => {
  const inventory =
    state.player.inventory.length > 0
      ? state.player.inventory.join(', ')
      : '(empty)';
  const recentLog = state.log.slice(-RECENT_LOG_LINES);
  const logBlock =
    recentLog.length > 0
      ? recentLog.map((line) => `  - ${line}`).join('\n')
      : '  - (no log entries yet)';

  return [
    `Turn ${state.turn} | Floor ${state.floor} | ${state.terminalStatus}`,
    `HP: ${state.player.hp}/${state.player.maxHp}`,
    `Inventory: ${inventory}`,
    'Recent log:',
    logBlock,
  ].join('\n');
};

export const formatHumanPlayScreen = (
  state: GameState,
  renderedMap: string,
): string => {
  const divider = '-'.repeat(56);
  return [
    divider,
    formatStatusPanel(state),
    divider,
    renderedMap.trimEnd(),
    divider,
  ].join('\n');
};

export const formatActionMenu = (actions: readonly PlayerAction[]): string => {
  if (actions.length === 0) {
    return 'No structured actions are available.';
  }

  const lines = actions.map(
    (action, index) =>
      `  ${index + 1}) [${action.type}] ${action.label} (id: ${action.id})`,
  );
  return ['Structured actions (from engine):', ...lines].join('\n');
};
