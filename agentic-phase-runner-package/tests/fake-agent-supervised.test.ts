import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { runInitCommand } from '../src/cli/commands/init.js';
import { configureAgentPreset } from '../src/core/agent-presets.js';
import { runBoom } from '../src/core/boom.js';
import { loadAutopilotConfig, runAutopilotForPhase } from '../src/core/phase-autopilot.js';

const execFileAsync = promisify(execFile);

const git = async (repoRoot: string, args: string[]): Promise<void> => {
  await execFileAsync('git', args, { cwd: repoRoot });
};

describe('fake-agent supervised execution', () => {
  it('invokes fake shell agents and writes deterministic evidence', async () => {
    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-fake-agent-test-'));
    const worktreePath = path.join(path.dirname(repoRoot), `${path.basename(repoRoot)}-phase-01a-project-foundation-wt`);
    try {
      await runInitCommand(repoRoot, {});
      await runBoom(repoRoot, {
        idea: 'Build fake app',
        apply: true,
        force: true,
        timestamp: '2026-05-25T00-00-00-000Z',
      });
      await configureAgentPreset(repoRoot, { preset: 'fake-shell-test', apply: true });

      const configPath = path.join(repoRoot, 'automation', 'autopilot-config.json');
      const autopilotConfig = JSON.parse(await readFile(configPath, 'utf8')) as Record<string, unknown> & {
        git: { baseBranch: string; baseRef: string };
        dependencyBootstrapCommands?: string[];
      };
      autopilotConfig.git.baseRef = 'HEAD';
      autopilotConfig.dependencyBootstrapCommands = [];
      await writeFile(configPath, JSON.stringify(autopilotConfig, null, 2));

      await git(repoRoot, ['init']);
      await git(repoRoot, ['add', '-A']);
      await git(repoRoot, ['-c', 'user.email=test@example.invalid', '-c', 'user.name=Agentic Test', 'commit', '-m', 'initial']);

      const loadedConfig = await loadAutopilotConfig(repoRoot, configPath);
      const summary = await runAutopilotForPhase(repoRoot, 'PHASE-01A', {
        runId: 'fake-agent-supervised',
        safetyFlags: {
          allowAgentExecution: true,
          allowPr: false,
          allowMerge: false,
          dryRun: false,
          continueOnBlocked: false,
          parallel: 1,
          planApproval: 'auto',
          plannerAgent: 'shell',
          executorAgent: 'shell',
          recheckerAgent: 'shell',
        },
        deps: {
          autopilotConfig: loadedConfig,
        },
      });

      expect(['blocked', 'complete']).toContain(summary.status);
      expect(summary.completedStages).toContain('planning');
      expect(summary.completedStages).toContain('execution');
      expect(summary.completedStages).toContain('recheck');
      await expect(readFile(path.join(summary.evidenceDir, 'agent-results', 'planner-report.json'), 'utf8')).resolves.toContain(
        '"planAcceptanceRecommendation": "accept"',
      );
      await expect(readFile(path.join(summary.evidenceDir, 'agent-results', 'executor-report.json'), 'utf8')).resolves.toContain(
        'docs/fake-agent-output.md',
      );
      await expect(readFile(path.join(summary.evidenceDir, 'agent-results', 'recheck-report.json'), 'utf8')).resolves.toContain(
        '"phaseAcceptanceComplete": true',
      );
    } finally {
      await rm(worktreePath, { recursive: true, force: true });
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
