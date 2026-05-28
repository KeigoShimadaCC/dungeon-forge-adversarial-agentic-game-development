import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runInitCommand } from '../src/cli/commands/init.js';
import { runDoctor } from '../src/core/doctor.js';
import { runMigrations } from '../src/core/migrate.js';

const withTempRepo = async (fn: (repoRoot: string) => Promise<void>): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-migrate-test-'));
  try {
    await runInitCommand(repoRoot, {});
    await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
};

describe('migrate', () => {
  it('dry-runs missing preflight command repair', async () => {
    await withTempRepo(async (repoRoot) => {
      const configPath = path.join(repoRoot, 'automation', 'autopilot-config.json');
      const config = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
      delete config.preflightCommands;
      await writeFile(configPath, JSON.stringify(config, null, 2));

      const report = await runMigrations(repoRoot);
      expect(report.status).toBe('planned');
      expect(report.migrations.map((migration) => migration.id)).toContain(
        'autopilot-config-preflightCommands',
      );
      expect(await readFile(configPath, 'utf8')).not.toContain('git status --short --branch');
    });
  });

  it('applies safe defaults across config files', async () => {
    await withTempRepo(async (repoRoot) => {
      const configPath = path.join(repoRoot, 'automation', 'autopilot-config.json');
      const statePath = path.join(repoRoot, 'automation', 'phase-state.json');
      const policyPath = path.join(repoRoot, 'automation', 'policies', 'automerge-policy.json');
      const config = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
      delete config.preflightCommands;
      await writeFile(configPath, JSON.stringify(config, null, 2));
      await writeFile(
        statePath,
        JSON.stringify(
          {
            schemaVersion: 1,
            lastUpdated: '2026-05-25T00:00:00.000Z',
            currentPhase: 'UNKNOWN',
            phases: {},
          },
          null,
          2,
        ),
      );
      const policy = JSON.parse(await readFile(policyPath, 'utf8')) as Record<string, unknown>;
      policy.enabled = true;
      policy.allowNoRemoteChecksWhenLocalGatePasses = true;
      await writeFile(policyPath, JSON.stringify(policy, null, 2));

      const report = await runMigrations(repoRoot, { apply: true });
      expect(report.status).toBe('applied');
      const nextConfig = JSON.parse(await readFile(configPath, 'utf8')) as { preflightCommands: string[] };
      const nextState = JSON.parse(await readFile(statePath, 'utf8')) as { currentPhase: string; phases: Record<string, unknown> };
      const nextPolicy = JSON.parse(await readFile(policyPath, 'utf8')) as { enabled: boolean; allowNoRemoteChecksWhenLocalGatePasses: boolean };
      expect(nextConfig.preflightCommands).toEqual(['git status --short --branch']);
      expect(nextState.currentPhase).toBe('PHASE-01A');
      expect(nextState.phases['PHASE-01A']).toEqual({ status: 'queued' });
      expect(nextPolicy.enabled).toBe(false);
      expect(nextPolicy.allowNoRemoteChecksWhenLocalGatePasses).toBe(false);
    });
  });

  it('doctor recommends migration for fixable drift', async () => {
    await withTempRepo(async (repoRoot) => {
      const configPath = path.join(repoRoot, 'automation', 'autopilot-config.json');
      const config = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown>;
      delete config.preflightCommands;
      await writeFile(configPath, JSON.stringify(config, null, 2));

      const report = await runDoctor(repoRoot, {
        commandRunner: async () => ({ exitCode: 0, stdout: '## main\n', stderr: '' }),
      });
      expect(report.checks.find((check) => check.id === 'config-migrations-available')?.status).toBe('warn');
      expect(report.recommendedNextActions.join('\n')).toContain('agentic migrate');
    });
  });
});
