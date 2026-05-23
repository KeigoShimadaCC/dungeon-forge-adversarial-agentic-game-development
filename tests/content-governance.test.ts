import { describe, expect, it } from 'vitest';

import {
  CONTENT_GOVERNANCE_SCHEMA_VERSION,
  CURRENT_CONTENT_BUNDLES,
  governRawGameContent,
  renderContentGovernanceMarkdown,
  runContentGovernance,
  summarizeContentDiff,
  validateRawGameContent,
  type RawGameContentBundles,
} from '../src/harness/content-governance.js';
import { loadGameContent } from '../src/game/content.js';
import { loadScenarioPackContent } from '../src/game/scenario-packs.js';
import { runContentGovernanceCli } from '../src/harness/content-governance-cli.js';

const cloneCurrentRaw = (): RawGameContentBundles =>
  structuredClone(CURRENT_CONTENT_BUNDLES) as RawGameContentBundles;

describe('Phase 19B content governance', () => {
  it('passes current base, scenario-pack, and extension-pack content', () => {
    const report = runContentGovernance();
    expect(report.schemaVersion).toBe(CONTENT_GOVERNANCE_SCHEMA_VERSION);
    expect(report.ok).toBe(true);
    expect(report.summary.blockers).toBe(0);
    expect(report.sources.map((source) => source.source)).toEqual(
      expect.arrayContaining([
        'base content',
        'scenario pack:shrine_trial',
        'extension pack:reviewer_labs',
      ]),
    );
    expect(report.diffSummaries.length).toBeGreaterThan(0);
  });

  it('rejects missing references before content can enter gameplay', () => {
    const raw = cloneCurrentRaw();
    const floors = raw.floors as { floors: Array<{ itemIds: string[] }> };
    floors.floors[0]?.itemIds.push('missing_item');

    const result = governRawGameContent(raw, 'fixture missing reference');
    expect(result.sourceResult.status).toBe('blocked');
    expect(result.sourceResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'blocker',
          ruleId: 'schema-reference-validation',
          message: expect.stringContaining('unknown item id "missing_item"'),
        }),
      ]),
    );
  });

  it('rejects no-ending or unbounded floor settings', () => {
    const raw = cloneCurrentRaw();
    const floors = raw.floors as { floors: Array<{ maxTurns: number }> };
    if (floors.floors[0]) {
      floors.floors[0].maxTurns = 9999;
    }

    const result = governRawGameContent(raw, 'fixture unbounded');
    expect(result.sourceResult.status).toBe('blocked');
    expect(result.sourceResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'blocker',
          ruleId: 'bounded-floor-turns',
        }),
      ]),
    );
  });

  it('rejects infinite or no-ending prose before review', () => {
    const raw = cloneCurrentRaw();
    const events = raw.events as { opening: { text: string } };
    events.opening.text = 'This infinite no-ending dungeon never ends for the player.';

    const result = governRawGameContent(raw, 'fixture infinite prose');
    expect(result.sourceResult.status).toBe('blocked');
    expect(result.sourceResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'blocker',
          ruleId: 'forbidden-infinite-play',
        }),
      ]),
    );
  });

  it('rejects required media and external-service gameplay scope', () => {
    const raw = cloneCurrentRaw();
    const items = raw.items as { items: Array<{ description: string }> };
    if (items.items[0]) {
      items.items[0].description =
        'This relic requires image media and an external service during gameplay.';
    }

    const result = governRawGameContent(raw, 'fixture forbidden scope');
    expect(result.sourceResult.status).toBe('blocked');
    expect(result.sourceResult.diagnostics.map((entry) => entry.ruleId)).toEqual(
      expect.arrayContaining([
        'forbidden-required-media',
        'forbidden-external-service-gameplay',
      ]),
    );
  });

  it('allows warning-only clarity findings without blocking valid content', () => {
    const raw = cloneCurrentRaw();
    const items = raw.items as { items: Array<{ description: string }> };
    if (items.items[0]) {
      items.items[0].description = 'Short';
    }

    const result = governRawGameContent(raw, 'fixture warning only');
    expect(result.sourceResult.status).toBe('warning');
    expect(result.sourceResult.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          ruleId: 'short-clear-text',
        }),
      ]),
    );
    expect(result.sourceResult.diagnostics.some((entry) => entry.severity === 'blocker')).toBe(
      false,
    );
  });

  it('summarizes scenario-pack content diffs for review', () => {
    const base = loadGameContent();
    const shrineTrial = loadScenarioPackContent('shrine_trial');
    const summary = summarizeContentDiff(
      base,
      shrineTrial,
      'base content',
      'scenario pack:shrine_trial',
    );

    expect(summary.buckets.items.added).toContain('trial_tonic');
    expect(summary.buckets.enemies.added).toContain('trial_wisp');
    expect(summary.buckets.floors.changed.length).toBeGreaterThan(0);
  });

  it('renders markdown and supports the read-only CLI path', async () => {
    const report = runContentGovernance({ includeScenarioPacks: false, includeExtensionPacks: false });
    const markdown = renderContentGovernanceMarkdown(report);
    expect(markdown).toContain('Content Governance Report');
    expect(markdown).toContain('- Status: pass');

    let output = '';
    await runContentGovernanceCli(['--base-only', '--format', 'markdown'], {
      stdout: (value) => {
        output += value;
      },
    });
    expect(output).toContain('Content Governance Report');
    expect(output).toContain('No blockers or warnings');
  });

  it('exposes structured validation for raw content bundles', () => {
    const content = validateRawGameContent(cloneCurrentRaw());
    expect(content.items.items.length).toBeGreaterThan(0);
    expect(content.floors.floors.every((floor) => floor.maxTurns > 0)).toBe(true);
  });
});
