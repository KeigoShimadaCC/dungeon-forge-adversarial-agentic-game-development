import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from '../harness/json.js';
import { buildStaticDemoBundle } from './build-bundle.js';
import { renderStaticDemoHtml } from './render-html.js';
import { renderStaticDemoMarkdown } from './render-markdown.js';
import type { StaticDemoBundle } from './types.js';

export interface ExportStaticDemoResult {
  bundle: StaticDemoBundle;
  outputDir: string;
  files: string[];
}

export const staticDemoLinkBaseForOutput = (runsRoot: string, outputDir: string): string => {
  const relative = path.relative(outputDir, runsRoot).replace(/\\/g, '/');
  return relative.length === 0 ? '.' : relative;
};

export const exportStaticDemoBundle = async (
  runsRoot: string,
  outputDir: string,
): Promise<ExportStaticDemoResult> => {
  const bundle = await buildStaticDemoBundle(runsRoot);
  const resolvedOutput = path.resolve(outputDir);
  const linkBase = staticDemoLinkBaseForOutput(path.resolve(runsRoot), resolvedOutput);

  await mkdir(resolvedOutput, { recursive: true });

  const files = [
    path.join(resolvedOutput, 'index.html'),
    path.join(resolvedOutput, 'index.md'),
    path.join(resolvedOutput, 'manifest.json'),
  ];

  await writeFile(files[0]!, renderStaticDemoHtml(bundle, { linkBase }), 'utf8');
  await writeFile(files[1]!, renderStaticDemoMarkdown(bundle), 'utf8');
  await writeFile(
    files[2]!,
    `${stringifyDeterministicJson({
      generatedAt: bundle.generatedAt,
      runsRoot: bundle.runsRoot,
      readOnly: bundle.readOnly,
      purpose: bundle.purpose,
      demoSummaryPath: bundle.demoSummaryPath,
      demoSummaryPresent: bundle.demoSummaryPresent,
      timeline: bundle.timeline,
      comparisons: bundle.comparisons,
      versions: bundle.index.versions.map((entry) => ({
        version: entry.version,
        coverageStatus: entry.summary.status,
        acceptanceStatus: entry.summary.acceptance_status,
        missingArtifactCount: entry.missingArtifactCount,
        summaryPath: entry.summaryPath,
        comparisons: entry.comparisons,
        artifacts: entry.artifacts.map((artifact) => ({
          kind: artifact.kind,
          label: artifact.label,
          relativePath: artifact.relativePath,
          present: artifact.present,
          evidenceLabel: artifact.present ? 'generated' : 'missing',
        })),
      })),
      regenerationCommands: bundle.regenerationCommands,
    })}\n`,
    'utf8',
  );

  return { bundle, outputDir: resolvedOutput, files };
};
