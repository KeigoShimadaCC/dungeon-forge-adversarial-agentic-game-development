import {
  BAT_ENEMY_ID,
  POTION_ITEM_ID,
  SLIME_ENEMY_ID,
  SMOKE_BOMB_ITEM_ID,
} from './content.js';
import type { GameConfig } from './types.js';

export const DEMO_VERSION_IDS = ['v001', 'v002', 'v003'] as const;

export type DemoVersionId = (typeof DEMO_VERSION_IDS)[number];

export interface VersionProfile {
  version: DemoVersionId;
  implemented: boolean;
  label: string;
  gameConfig: GameConfig;
}

const V001_PROFILE: VersionProfile = {
  version: 'v001',
  implemented: true,
  label: 'Shallow Slime/Potion demo dungeon',
  gameConfig: {
    version: 'v001',
    totalFloors: 2,
    allowedEnemyIds: [SLIME_ENEMY_ID],
    allowedItemIds: [POTION_ITEM_ID],
    objective: 'Clear two slime-guarded floors and reach the dawn stairs.',
  },
};

const V002_PROFILE: VersionProfile = {
  version: 'v002',
  implemented: true,
  label: 'Smoke Bomb tactical clarity demo dungeon',
  gameConfig: {
    version: 'v002',
    totalFloors: 2,
    allowedEnemyIds: [SLIME_ENEMY_ID, BAT_ENEMY_ID],
    allowedItemIds: [POTION_ITEM_ID, SMOKE_BOMB_ITEM_ID],
    initialInventory: [SMOKE_BOMB_ITEM_ID],
    objective: 'Use Smoke Bombs to break pursuit, then reach the dawn stairs.',
    openingLog: [
      'Smoke Bomb starts in your pack: use it when enemies close in to break pursuit.',
      'Legend reminder: ~ marks Smoke Bombs, ! marks Healing Potions, > marks stairs.',
    ],
  },
};

const V003_PROFILE: VersionProfile = {
  version: 'v003',
  implemented: true,
  label: 'Tuned one-floor Smoke Bomb balance demo',
  gameConfig: {
    version: 'v003',
    totalFloors: 1,
    maxTurns: 64,
    allowedEnemyIds: [SLIME_ENEMY_ID],
    allowedItemIds: [POTION_ITEM_ID, SMOKE_BOMB_ITEM_ID],
    initialInventory: [SMOKE_BOMB_ITEM_ID, POTION_ITEM_ID],
    objective: 'Clear the shorter tuned demo floor with tactical item support.',
    openingLog: [
      'Tuned v003: one focused floor, a Potion, and a Smoke Bomb reduce sudden losses.',
      'Use Smoke Bomb to escape pursuit; use Potion only after taking damage.',
    ],
  },
};

export const VERSION_PROFILES: Record<DemoVersionId, VersionProfile> = {
  v001: V001_PROFILE,
  v002: V002_PROFILE,
  v003: V003_PROFILE,
};

export const isDemoVersionId = (version: string): version is DemoVersionId =>
  (DEMO_VERSION_IDS as readonly string[]).includes(version);

export const getVersionProfile = (version: string): VersionProfile | undefined =>
  isDemoVersionId(version) ? VERSION_PROFILES[version] : undefined;

export const isDemoVersionImplemented = (version: string): boolean =>
  getVersionProfile(version)?.implemented ?? false;

/** Maps harness version ids to engine start config; non-demo ids pass through `version` only. */
export const resolveGameConfigForVersion = (version: string): GameConfig => {
  const profile = getVersionProfile(version);
  if (profile) {
    return { ...profile.gameConfig };
  }
  return { version };
};
