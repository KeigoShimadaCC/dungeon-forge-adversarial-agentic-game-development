import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runOnboardCommand } from '../src/cli/commands/onboard.js';
import { createRepoProfile, writeRepoProfile } from '../src/core/repo-profiler.js';

const withTempDir = async (fn: (repoRoot: string) => Promise<void>): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-profiler-test-'));
  try {
    await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
};

const exists = async (filePath: string): Promise<boolean> =>
  access(filePath)
    .then(() => true)
    .catch(() => false);

const silenceStdout = async (fn: () => Promise<void>): Promise<void> => {
  const originalWrite = process.stdout.write;
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = originalWrite;
  }
};

const captureStdout = async (fn: () => Promise<void>): Promise<string> => {
  const originalWrite = process.stdout.write;
  let output = '';
  process.stdout.write = ((chunk: string | Uint8Array) => {
    output += chunk.toString();
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
    return output;
  } finally {
    process.stdout.write = originalWrite;
  }
};

describe('repo profiler', () => {
  it('detects package manager, scripts, and validation candidates for a TypeScript repo', async () => {
    await withTempDir(async (repoRoot) => {
      await mkdir(path.join(repoRoot, 'src'));
      await mkdir(path.join(repoRoot, 'tests'));
      await writeFile(path.join(repoRoot, 'pnpm-lock.yaml'), '');
      await writeFile(path.join(repoRoot, 'tsconfig.json'), '{}');
      await writeFile(path.join(repoRoot, 'next.config.ts'), 'export default {};');
      await writeFile(
        path.join(repoRoot, 'package.json'),
        JSON.stringify({
          scripts: {
            test: 'vitest run',
            typecheck: 'tsc --noEmit',
            build: 'next build',
          },
        }),
      );

      const profile = await createRepoProfile(repoRoot);
      expect(profile.packageManager).toBe('pnpm');
      expect(profile.languages).toContain('typescript');
      expect(profile.frameworks).toContain('nextjs');
      expect(profile.validationCandidates).toEqual([
        'pnpm test',
        'pnpm run typecheck',
        'pnpm run build',
      ]);
    });
  });

  it('does not write output in dry-run mode', async () => {
    await withTempDir(async (repoRoot) => {
      const outputPath = path.join(repoRoot, '.agentic', 'repo-profile.json');
      await silenceStdout(async () => {
        await runOnboardCommand(repoRoot, { 'dry-run': true, output: outputPath });
      });
      expect(await exists(outputPath)).toBe(false);
    });
  });

  it('writes a report when output is supplied without dry-run', async () => {
    await withTempDir(async (repoRoot) => {
      const outputPath = path.join(repoRoot, '.agentic', 'repo-profile.json');
      const profile = await createRepoProfile(repoRoot);
      await writeRepoProfile(profile, outputPath);
      await expect(readFile(outputPath, 'utf8')).resolves.toContain('"schemaVersion": 1');
    });
  });

  it('resolves relative output paths against the target repo root', async () => {
    await withTempDir(async (repoRoot) => {
      const output = await captureStdout(async () => {
        await runOnboardCommand(repoRoot, { output: '.agentic/repo-profile.json' });
      });
      const parsed = JSON.parse(output) as { outputPath: string; written: boolean };
      expect(parsed.outputPath).toBe(path.join(repoRoot, '.agentic', 'repo-profile.json'));
      expect(parsed.written).toBe(true);
      await expect(readFile(path.join(repoRoot, '.agentic', 'repo-profile.json'), 'utf8')).resolves.toContain(
        '"schemaVersion": 1',
      );
    });
  });
});
