import { describe, expect, it } from 'vitest';

import { start } from '../src/game/engine.js';
import { POTION_ITEM_ID, SLIME_ENEMY_ID, SMOKE_BOMB_ITEM_ID } from '../src/game/content.js';
import {
  DEMO_VERSION_IDS,
  resolveGameConfigForVersion,
  VERSION_PROFILES,
} from '../src/game/version-profiles.js';
import { runPlaythrough } from '../src/harness/runner.js';

describe('demo version profiles', () => {
  it('defines bounded v001–v003 profiles with v001 and v002 implemented', () => {
    expect(DEMO_VERSION_IDS).toEqual(['v001', 'v002', 'v003']);
    expect(VERSION_PROFILES.v001.implemented).toBe(true);
    expect(VERSION_PROFILES.v002.implemented).toBe(true);
    expect(VERSION_PROFILES.v003.implemented).toBe(false);
    expect(VERSION_PROFILES.v001.gameConfig.totalFloors).toBe(2);
    expect(VERSION_PROFILES.v001.gameConfig.allowedEnemyIds).toEqual([SLIME_ENEMY_ID]);
    expect(VERSION_PROFILES.v002.gameConfig.allowedItemIds).toEqual([
      POTION_ITEM_ID,
      SMOKE_BOMB_ITEM_ID,
    ]);
  });

  it('starts v001 with shallow Slime/Potion-focused state', () => {
    const state = start('seed_001', resolveGameConfigForVersion('v001'));

    expect(state.version).toBe('v001');
    expect(state.meta.totalFloors).toBe(2);
    expect(state.enemies.every((enemy) => enemy.type === SLIME_ENEMY_ID)).toBe(true);
    expect(state.items.every((item) => item.type === 'potion')).toBe(true);
  });

  it('starts v002 with Smoke Bomb guidance and tactical inventory', () => {
    const state = start('seed_001', resolveGameConfigForVersion('v002'));

    expect(state.version).toBe('v002');
    expect(state.player.inventory).toContain(SMOKE_BOMB_ITEM_ID);
    expect(state.log.some((entry) => entry.includes('Smoke Bomb starts'))).toBe(true);
  });

  it('propagates harness version into playthrough traces', async () => {
    const { trace } = await runPlaythrough({
      seed: 'seed_001',
      policyId: 'stairs-seeking',
      version: 'v001',
      runsRoot: process.cwd(),
      maxSteps: 32,
    });

    expect(trace.version).toBe('v001');
    expect(trace.steps[0]?.state_summary.floor).toBe(1);
  });

  it('passes through non-demo version ids as display version only', () => {
    const config = resolveGameConfigForVersion('v010');
    expect(config).toEqual({ version: 'v010' });
    expect(start('seed_001', config).version).toBe('v010');
    expect(start('seed_001', config).meta.totalFloors).toBe(5);
  });
});
