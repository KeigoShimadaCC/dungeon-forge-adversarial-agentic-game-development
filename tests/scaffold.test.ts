import { describe, expect, it } from 'vitest';

import { SCAFFOLD_PHASE, SCAFFOLD_VERSION } from '../src/scaffold.js';
import { CONTENT_SCHEMA_VERSION, loadGameContent } from '../src/game/content.js';
import { HARNESS_RUN_PLAYTHROUGH_PLACEHOLDER } from '../src/harness/run-playthrough.js';

describe('Phase 01A scaffold', () => {
  it('exports scaffold metadata', () => {
    expect(SCAFFOLD_PHASE).toBe('01A');
    expect(SCAFFOLD_VERSION).toBe('0.0.0');
  });

  it('imports placeholder harness modules', () => {
    expect(HARNESS_RUN_PLAYTHROUGH_PLACEHOLDER).toBe(true);
  });

  it('loads validated static content through the content module', () => {
    const content = loadGameContent();

    expect(content.items.schemaVersion).toBe(CONTENT_SCHEMA_VERSION);
    expect(content.items.items.length).toBeGreaterThan(0);
  });
});
