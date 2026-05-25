#!/usr/bin/env node
import path from 'node:path';

import { runBundleCommand } from './commands/bundle.js';
import { runGateCommand } from './commands/gate.js';
import { runInitCommand } from './commands/init.js';
import { runNextCommand } from './commands/next.js';
import { runResumeCommand } from './commands/resume.js';
import { runRunCommand } from './commands/run.js';
import { runStatusCommand } from './commands/status.js';

const usage = `Usage:
  agentic init [--repo-root <path>] [--force]
  agentic status [--repo-root <path>]
  agentic next [--from PHASE-01A] [--parallel 1]
  agentic bundle --phase PHASE-01A [--output <dir>] [--run-id <id>]
  agentic run --phase PHASE-01A --dry-run [--run-id <id>]
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
      'dry-run',
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
  if (parsed.command === 'init') return runInitCommand(parsed.repoRoot, parsed.options);
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
