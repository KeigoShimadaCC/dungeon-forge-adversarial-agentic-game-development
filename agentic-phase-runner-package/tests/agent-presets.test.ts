import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runInitCommand } from '../src/cli/commands/init.js';
import { configureAgentPreset, listAgentPresets } from '../src/core/agent-presets.js';

const withTempRepo = async (fn: (repoRoot: string) => Promise<void>): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-presets-test-'));
  try {
    await runInitCommand(repoRoot, {});
    await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
};

describe('agent presets', () => {
  it('lists known presets', () => {
    const ids = listAgentPresets().map((preset) => preset.id);
    expect(ids).toContain('manual');
    expect(ids).toContain('codex');
    expect(ids).toContain('cursor');
    expect(ids).toContain('mixed-codex-cursor');
  });

  it('dry-runs without writing autopilot config', async () => {
    await withTempRepo(async (repoRoot) => {
      const target = path.join(repoRoot, 'automation', 'autopilot-config.json');
      const before = await readFile(target, 'utf8');
      const report = await configureAgentPreset(repoRoot, { preset: 'codex' });
      expect(report.status).toBe('planned');
      expect(report.preview?.agents.planner.provider).toBe('shell');
      expect(await readFile(target, 'utf8')).toBe(before);
    });
  });

  it('applies presets while preserving unrelated config fields', async () => {
    await withTempRepo(async (repoRoot) => {
      const report = await configureAgentPreset(repoRoot, { preset: 'codex', apply: true });
      expect(report.status).toBe('applied');
      const config = JSON.parse(
        await readFile(path.join(repoRoot, 'automation', 'autopilot-config.json'), 'utf8'),
      ) as {
        preflightCommands?: string[];
        git?: { baseBranch?: string };
        agents: { planner: { provider: string; commandTemplate: string } };
      };
      expect(config.preflightCommands).toEqual(['git status --short --branch']);
      expect(config.git?.baseBranch).toBe('main');
      expect(config.agents.planner.provider).toBe('shell');
      expect(config.agents.planner.commandTemplate).toContain('codex exec');
    });
  });

  it('rejects invalid presets', async () => {
    await withTempRepo(async (repoRoot) => {
      await expect(configureAgentPreset(repoRoot, { preset: 'unknown' })).rejects.toThrow('Unknown preset');
    });
  });
});
