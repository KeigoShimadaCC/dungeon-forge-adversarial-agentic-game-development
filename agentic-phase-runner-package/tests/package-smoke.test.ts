import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

import { runInitCommand } from '../src/cli/commands/init.js';
import { loadRunnerContext } from '../src/cli/commands/shared.js';
import { loadAutopilotConfig, runAutopilotForPhase } from '../src/core/phase-autopilot.js';
import {
  buildPhaseRunBundle,
  evaluateAutomerge,
  getRunnablePhases,
  type PhaseMergeEvidence,
} from '../src/core/phase-runner.js';

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const builtCliPath = path.join(packageRoot, 'dist', 'src', 'cli', 'index.js');
const builtCreateRunnerPath = path.join(packageRoot, 'dist', 'src', 'cli', 'create-agentic-runner.js');

const withTempRepo = async (fn: (repoRoot: string) => Promise<void>): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-package-smoke-'));
  try {
    await runInitCommand(repoRoot, {});
    await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
};

describe('agentic phase runner package', () => {
  it('initializes a minimal repo from templates without root package files', async () => {
    await withTempRepo(async (repoRoot) => {
      await expect(readFile(path.join(repoRoot, 'AGENTS.md'), 'utf8')).resolves.toContain(
        'Operating Rules',
      );
      await expect(readFile(path.join(repoRoot, 'automation', 'phase-graph.json'), 'utf8')).resolves.toContain(
        'PHASE-01A',
      );
    });
  });

  it('loads graph/state and selects a runnable phase', async () => {
    await withTempRepo(async (repoRoot) => {
      const { config } = await loadRunnerContext(repoRoot);
      const runnable = getRunnablePhases(config, { repoRoot, from: 'PHASE-01A', parallel: 1 });
      expect(runnable).toHaveLength(1);
      expect(runnable[0]?.phase.id).toBe('PHASE-01A');
    });
  });

  it('builds a phase bundle from generic prompt templates', async () => {
    await withTempRepo(async (repoRoot) => {
      const { config, paths } = await loadRunnerContext(repoRoot);
      const bundle = await buildPhaseRunBundle(config, repoRoot, 'PHASE-01A', 'smoke-run', paths);
      expect(bundle.codexPlanPrompt).toContain('You are the planner');
      expect(bundle.cursorImplementationPrompt).toContain('You are the executor');
      expect(bundle.cursorRecheckPrompt).toContain('You are the recheck agent');
      expect(bundle.evidenceDir).toContain(path.join('runs', 'phase-runner', 'PHASE-01A', 'smoke-run'));
    });
  });

  it('writes dry-run evidence without invoking agents or git mutations', async () => {
    await withTempRepo(async (repoRoot) => {
      const summary = await runAutopilotForPhase(repoRoot, 'PHASE-01A', {
        runId: 'dry-smoke',
        safetyFlags: {
          allowAgentExecution: false,
          allowPr: false,
          allowMerge: false,
          dryRun: true,
          continueOnBlocked: false,
          parallel: 1,
          planApproval: 'manual',
          plannerAgent: 'manual',
          executorAgent: 'manual',
          recheckerAgent: 'manual',
        },
      });
      expect(summary.status).toBe('complete');
      await expect(readFile(path.join(summary.evidenceDir, 'dry-run-plan.txt'), 'utf8')).resolves.toContain(
        'Dry run: true',
      );
    });
  });

  it('uses custom agentic.config.yaml runner paths during autopilot dry-run', async () => {
    await withTempRepo(async (repoRoot) => {
      await rename(path.join(repoRoot, 'automation'), path.join(repoRoot, 'custom-automation'));
      await writeFile(
        path.join(repoRoot, 'agentic.config.yaml'),
        [
          'paths:',
          '  graphPath: custom-automation/phase-graph.json',
          '  statePath: custom-automation/phase-state.json',
          '  policyPath: custom-automation/policies/automerge-policy.json',
          '  promptsDir: custom-automation/prompts',
          '  autopilotConfigPath: custom-automation/autopilot-config.json',
          '',
        ].join('\n'),
      );

      const { autopilotConfigPath, paths } = await loadRunnerContext(repoRoot);
      expect(paths.graphPath).toContain('custom-automation');
      const summary = await runAutopilotForPhase(repoRoot, 'PHASE-01A', {
        runId: 'custom-paths-dry-smoke',
        safetyFlags: {
          allowAgentExecution: false,
          allowPr: false,
          allowMerge: false,
          dryRun: true,
          continueOnBlocked: false,
          parallel: 1,
          planApproval: 'manual',
          plannerAgent: 'manual',
          executorAgent: 'manual',
          recheckerAgent: 'manual',
        },
        deps: {
          autopilotConfig: await loadAutopilotConfig(repoRoot, autopilotConfigPath),
          runnerPaths: paths,
        },
      });
      expect(summary.status).toBe('complete');
      await expect(readFile(path.join(summary.evidenceDir, 'phase-run-plan.json'), 'utf8')).resolves.toContain(
        'git status --short --branch',
      );
    });
  });

  it('executes the built CLI for help, init, status, dry-run, and gate directory input', async () => {
    await execFileAsync('pnpm', ['--dir', packageRoot, 'run', 'build']);
    const help = await execFileAsync(process.execPath, [builtCliPath, 'help']);
    expect(help.stdout).toContain('agentic init');
    expect(help.stdout).toContain('agentic version');
    expect(help.stdout).toContain('agentic presets');
    expect(help.stdout).toContain('agentic configure-agent');
    expect(help.stdout).toContain('agentic migrate');
    expect(help.stdout).toContain('agentic report');

    const version = await execFileAsync(process.execPath, [builtCliPath, 'version', '--json']);
    expect(version.stdout).toContain('"packageName": "agentic-phase-runner-package"');

    const presets = await execFileAsync(process.execPath, [builtCliPath, 'presets', '--json']);
    expect(presets.stdout).toContain('"id": "codex"');

    const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-built-cli-smoke-'));
    try {
      const init = await execFileAsync(process.execPath, [builtCliPath, 'init', '--repo-root', repoRoot]);
      expect(init.stdout).toContain('"status": "initialized"');

      const status = await execFileAsync(process.execPath, [builtCliPath, 'status', '--repo-root', repoRoot]);
      expect(status.stdout).toContain('"currentPhase": "PHASE-01A"');

      const doctor = await execFileAsync(process.execPath, [builtCliPath, 'doctor', '--repo-root', repoRoot]);
      expect(doctor.stdout).toContain('"schemaVersion": 1');

      const configureDryRun = await execFileAsync(process.execPath, [
        builtCliPath,
        'configure-agent',
        '--repo-root',
        repoRoot,
        '--preset',
        'manual',
        '--dry-run',
      ]);
      expect(configureDryRun.stdout).toContain('"status": "planned"');

      const configureApply = await execFileAsync(process.execPath, [
        builtCliPath,
        'configure-agent',
        '--repo-root',
        repoRoot,
        '--preset',
        'manual',
        '--apply',
      ]);
      expect(configureApply.stdout).toContain('"status": "applied"');

      const migrate = await execFileAsync(process.execPath, [
        builtCliPath,
        'migrate',
        '--repo-root',
        repoRoot,
        '--dry-run',
      ]);
      expect(migrate.stdout).toContain('"schemaVersion": 1');

      const onboard = await execFileAsync(process.execPath, [
        builtCliPath,
        'onboard',
        '--repo-root',
        repoRoot,
        '--dry-run',
      ]);
      expect(onboard.stdout).toContain('"dryRun": true');

      const boomDryRun = await execFileAsync(process.execPath, [
        builtCliPath,
        'boom',
        '--repo-root',
        repoRoot,
        '--idea',
        'Build a local-first note app',
        '--dry-run',
      ]);
      expect(boomDryRun.stdout).toContain('"status": "planned"');

      const boomApply = await execFileAsync(process.execPath, [
        builtCliPath,
        'boom',
        '--repo-root',
        repoRoot,
        '--idea',
        'Build a local-first note app',
        '--apply',
        '--force',
      ]);
      expect(boomApply.stdout).toContain('"dryRun": false');
      expect(boomApply.stdout).toContain('"boomReportPath"');

      const planDryRun = await execFileAsync(process.execPath, [
        builtCliPath,
        'plan',
        '--repo-root',
        repoRoot,
        '--idea',
        'Build a local-first note app',
        '--dry-run',
      ]);
      expect(planDryRun.stdout).toContain('"status": "planned"');

      const planApply = await execFileAsync(process.execPath, [
        builtCliPath,
        'plan',
        '--repo-root',
        repoRoot,
        '--idea',
        'Build a local-first note app',
        '--apply',
        '--force',
      ]);
      expect(planApply.stdout).toContain('"status": "applied"');
      await expect(readFile(path.join(repoRoot, 'automation', 'phase-graph.json'), 'utf8')).resolves.toContain(
        'PHASE-01B',
      );

      const dryRun = await execFileAsync(process.execPath, [
        builtCliPath,
        'run',
        '--repo-root',
        repoRoot,
        '--phase',
        'PHASE-01A',
        '--dry-run',
        '--mode',
        'manual',
        '--run-id',
        'built-cli-dry',
      ]);
      expect(dryRun.stdout).toContain('"dryRun": true');
      expect(dryRun.stdout).toContain('"mode": "manual"');
      expect(dryRun.stdout).toContain('"modeExplanation": "No agents, PRs, or merges are allowed."');

      const supervisedDryRun = await execFileAsync(process.execPath, [
        builtCliPath,
        'run',
        '--repo-root',
        repoRoot,
        '--phase',
        'PHASE-01A',
        '--dry-run',
        '--mode',
        'supervised',
        '--agents',
        'manual',
        '--run-id',
        'built-cli-supervised-dry',
      ]);
      expect(supervisedDryRun.stdout).toContain('"mode": "supervised"');
      expect(supervisedDryRun.stdout).toContain('"agents": "manual"');

      const inspect = await execFileAsync(process.execPath, [
        builtCliPath,
        'inspect',
        '--repo-root',
        repoRoot,
        '--latest',
      ]);
      expect(inspect.stdout).toContain('"latestRun"');

      const report = await execFileAsync(process.execPath, [
        builtCliPath,
        'report',
        '--repo-root',
        repoRoot,
        '--latest',
      ]);
      expect(report.stdout).toContain('# Agentic Run Report');

      const whyBlocked = await execFileAsync(process.execPath, [
        builtCliPath,
        'why-blocked',
        '--repo-root',
        repoRoot,
        '--latest',
      ]);
      expect(whyBlocked.stdout).toContain('"schemaVersion": 1');

      const evidenceDir = path.join(repoRoot, 'runs', 'phase-runner', 'PHASE-01A', 'built-cli-dry');
      await mkdir(evidenceDir, { recursive: true });
      const evidence: PhaseMergeEvidence = {
        localCommands: [{ command: 'git diff --check', status: 'pass' }],
        remoteChecks: 'none',
        cursorRecheck: 'pass',
        phaseAcceptanceComplete: true,
        changedPaths: ['README.md'],
        worktreeClean: true,
        secretsDetected: false,
        blockingGaps: [],
      };
      await writeFile(
        path.join(evidenceDir, 'phase-merge-evidence.json'),
        JSON.stringify(evidence, null, 2),
      );
      const gate = await execFileAsync(process.execPath, [
        builtCliPath,
        'gate',
        '--repo-root',
        repoRoot,
        '--phase',
        'PHASE-01A',
        '--evidence',
        evidenceDir,
      ]);
      expect(gate.stdout).toContain('"decision": "block"');

      const createRunner = await execFileAsync(process.execPath, [
        builtCreateRunnerPath,
        '--target',
        repoRoot,
        '--dry-run',
      ]);
      expect(createRunner.stdout).toContain('"status": "planned"');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('blocks gate decisions for out-of-scope paths and secrets', async () => {
    await withTempRepo(async (repoRoot) => {
      const { config } = await loadRunnerContext(repoRoot);
      const phase = config.graph.phases[0];
      expect(phase).toBeDefined();
      const evidence: PhaseMergeEvidence = {
        localCommands: config.automergePolicy.requiredLocalCommands.map((command) => ({
          command,
          status: 'pass',
        })),
        remoteChecks: 'none',
        cursorRecheck: 'pass',
        phaseAcceptanceComplete: true,
        changedPaths: ['.env', 'src/index.ts'],
        worktreeClean: true,
        secretsDetected: true,
        blockingGaps: ['manual blocker'],
      };
      const decision = evaluateAutomerge(phase!, config.automergePolicy, evidence);
      expect(decision.decision).toBe('block');
      expect(decision.reasons.join('\n')).toContain('Secret or credential material was detected');
    });
  });
});
