import { POTION_ITEM_ID, SLIME_ENEMY_ID } from './content.js';
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
  implemented: false,
  label: 'Reserved: reviewer-driven tactical/clarity improvement',
  gameConfig: {
    version: 'v002',
  },
};

const V003_PROFILE: VersionProfile = {
  version: 'v003',
  implemented: false,
  label: 'Reserved: reviewer-driven balance/clarity tuning',
  gameConfig: {
    version: 'v003',
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
