import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runInitCommand } from '../src/cli/commands/init.js';
import { runDoctor, type SafeCommandRunner } from '../src/core/doctor.js';

const withTempDir = async (fn: (repoRoot: string) => Promise<void>): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-doctor-test-'));
  try {
    await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
};

const fakeGitStatus: SafeCommandRunner = async (command) =>
  command === 'git'
    ? { exitCode: 0, stdout: '## main\n', stderr: '' }
    : { exitCode: 0, stdout: 'gh version 0.0.0\n', stderr: '' };

const fakeNoGit: SafeCommandRunner = async () => ({
  exitCode: 1,
  stdout: '',
  stderr: 'not a git repository',
});

describe('doctor', () => {
  it('returns pass or warn for an initialized repo', async () => {
    await withTempDir(async (repoRoot) => {
      await runInitCommand(repoRoot, {});
      const report = await runDoctor(repoRoot, { commandRunner: fakeGitStatus });
      expect(['pass', 'warn']).toContain(report.status);
      expect(report.checks.find((check) => check.id === 'phase-graph-valid')?.status).toBe('pass');
      expect(report.checks.find((check) => check.id === 'phase-state-matches-graph')?.status).toBe('pass');
    });
  });

  it('reports missing workflow files for an empty temp dir', async () => {
    await withTempDir(async (repoRoot) => {
      const report = await runDoctor(repoRoot, { commandRunner: fakeNoGit });
      expect(report.status).toBe('fail');
      expect(report.recommendedNextActions.join('\n')).toContain('agentic init');
      expect(report.checks.find((check) => check.id === 'git-repo-detected')?.status).toBe('warn');
      expect(report.checks.find((check) => check.id === 'phase-graph-exists')?.status).toBe('fail');
    });
  });

  it('detects graph and state mismatches', async () => {
    await withTempDir(async (repoRoot) => {
      await runInitCommand(repoRoot, {});
      await writeFile(
        path.join(repoRoot, 'automation', 'phase-state.json'),
        JSON.stringify(
          {
            schemaVersion: 1,
            lastUpdated: '2026-05-25',
            currentPhase: 'PHASE-DOES-NOT-EXIST',
            phases: {
              'PHASE-EXTRA': { status: 'queued' },
            },
          },
          null,
          2,
        ),
      );
      const report = await runDoctor(repoRoot, { commandRunner: fakeGitStatus });
      expect(report.status).toBe('fail');
      expect(report.checks.find((check) => check.id === 'phase-state-matches-graph')?.status).toBe('fail');
      expect(report.checks.find((check) => check.id === 'current-phase-exists')?.status).toBe('fail');
    });
  });

  it('surfaces unsafe configured commands', async () => {
    await withTempDir(async (repoRoot) => {
      await runInitCommand(repoRoot, {});
      const graphPath = path.join(repoRoot, 'automation', 'phase-graph.json');
      const graph = JSON.parse(await readFile(graphPath, 'utf8')) as { globalValidationCommands: string[] };
      graph.globalValidationCommands = ['git reset --hard'];
      await writeFile(graphPath, JSON.stringify(graph, null, 2));

      const report = await runDoctor(repoRoot, { commandRunner: fakeGitStatus });
      expect(report.status).toBe('fail');
      expect(report.checks.find((check) => check.id === 'command-safety')?.status).toBe('fail');
    });
  });
});
