#!/usr/bin/env node
import path from 'node:path';

import { runBoomCommand } from './commands/boom.js';
import { runBundleCommand } from './commands/bundle.js';
import { runConfigureAgentCommand } from './commands/configure-agent.js';
import { runDoctorCommand } from './commands/doctor.js';
import { runGateCommand } from './commands/gate.js';
import { runInitCommand } from './commands/init.js';
import { runInspectCommand } from './commands/inspect.js';
import { runMigrateCommand } from './commands/migrate.js';
import { runNextCommand } from './commands/next.js';
import { runOnboardCommand } from './commands/onboard.js';
import { runPlanCommand } from './commands/plan.js';
import { runPresetsCommand } from './commands/presets.js';
import { runReportCommand } from './commands/report.js';
import { runResumeCommand } from './commands/resume.js';
import { runRunCommand } from './commands/run.js';
import { runStatusCommand } from './commands/status.js';
import { runVersionCommand } from './commands/version.js';
import { runWhyBlockedCommand } from './commands/why-blocked.js';

const usage = `Usage:
  agentic version [--json]
  agentic init [--repo-root <path>] [--force]
  agentic doctor [--repo-root <path>]
  agentic onboard [--repo-root <path>] [--dry-run] [--output <path>]
  agentic plan [--repo-root <path>] --idea "..." [--dry-run] [--apply] [--force] [--output <dir>]
  agentic boom [--repo-root <path>] --idea "..." [--dry-run] [--apply] [--force] [--output <dir>]
  agentic presets [--json]
  agentic configure-agent [--repo-root <path>] --preset manual|codex|cursor|claude-code|mixed-codex-cursor [--dry-run] [--apply]
  agentic migrate [--repo-root <path>] [--dry-run] [--apply]
  agentic inspect [--repo-root <path>] [--phase PHASE-01A] [--run-id <id>] [--latest]
  agentic why-blocked [--repo-root <path>] [--phase PHASE-01A] [--run-id <id>] [--latest]
  agentic report [--repo-root <path>] [--phase PHASE-01A] [--run-id <id>] [--latest] [--output <path>]
  agentic status [--repo-root <path>]
  agentic next [--from PHASE-01A] [--parallel 1]
  agentic bundle --phase PHASE-01A [--output <dir>] [--run-id <id>]
  agentic run --phase PHASE-01A --dry-run [--run-id <id>] [--mode manual|supervised|auto] [--agents manual|shell] [--preset codex]
  agentic run --phase PHASE-01A --allow-agent-execution
  agentic run --from PHASE-01A --until-complete
  agentic resume --phase PHASE-01A --run-id <run-id>
  agentic gate --phase PHASE-01A --evidence <path>

Safety flags:
  --dry-run
  --allow-agent-execution
  --allow-pr
  --allow-merge
  --continue-on-blocked
  --mode manual|supervised|auto
  --agents manual|shell
  --preset manual|codex|cursor|claude-code|mixed-codex-cursor
  --plan-approval auto|manual|disabled
  --planner-agent shell|manual
  --executor-agent shell|manual
  --rechecker-agent shell|manual
`;

const parseArgs = (argv: string[]): { command: string; repoRoot: string; options: Record<string, string | boolean> } => {
  const normalized = argv[0] === '--' ? argv.slice(1) : argv;
  const command = normalized[0] ?? 'help';
  const options: Record<string, string | boolean> = {};
  let repoRoot = process.cwd();
  for (let index = 1; index < normalized.length; index += 1) {
    const arg = normalized[index];
    if (!arg?.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
    const name = arg.slice(2);
    const next = normalized[index + 1];
    const booleanFlags = new Set([
      'force',
      'apply',
      'dry-run',
      'json',
      'latest',
      'until-complete',
      'allow-agent-execution',
      'allow-pr',
      'allow-merge',
      'continue-on-blocked',
    ]);
    if (booleanFlags.has(name)) {
      options[name] = true;
      continue;
    }
    if (!next || next.startsWith('--')) {
      throw new Error(`Missing value for --${name}`);
    }
    if (name === 'repo-root') {
      repoRoot = path.resolve(next);
    } else {
      options[name] = next;
    }
    index += 1;
  }
  return { command, repoRoot, options };
};

export const runCli = async (argv = process.argv.slice(2)): Promise<void> => {
  const parsed = parseArgs(argv);
  if (parsed.command === 'help' || parsed.command === '--help' || parsed.command === '-h') {
    process.stdout.write(usage);
    return;
  }
  if (parsed.command === 'version') return runVersionCommand(parsed.options);
  if (parsed.command === 'init') return runInitCommand(parsed.repoRoot, parsed.options);
  if (parsed.command === 'doctor') return runDoctorCommand(parsed.repoRoot, parsed.options);
  if (parsed.command === 'onboard') return runOnboardCommand(parsed.repoRoot, parsed.options);
  if (parsed.command === 'plan') return runPlanCommand(parsed.repoRoot, parsed.options);
  if (parsed.command === 'boom') return runBoomCommand(parsed.repoRoot, parsed.options);
  if (parsed.command === 'presets') return runPresetsCommand(parsed.options);
  if (parsed.command === 'configure-agent') return runConfigureAgentCommand(parsed.repoRoot, parsed.options);
  if (parsed.command === 'migrate') return runMigrateCommand(parsed.repoRoot, parsed.options);
  if (parsed.command === 'inspect') return runInspectCommand(parsed.repoRoot, parsed.options);
  if (parsed.command === 'why-blocked') return runWhyBlockedCommand(parsed.repoRoot, parsed.options);
  if (parsed.command === 'report') return runReportCommand(parsed.repoRoot, parsed.options);
  if (parsed.command === 'status') return runStatusCommand(parsed.repoRoot);
  if (parsed.command === 'next') return runNextCommand(parsed.repoRoot, parsed.options);
  if (parsed.command === 'bundle') return runBundleCommand(parsed.repoRoot, parsed.options);
  if (parsed.command === 'run') return runRunCommand(parsed.repoRoot, parsed.options);
  if (parsed.command === 'resume') return runResumeCommand(parsed.repoRoot, parsed.options);
  if (parsed.command === 'gate') return runGateCommand(parsed.repoRoot, parsed.options);
  throw new Error(`Unknown command: ${parsed.command}\n${usage}`);
};

runCli().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
