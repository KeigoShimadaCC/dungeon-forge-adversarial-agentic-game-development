import { describe, expect, it } from 'vitest';

import { SCAFFOLD_PHASE, SCAFFOLD_VERSION } from '../src/scaffold.js';
import { CONTENT_SCHEMA_VERSION, loadGameContent } from '../src/game/content.js';
import { BASELINE_POLICY_IDS } from '../src/harness/policy-registry.js';

describe('Phase 01A scaffold', () => {
  it('exports scaffold metadata', () => {
    expect(SCAFFOLD_PHASE).toBe('01A');
    expect(SCAFFOLD_VERSION).toBe('0.0.0');
  });

  it('exposes harness baseline policy registry ids', () => {
    expect(BASELINE_POLICY_IDS).toEqual([
      'random',
      'stairs-seeking',
      'cautious-low-hp',
      'greedy-item-picker',
    ]);
  });

  it('loads validated static content through the content module', () => {
    const content = loadGameContent();

    expect(content.items.schemaVersion).toBe(CONTENT_SCHEMA_VERSION);
    expect(content.items.items.length).toBeGreaterThan(0);
  });
});
