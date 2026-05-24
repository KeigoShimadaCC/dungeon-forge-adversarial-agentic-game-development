import path from 'node:path';

import {
  executeStage,
  inspectRun,
  loadAutopilotConfig,
  resumeAutopilot,
  runAutopilotForPhase,
  runAutopilotUntilComplete,
  type ExecuteStageName,
} from './phase-autopilot.js';
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
  command:
    | 'status'
    | 'next'
    | 'bundle'
    | 'gate'
    | 'complete'
    | 'block'
    | 'execute'
    | 'autopilot'
    | 'resume'
    | 'inspect-run'
    | 'help';
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
  stage?: ExecuteStageName;
  dryRun?: boolean;
  untilComplete?: boolean;
  allowAgentExecution?: boolean;
  allowPr?: boolean;
  allowMerge?: boolean;
  continueOnBlocked?: boolean;
  planApproval?: 'auto' | 'manual' | 'disabled';
  plannerAgent?: 'shell' | 'manual';
  executorAgent?: 'shell' | 'manual';
  recheckerAgent?: 'shell' | 'manual';
  plannerCommandTemplate?: string;
  executorCommandTemplate?: string;
  recheckerCommandTemplate?: string;
}

const usage = `Usage:
  pnpm run phase -- status [--repo-root <path>]
  pnpm run phase -- next [--from PHASE-13A] [--parallel 2]
  pnpm run phase -- bundle --phase PHASE-13A [--output <dir>] [--run-id <id>]
  pnpm run phase -- gate --phase PHASE-13A --evidence <evidence.json>
  pnpm run phase -- complete --phase PHASE-13A [--pr 27] [--merge-commit <sha>] [--evidence-dir <path>]
  pnpm run phase -- block --phase PHASE-13A --reason <reason>

  pnpm run phase -- execute --phase PHASE-20A --stage <stage> [--run-id <id>]
  pnpm run phase -- autopilot --phase PHASE-20A [--dry-run] [--run-id <id>]
  pnpm run phase -- autopilot --from PHASE-20A --until-complete [--parallel 1]
  pnpm run phase -- resume --phase PHASE-20A --run-id <id>
  pnpm run phase -- inspect-run --phase PHASE-20A --run-id <id>

Safety flags (default deny):
  --allow-agent-execution   invoke planner/implementer/rechecker shell templates
  --allow-pr                create PR via gh
  --allow-merge             merge PR when automerge gate allows
  --dry-run                 write run plan only; no git/agent/pr/merge mutations
  --continue-on-blocked     keep going after a blocked phase (until-complete only)
  --plan-approval <mode>    auto, manual, or disabled; default manual
  --planner-agent <mode>    shell or manual; default manual
  --executor-agent <mode>   shell or manual; default manual
  --rechecker-agent <mode>  shell or manual; default manual

Notes:
  Codex orchestrates; Cursor/composer-2.5 is the bounded delegate via automation/autopilot-config.json.
`;

const parseArgs = (argv: string[]): ParsedArgs => {
  const normalizedArgv = argv[0] === '--' ? argv.slice(1) : argv;
  const args: ParsedArgs = {
    command: (normalizedArgv[0] as ParsedArgs['command']) ?? 'help',
    repoRoot: process.cwd(),
  };

  const knownCommands: ParsedArgs['command'][] = [
    'status',
    'next',
    'bundle',
    'gate',
    'complete',
    'block',
    'execute',
    'autopilot',
    'resume',
    'inspect-run',
    'help',
  ];
  if (!knownCommands.includes(args.command)) {
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
    } else if (arg === '--stage' && next) {
      const allowedStages = new Set<ExecuteStageName>([
        'bundle',
        'preflight',
        'setup',
        'bootstrap',
        'planning',
        'plan-acceptance',
        'execution',
        'cursor-subtasks',
        'restricted-agent-delegate',
        'recheck',
        'local-validation',
        'changed-path-scan',
        'secret-scan',
        'local-evidence',
        'local-gate',
        'commit',
        'pr',
        'checks',
        'remote-evidence',
        'final-gate',
        'merge',
        'cleanup',
      ]);
      if (!allowedStages.has(next as ExecuteStageName)) {
        throw new Error(`Unknown stage: ${next}\n${usage}`);
      }
      args.stage = next as ExecuteStageName;
      index += 1;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--until-complete') {
      args.untilComplete = true;
    } else if (arg === '--allow-agent-execution') {
      args.allowAgentExecution = true;
    } else if (arg === '--allow-pr') {
      args.allowPr = true;
    } else if (arg === '--allow-merge') {
      args.allowMerge = true;
    } else if (arg === '--continue-on-blocked') {
      args.continueOnBlocked = true;
    } else if (arg === '--plan-approval' && next) {
      if (next !== 'auto' && next !== 'manual' && next !== 'disabled') {
        throw new Error('--plan-approval must be auto, manual, or disabled');
      }
      args.planApproval = next;
      index += 1;
    } else if (arg === '--planner-agent' && next) {
      if (next !== 'shell' && next !== 'manual') {
        throw new Error('--planner-agent must be shell or manual');
      }
      args.plannerAgent = next;
      index += 1;
    } else if (arg === '--executor-agent' && next) {
      if (next !== 'shell' && next !== 'manual') {
        throw new Error('--executor-agent must be shell or manual');
      }
      args.executorAgent = next;
      index += 1;
    } else if (arg === '--rechecker-agent' && next) {
      if (next !== 'shell' && next !== 'manual') {
        throw new Error('--rechecker-agent must be shell or manual');
      }
      args.recheckerAgent = next;
      index += 1;
    } else if (arg === '--planner-command-template' && next) {
      args.plannerCommandTemplate = next;
      index += 1;
    } else if (arg === '--executor-command-template' && next) {
      args.executorCommandTemplate = next;
      index += 1;
    } else if (arg === '--rechecker-command-template' && next) {
      args.recheckerCommandTemplate = next;
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

const safetyFlagsFromArgs = (args: ParsedArgs) => ({
  allowAgentExecution: args.allowAgentExecution === true,
  allowPr: args.allowPr === true,
  allowMerge: args.allowMerge === true,
  dryRun: args.dryRun === true,
  continueOnBlocked: args.continueOnBlocked === true,
  parallel: args.parallel ?? 1,
  planApproval: args.planApproval ?? 'manual',
  plannerAgent: args.plannerAgent ?? 'manual',
  executorAgent: args.executorAgent ?? 'manual',
  recheckerAgent: args.recheckerAgent ?? 'manual',
});

const autopilotDepsFromArgs = async (args: ParsedArgs) => {
  if (!args.plannerCommandTemplate && !args.executorCommandTemplate && !args.recheckerCommandTemplate) {
    return undefined;
  }
  const autopilotConfig = await loadAutopilotConfig(args.repoRoot);
  return {
    autopilotConfig: {
      ...autopilotConfig,
      agents: {
        ...autopilotConfig.agents,
        planner: {
          ...autopilotConfig.agents.planner,
          ...(args.plannerCommandTemplate ? { commandTemplate: args.plannerCommandTemplate } : {}),
        },
        executor: {
          ...autopilotConfig.agents.executor,
          ...(args.executorCommandTemplate ? { commandTemplate: args.executorCommandTemplate } : {}),
        },
        rechecker: {
          ...autopilotConfig.agents.rechecker,
          ...(args.recheckerCommandTemplate ? { commandTemplate: args.recheckerCommandTemplate } : {}),
        },
      },
    },
  };
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
    return;
  }

  const safetyFlags = safetyFlagsFromArgs(args);

  if (args.command === 'execute') {
    const phaseId = requireArg(args.phase, 'phase');
    const stage = requireArg(args.stage, 'stage') as ExecuteStageName;
    writeJson(
      await executeStage(args.repoRoot, phaseId, stage, {
        runId: args.runId,
        safetyFlags,
        deps: await autopilotDepsFromArgs(args),
      }),
    );
    return;
  }

  if (args.command === 'autopilot') {
    if (args.untilComplete) {
      writeJson(
        await runAutopilotUntilComplete(args.repoRoot, {
          from: args.from,
          safetyFlags,
          deps: await autopilotDepsFromArgs(args),
        }),
      );
      return;
    }
    const phaseId = requireArg(args.phase ?? args.from, 'phase');
    writeJson(
      await runAutopilotForPhase(args.repoRoot, phaseId, {
        runId: args.runId,
        safetyFlags,
        deps: await autopilotDepsFromArgs(args),
      }),
    );
    return;
  }

  if (args.command === 'resume') {
    const phaseId = requireArg(args.phase, 'phase');
    const runId = requireArg(args.runId, 'run-id');
    writeJson(
      await resumeAutopilot(args.repoRoot, phaseId, runId, {
        safetyFlags,
        deps: await autopilotDepsFromArgs(args),
      }),
    );
    return;
  }

  if (args.command === 'inspect-run') {
    const phaseId = requireArg(args.phase, 'phase');
    const runId = requireArg(args.runId, 'run-id');
    writeJson(await inspectRun(args.repoRoot, phaseId, runId));
  }
};

runPhaseRunnerCli().catch(handleCliError);
