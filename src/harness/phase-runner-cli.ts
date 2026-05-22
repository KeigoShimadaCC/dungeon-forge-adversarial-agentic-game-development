import path from 'node:path';

import {
  buildPhaseRunBundle,
  branchNameForPhase,
  defaultRunnerPaths,
  evaluateAutomerge,
  getRunnablePhases,
  loadPhaseRunnerConfig,
  markPhaseBlocked,
  markPhaseComplete,
  summarizePhaseRunner,
  validatePhaseGraph,
  writePhaseRunBundle,
  writePhaseState,
  type PhaseMergeEvidence,
} from './phase-runner.js';
import { stringifyDeterministicJson } from './json.js';
import { handleCliError } from './version-loop-cli.js';

interface ParsedArgs {
  command: 'status' | 'next' | 'bundle' | 'gate' | 'complete' | 'block' | 'help';
  repoRoot: string;
  from?: string;
  parallel?: number;
  phase?: string;
  output?: string;
  evidence?: string;
  runId?: string;
  pr?: number;
  mergeCommit?: string;
  evidenceDir?: string;
  reason?: string;
}

const usage = `Usage:
  pnpm run phase -- status [--repo-root <path>]
  pnpm run phase -- next [--from PHASE-13A] [--parallel 2]
  pnpm run phase -- bundle --phase PHASE-13A [--output <dir>] [--run-id <id>]
  pnpm run phase -- gate --phase PHASE-13A --evidence <evidence.json>
  pnpm run phase -- complete --phase PHASE-13A [--pr 27] [--merge-commit <sha>] [--evidence-dir <path>]
  pnpm run phase -- block --phase PHASE-13A --reason <reason>

Notes:
  Codex is the orchestrator. Cursor/composer-2.5 is the bounded coding and recheck delegate.
  The current implementation is deterministic planning and gate evaluation; git/gh execution should use the generated bundle.
`;

const parseArgs = (argv: string[]): ParsedArgs => {
  const normalizedArgv = argv[0] === '--' ? argv.slice(1) : argv;
  const args: ParsedArgs = {
    command: (normalizedArgv[0] as ParsedArgs['command']) ?? 'help',
    repoRoot: process.cwd(),
  };

  if (!['status', 'next', 'bundle', 'gate', 'complete', 'block', 'help'].includes(args.command)) {
    throw new Error(`Unknown phase command: ${normalizedArgv[0]}\n${usage}`);
  }

  for (let index = 1; index < normalizedArgv.length; index += 1) {
    const arg = normalizedArgv[index];
    const next = normalizedArgv[index + 1];
    if (arg === '--repo-root' && next) {
      args.repoRoot = path.resolve(next);
      index += 1;
    } else if (arg === '--from' && next) {
      args.from = next;
      index += 1;
    } else if (arg === '--parallel' && next) {
      args.parallel = Number.parseInt(next, 10);
      if (!Number.isInteger(args.parallel) || args.parallel < 1) {
        throw new Error('--parallel must be a positive integer');
      }
      index += 1;
    } else if (arg === '--phase' && next) {
      args.phase = next;
      index += 1;
    } else if (arg === '--output' && next) {
      args.output = path.resolve(next);
      index += 1;
    } else if (arg === '--evidence' && next) {
      args.evidence = path.resolve(next);
      index += 1;
    } else if (arg === '--run-id' && next) {
      args.runId = next;
      index += 1;
    } else if (arg === '--pr' && next) {
      args.pr = Number.parseInt(next, 10);
      if (!Number.isInteger(args.pr) || args.pr < 1) {
        throw new Error('--pr must be a positive integer');
      }
      index += 1;
    } else if (arg === '--merge-commit' && next) {
      args.mergeCommit = next;
      index += 1;
    } else if (arg === '--evidence-dir' && next) {
      args.evidenceDir = next;
      index += 1;
    } else if (arg === '--reason' && next) {
      args.reason = next;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      args.command = 'help';
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}\n${usage}`);
    }
  }

  return args;
};

const requireArg = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`Missing required argument: --${name}`);
  }
  return value;
};

const writeJson = (value: unknown): void => {
  process.stdout.write(stringifyDeterministicJson(value));
};

const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const { readFile } = await import('node:fs/promises');
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
};

export const runPhaseRunnerCli = async (argv: string[] = process.argv.slice(2)): Promise<void> => {
  const args = parseArgs(argv);
  if (args.command === 'help') {
    process.stdout.write(usage);
    return;
  }

  const paths = defaultRunnerPaths(args.repoRoot);
  const config = await loadPhaseRunnerConfig(args.repoRoot, paths);
  const graphErrors = validatePhaseGraph(config.graph);
  if (graphErrors.length > 0) {
    throw new Error(`Invalid phase graph:\n${graphErrors.map((error) => `- ${error}`).join('\n')}`);
  }

  if (args.command === 'status') {
    writeJson(summarizePhaseRunner(config, args.repoRoot));
    return;
  }

  if (args.command === 'next') {
    writeJson({
      runnable: getRunnablePhases(config, {
        repoRoot: args.repoRoot,
        from: args.from,
        parallel: args.parallel,
        runId: args.runId,
      }),
    });
    return;
  }

  if (args.command === 'bundle') {
    const phaseId = requireArg(args.phase, 'phase');
    const bundle = await buildPhaseRunBundle(config, args.repoRoot, phaseId, args.runId, paths);
    const outputDir = args.output ?? bundle.evidenceDir;
    await writePhaseRunBundle(bundle, outputDir);
    writeJson({
      phase: phaseId,
      outputDir,
      files: [
        path.join(outputDir, 'codex-plan-prompt.md'),
        path.join(outputDir, 'cursor-implementation-prompt.md'),
        path.join(outputDir, 'cursor-recheck-prompt.md'),
        path.join(outputDir, 'phase-run-plan.json'),
      ],
    });
    return;
  }

  if (args.command === 'gate') {
    const phaseId = requireArg(args.phase, 'phase');
    const evidencePath = requireArg(args.evidence, 'evidence');
    const phase = config.graph.phases.find((entry) => entry.id === phaseId);
    if (!phase) {
      throw new Error(`Unknown phase: ${phaseId}`);
    }
    const evidence = await readJsonFile<PhaseMergeEvidence>(evidencePath);
    writeJson(evaluateAutomerge(phase, config.automergePolicy, evidence));
    return;
  }

  if (args.command === 'complete') {
    const phaseId = requireArg(args.phase, 'phase');
    const phase = config.graph.phases.find((entry) => entry.id === phaseId);
    if (!phase) {
      throw new Error(`Unknown phase: ${phaseId}`);
    }
    const nextState = markPhaseComplete(config.graph, config.state, phaseId, {
      branch: branchNameForPhase(phase),
      ...(args.pr !== undefined ? { pr: args.pr } : {}),
      ...(args.mergeCommit ? { mergeCommit: args.mergeCommit } : {}),
      ...(args.evidenceDir ? { evidenceDir: args.evidenceDir } : {}),
    });
    await writePhaseState(paths.statePath, nextState);
    writeJson({
      phase: phaseId,
      status: 'complete',
      currentPhase: nextState.currentPhase,
      statePath: paths.statePath,
    });
    return;
  }

  if (args.command === 'block') {
    const phaseId = requireArg(args.phase, 'phase');
    const nextState = markPhaseBlocked(
      config.graph,
      config.state,
      phaseId,
      requireArg(args.reason, 'reason'),
    );
    await writePhaseState(paths.statePath, nextState);
    writeJson({
      phase: phaseId,
      status: 'blocked',
      currentPhase: nextState.currentPhase,
      statePath: paths.statePath,
    });
  }
};

runPhaseRunnerCli().catch(handleCliError);
