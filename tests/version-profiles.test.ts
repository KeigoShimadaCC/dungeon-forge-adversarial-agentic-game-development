import { describe, expect, it } from 'vitest';

import { start } from '../src/game/engine.js';
import { SLIME_ENEMY_ID } from '../src/game/content.js';
import {
  DEMO_VERSION_IDS,
  resolveGameConfigForVersion,
  VERSION_PROFILES,
} from '../src/game/version-profiles.js';
import { runPlaythrough } from '../src/harness/runner.js';

describe('demo version profiles', () => {
  it('defines bounded v001–v003 profiles with only v001 implemented', () => {
    expect(DEMO_VERSION_IDS).toEqual(['v001', 'v002', 'v003']);
    expect(VERSION_PROFILES.v001.implemented).toBe(true);
    expect(VERSION_PROFILES.v002.implemented).toBe(false);
    expect(VERSION_PROFILES.v003.implemented).toBe(false);
    expect(VERSION_PROFILES.v001.gameConfig.totalFloors).toBe(2);
    expect(VERSION_PROFILES.v001.gameConfig.allowedEnemyIds).toEqual([SLIME_ENEMY_ID]);
  });

  it('starts v001 with shallow Slime/Potion-focused state', () => {
    const state = start('seed_001', resolveGameConfigForVersion('v001'));

    expect(state.version).toBe('v001');
    expect(state.meta.totalFloors).toBe(2);
    expect(state.enemies.every((enemy) => enemy.type === SLIME_ENEMY_ID)).toBe(true);
    expect(state.items.every((item) => item.type === 'potion')).toBe(true);
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
