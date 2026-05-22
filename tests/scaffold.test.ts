import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { SCAFFOLD_PHASE, SCAFFOLD_VERSION } from '../src/scaffold.js';
import { HARNESS_RUN_PLAYTHROUGH_PLACEHOLDER } from '../src/harness/run-playthrough.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('Phase 01A scaffold', () => {
  it('exports scaffold metadata', () => {
    expect(SCAFFOLD_PHASE).toBe('01A');
    expect(SCAFFOLD_VERSION).toBe('0.0.0');
  });

  it('imports placeholder harness modules', () => {
    expect(HARNESS_RUN_PLAYTHROUGH_PLACEHOLDER).toBe(true);
  });

  it('loads static content placeholders', () => {
    const items = JSON.parse(
      readFileSync(join(repoRoot, 'content/items.json'), 'utf8'),
    ) as { schemaVersion: string; items: unknown[] };

    expect(items.schemaVersion).toBe('01A-placeholder');
    expect(items.items).toEqual([]);
  });
});
