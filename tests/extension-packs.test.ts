import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  EXTENSION_PACKS_SCHEMA_VERSION,
  REJECTED_FORBIDDEN_CAPABILITY_EXTENSION_PACK,
  loadExtensionPack,
  loadExtensionPacksManifest,
  resolveExtensionRunSelection,
  validateExtensionPack,
  validateExtensionPacksManifest,
} from '../src/harness/extension-packs.js';
import { parseSimulateSeedArgs, runPlaythrough } from '../src/harness/runner.js';
import { summarizeVersion } from '../src/harness/version-loop.js';

const withTempRunsRoot = async (fn: (runsRoot: string) => Promise<void>): Promise<void> => {
  const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-extension-packs-'));
  try {
    await fn(runsRoot);
  } finally {
    await rm(runsRoot, { recursive: true, force: true });
  }
};

describe('Phase 19A extension packs', () => {
  it('loads the registered manifest and accepted reviewer labs pack', () => {
    const manifest = loadExtensionPacksManifest();
    expect(manifest.schemaVersion).toBe(EXTENSION_PACKS_SCHEMA_VERSION);
    expect(manifest.packs.map((pack) => pack.id)).toContain('reviewer_labs');

    const pack = loadExtensionPack('reviewer_labs');
    expect(pack.compatibility).toEqual({
      artifactSchemaVersion: '1',
      engineProtocolVersion: '1',
    });
    expect(pack.capabilities).toEqual([
      'local_content',
      'baseline_policies',
      'reviewer_personas',
      'scenario_presets',
    ]);
    expect(pack.components.scenarioPack).toBe('shrine_trial');
    expect(pack.components.baselinePolicies).toContain('stairs-seeking');
    expect(pack.components.reviewerPersonas.map((persona) => persona.id)).toEqual([
      'bug_hunter',
      'careful_player',
    ]);
    expect(pack.components.scenarioPresets[0]).toMatchObject({
      id: 'labs_smoke',
      policy: 'stairs-seeking',
      scenarioPack: 'shrine_trial',
      seed: 'seed_002',
    });
  });

  it('rejects forbidden capabilities, incompatible versions, duplicate ids, and unknown pack files', () => {
    expect(() =>
      validateExtensionPack(REJECTED_FORBIDDEN_CAPABILITY_EXTENSION_PACK, 'rejected'),
    ).toThrow(/forbidden capability "execute_code"/);

    expect(() =>
      validateExtensionPack(
        {
          ...loadExtensionPack('reviewer_labs'),
          compatibility: {
            artifactSchemaVersion: '1',
            engineProtocolVersion: 'future',
          },
        },
        'future-pack',
      ),
    ).toThrow(/engineProtocolVersion/);

    expect(() =>
      validateExtensionPacksManifest({
        schemaVersion: EXTENSION_PACKS_SCHEMA_VERSION,
        packs: [
          {
            id: 'reviewer_labs',
            label: 'Reviewer Labs',
            description: 'First copy.',
            packFile: 'extensions/reviewer-labs.json',
          },
          {
            id: 'reviewer_labs',
            label: 'Reviewer Labs Duplicate',
            description: 'Duplicate copy.',
            packFile: 'extensions/reviewer-labs.json',
          },
        ],
      }),
    ).toThrow(/duplicates extension pack "reviewer_labs"/);

    expect(() =>
      validateExtensionPacksManifest({
        schemaVersion: EXTENSION_PACKS_SCHEMA_VERSION,
        packs: [
          {
            id: 'unknown',
            label: 'Unknown',
            description: 'Unregistered file.',
            packFile: 'extensions/not-registered.json',
          },
        ],
      }),
    ).toThrow(/not registered/);
  });

  it('resolves extension defaults without changing explicit scenario-pack selection', () => {
    expect(resolveExtensionRunSelection('reviewer_labs')).toMatchObject({
      extensionPackId: 'reviewer_labs',
      extensionPackLabel: 'Reviewer Labs',
      scenarioPackId: 'shrine_trial',
    });

    expect(resolveExtensionRunSelection('reviewer_labs', 'default')).toMatchObject({
      scenarioPackId: 'shrine_trial',
    });

    expect(resolveExtensionRunSelection('reviewer_labs', 'shrine_trial')).toMatchObject({
      scenarioPackId: 'shrine_trial',
    });

    expect(resolveExtensionRunSelection(undefined, undefined)).toEqual({});
  });

  it('records extension metadata on trace and scorecard while keeping default runs unlabeled', async () => {
    const extensionRun = await runPlaythrough({
      seed: 'seed_002',
      policyId: 'stairs-seeking',
      version: 'v019',
      extensionPack: 'reviewer_labs',
      dryRun: true,
      maxSteps: 4,
    });

    expect(extensionRun.trace.extension_pack).toBe('reviewer_labs');
    expect(extensionRun.trace.extension_pack_label).toBe('Reviewer Labs');
    expect(extensionRun.trace.scenario_pack).toBe('shrine_trial');
    expect(extensionRun.scorecard.extension_pack).toBe('reviewer_labs');
    expect(extensionRun.scorecard.extension_pack_label).toBe('Reviewer Labs');
    expect(extensionRun.scorecard.scenario_pack).toBe('shrine_trial');

    const defaultRun = await runPlaythrough({
      seed: 'seed_002',
      policyId: 'stairs-seeking',
      version: 'v019',
      dryRun: true,
      maxSteps: 4,
    });
    expect(defaultRun.trace.extension_pack).toBeUndefined();
    expect(defaultRun.trace.scenario_pack).toBeUndefined();
  });

  it('persists extension metadata into version summaries and parses CLI extension flags', async () => {
    await withTempRunsRoot(async (runsRoot) => {
      await runPlaythrough({
        seed: 'seed_002',
        policyId: 'stairs-seeking',
        version: 'v019',
        extensionPack: 'reviewer_labs',
        runsRoot,
        maxSteps: 4,
      });

      const summary = await summarizeVersion(runsRoot, 'v019');
      expect(summary.extension_pack).toBe('reviewer_labs');
      expect(summary.extension_pack_label).toBe('Reviewer Labs');
      expect(summary.scenario_pack).toBe('shrine_trial');
      expect(summary.runs[0]).toMatchObject({
        extension_pack: 'reviewer_labs',
        extension_pack_label: 'Reviewer Labs',
        scenario_pack: 'shrine_trial',
      });
    });

    expect(
      parseSimulateSeedArgs([
        '--seed',
        'seed_002',
        '--policy',
        'stairs-seeking',
        '--version',
        'v019',
        '--extension-pack',
        'reviewer_labs',
      ]),
    ).toMatchObject({
      extensionPack: 'reviewer_labs',
      policyId: 'stairs-seeking',
      seed: 'seed_002',
      version: 'v019',
    });
  });
});
