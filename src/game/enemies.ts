import {
  SLIME_ENEMY_ID,
  type EnemyDefinition,
  type GameContent,
  loadGameContent,
} from './content.js';

export {
  BAT_ENEMY_ID,
  GHOST_ENEMY_ID,
  SHELL_ENEMY_ID,
  SLIME_ENEMY_ID,
  THIEF_ENEMY_ID,
} from './content.js';
export type { EnemyDefinition } from './content.js';

let cachedContent: GameContent | undefined;

function getContent(): GameContent {
  cachedContent ??= loadGameContent();
  return cachedContent;
}

export function getAllEnemies(): readonly EnemyDefinition[] {
  return getContent().enemies.enemies;
}

export function getEnemyById(id: string): EnemyDefinition | undefined {
  return getAllEnemies().find((enemy) => enemy.id === id);
}

export function getSlime(): EnemyDefinition {
  const slime = getEnemyById(SLIME_ENEMY_ID);
  if (!slime) {
    throw new Error(`Missing required enemy content: ${SLIME_ENEMY_ID}`);
  }
  return slime;
}
