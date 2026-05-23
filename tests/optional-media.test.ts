import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  OPTIONAL_MEDIA_SCHEMA_VERSION,
  buildOptionalMediaAcceptanceCheck,
  buildOptionalMediaReport,
  collectOptionalMediaDiagnostics,
  listKnownOptionalMediaSceneIds,
  loadOptionalMediaManifest,
  renderOptionalMediaMarkdown,
  runOptionalMediaHeadlessCheck,
  writeOptionalMediaReport,
  type OptionalMediaManifest,
} from '../src/harness/optional-media.js';
import {
  OPTIONAL_MEDIA_CLI_USAGE,
  parseOptionalMediaCliArgs,
  runOptionalMediaCli,
} from '../src/harness/optional-media-cli.js';

const cloneManifest = (): OptionalMediaManifest =>
  structuredClone(loadOptionalMediaManifest()) as OptionalMediaManifest;

const withTempDir = async (fn: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'df-optional-media-'));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

describe('Phase 19C optional media', () => {
  it('loads valid optional media metadata linked to known versions and scenes', async () => {
    const manifest = loadOptionalMediaManifest();
    const knownScenes = listKnownOptionalMediaSceneIds();
    const report = await buildOptionalMediaReport({ manifest });

    expect(manifest.schemaVersion).toBe(OPTIONAL_MEDIA_SCHEMA_VERSION);
    expect(manifest.presentations.length).toBeGreaterThan(0);
    expect(manifest.presentations.every((entry) => entry.required === false)).toBe(true);
    expect(knownScenes).toEqual(
      expect.arrayContaining(['scenario:shrine_trial', 'preset:reviewer_labs:labs_smoke']),
    );
    expect(report.ok).toBe(true);
    expect(report.summary.blockers).toBe(0);
  });

  it('reports missing local media assets as non-blocking optional state', async () => {
    await withTempDir(async (repoRoot) => {
      const report = await buildOptionalMediaReport({ repoRoot, checkFiles: true });

      expect(report.ok).toBe(true);
      expect(report.summary.missingAssets).toBe(loadOptionalMediaManifest().presentations.length);
      expect(report.presentations.every((entry) => entry.assetStatus === 'missing')).toBe(true);
    });
  });

  it('blocks required media before it can affect acceptance', () => {
    const manifest = cloneManifest();
    if (manifest.presentations[0]) {
      manifest.presentations[0].required = true;
    }

    const diagnostics = collectOptionalMediaDiagnostics(manifest);
    const acceptance = buildOptionalMediaAcceptanceCheck(manifest);

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'blocker',
          ruleId: 'optional-media-required-forbidden',
        }),
      ]),
    );
    expect(acceptance.status).toBe('fail');
    expect(acceptance.details?.some((entry) => entry.includes('optional-media-required-forbidden'))).toBe(
      true,
    );
  });

  it('blocks invalid version IDs, unknown scene IDs, and unsafe asset paths', () => {
    const manifest = cloneManifest();
    if (manifest.presentations[0]) {
      manifest.presentations[0].versionIds = ['alpha'];
      manifest.presentations[0].sceneIds = ['scene:missing'];
      manifest.presentations[0].assetPath = 'https://example.invalid/title-card.png';
    }

    const ruleIds = collectOptionalMediaDiagnostics(manifest).map((entry) => entry.ruleId);

    expect(ruleIds).toEqual(
      expect.arrayContaining([
        'optional-media-invalid-version',
        'optional-media-invalid-scene',
        'optional-media-local-asset-only',
      ]),
    );
  });

  it('proves headless text and ASCII gameplay render without media files', () => {
    const check = runOptionalMediaHeadlessCheck();

    expect(check.ok).toBe(true);
    expect(check.renderNonEmpty).toBe(true);
    expect(check.renderHasAsciiMarkers).toBe(true);
    expect(check.fallbackPresentForEveryPresentation).toBe(true);
  });

  it('renders and writes reports without making missing assets fatal', async () => {
    await withTempDir(async (repoRoot) => {
      const report = await buildOptionalMediaReport({ repoRoot, checkFiles: true });
      const markdown = renderOptionalMediaMarkdown(report);
      const outputPath = path.join(repoRoot, 'report.md');

      expect(markdown).toContain('Optional Media Report');
      expect(markdown).toContain('Missing assets:');

      await writeOptionalMediaReport(report, outputPath, 'markdown');
      await expect(readFile(outputPath, 'utf8')).resolves.toContain('Optional Media Report');
    });
  });

  it('supports JSON and markdown CLI output', async () => {
    await withTempDir(async (repoRoot) => {
      let jsonOutput = '';
      await runOptionalMediaCli(['--check-files', '--media-root', repoRoot], {
        stdout: (value) => {
          jsonOutput += value;
        },
      });
      const parsed = JSON.parse(jsonOutput) as { ok: boolean; summary: { missingAssets: number } };
      expect(parsed.ok).toBe(true);
      expect(parsed.summary.missingAssets).toBeGreaterThan(0);

      let markdownOutput = '';
      await runOptionalMediaCli(['--format', 'markdown'], {
        stdout: (value) => {
          markdownOutput += value;
        },
      });
      expect(markdownOutput).toContain('Optional Media Report');
      expect(markdownOutput).toContain('No blockers or warnings');
    });
  });

  it('parses CLI arguments and exposes help text', () => {
    expect(parseOptionalMediaCliArgs(['--format', 'markdown', '--check-files']).format).toBe(
      'markdown',
    );
    expect(parseOptionalMediaCliArgs(['--repo-root', '/tmp/example']).mediaRoot).toBe(
      '/tmp/example',
    );
    expect(OPTIONAL_MEDIA_CLI_USAGE).toContain('Missing media files are reported');
  });
});
