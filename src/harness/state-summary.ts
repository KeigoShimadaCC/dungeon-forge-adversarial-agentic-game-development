import type { GameState } from '../game/types.js';
import type { StateSummary } from './types.js';

export const buildStateSummary = (state: GameState): StateSummary => ({
  turn: state.turn,
  floor: state.floor,
  hp: state.player.hp,
  maxHp: state.player.maxHp,
  terminalStatus: state.terminalStatus,
  playerPosition: { x: state.player.x, y: state.player.y },
  inventory: [...state.player.inventory],
  enemyCount: state.enemies.length,
  itemCount: state.items.length,
});
