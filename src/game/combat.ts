/** Player melee damage against an enemy, respecting defense with a minimum of 1. */
export function calcPlayerDamageToEnemy(
  playerAttack: number,
  enemyDefense: number,
): number {
  return Math.max(1, playerAttack - enemyDefense);
}
