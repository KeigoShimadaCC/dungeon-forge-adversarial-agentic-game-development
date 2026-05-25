import path from 'node:path';

import { createRepoProfile, writeRepoProfile } from '../../core/repo-profiler.js';
import { optionValue, writeJson } from './shared.js';

const resolveOutputPath = (repoRoot: string, output: string): string =>
  path.isAbsolute(output) ? output : path.join(repoRoot, output);

export const runOnboardCommand = async (
  repoRoot: string,
  options: Record<string, string | boolean>,
): Promise<void> => {
  const profile = await createRepoProfile(repoRoot);
  const output = optionValue(options, 'output');
  const dryRun = options['dry-run'] === true;
  let outputPath: string | undefined;

  if (output && !dryRun) {
    outputPath = resolveOutputPath(repoRoot, output);
    await writeRepoProfile(profile, outputPath);
  }

  writeJson({
    ...profile,
    dryRun,
    ...(output ? { outputPath: outputPath ?? resolveOutputPath(repoRoot, output), written: !dryRun } : {}),
  });
};
