import { parseCommandStatusArg, type CommandCheckId, type CommandCheckStatus } from './acceptance-gate.js';
import { stringifyDeterministicJson } from './json.js';
import {
  assessLoopIteration,
  renderLoopCoordinatorRunbook,
  writeLoopCoordinatorArtifacts,
  type LoopCoordinatorAssessment,
} from './loop-coordinator.js';
import { handleCliError } from './version-loop-cli.js';

export const LOOP_COORDINATOR_CLI_USAGE = `Usage:
  pnpm run loop-coordinator -- --base-version <v00X> --target-version <v00Y> [options]

Required:
  --base-version <id>        Source evidence version (v001-style)
  --target-version <id>      Target implementation / acceptance version

Optional:
  --runs-root <path>         Runs root directory (default: current working directory)
  --reviewer-driven          Treat target as reviewer-driven handoff (proposal optional)
  --no-require-proposal      Do not require patch_proposal.json / patch_plan.md
  --no-require-developer-task  Skip developer_task.md requirement
  --command-status <id:status>  Repeatable validation preview (typecheck|test|lint|build : pass|fail|warning|skipped|blocked)
  --write                    Write runs/loop-coordinator/<loop_id>.{json,md}
  --stdout-only              Print JSON assessment to stdout (default when not --write)
  --help, -h                 Show this help text

Notes:
  The coordinator assesses loop state and suggests commands; it does not run gates, edit code, or merge.
  Supply --command-status only after the orchestrator runs local validation; statuses are never invented.
`;

interface ParsedArgs {
  baseVersion?: string;
  targetVersion?: string;
  runsRoot: string;
  reviewerDriven: boolean;
  requireProposal?: boolean;
  requireDeveloperTask?: boolean;
  commandStatuses: Partial<Record<CommandCheckId, CommandCheckStatus>>;
  write: boolean;
  stdoutOnly: boolean;
  help: boolean;
}

const parseArgs = (argv: string[]): ParsedArgs => {
  const args: ParsedArgs = {
    runsRoot: process.cwd(),
    reviewerDriven: false,
    commandStatuses: {},
    write: false,
    stdoutOnly: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--') {
      continue;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--base-version' && next) {
      args.baseVersion = next;
      index += 1;
    } else if (arg === '--target-version' && next) {
      args.targetVersion = next;
      index += 1;
    } else if (arg === '--runs-root' && next) {
      args.runsRoot = next;
      index += 1;
    } else if (arg === '--reviewer-driven') {
      args.reviewerDriven = true;
    } else if (arg === '--no-require-proposal') {
      args.requireProposal = false;
    } else if (arg === '--no-require-developer-task') {
      args.requireDeveloperTask = false;
    } else if (arg === '--command-status' && next) {
      const parsed = parseCommandStatusArg(next);
      args.commandStatuses[parsed.id] = parsed.status;
      index += 1;
    } else if (arg === '--write') {
      args.write = true;
    } else if (arg === '--stdout-only') {
      args.stdoutOnly = true;
    } else {
      throw new Error(`Unknown or incomplete argument: ${arg}`);
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

const printAssessment = (assessment: LoopCoordinatorAssessment): void => {
  process.stdout.write(`${stringifyDeterministicJson({
    loop_id: assessment.loop_id,
    outcome: assessment.outcome,
    blockers: assessment.blockers,
    required_human_decisions: assessment.required_human_decisions,
    next_commands: assessment.next_commands,
    steps: assessment.steps.map((step) => ({
      id: step.id,
      status: step.status,
      summary: step.summary,
      blockers: step.blockers,
    })),
    ...(assessment.validation_preview
      ? { validation_preview: assessment.validation_preview }
      : {}),
  })}\n`);
};

export const runLoopCoordinatorCli = async (
  argv: string[] = process.argv.slice(2),
): Promise<void> => {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${LOOP_COORDINATOR_CLI_USAGE}\n`);
    return;
  }

  const assessment = await assessLoopIteration({
    runsRoot: args.runsRoot,
    baseVersion: requireArg(args.baseVersion, 'base-version'),
    targetVersion: requireArg(args.targetVersion, 'target-version'),
    reviewerDriven: args.reviewerDriven,
    ...(args.requireProposal !== undefined ? { requireProposal: args.requireProposal } : {}),
    ...(args.requireDeveloperTask !== undefined
      ? { requireDeveloperTask: args.requireDeveloperTask }
      : {}),
    ...(Object.keys(args.commandStatuses).length > 0
      ? { commandStatuses: args.commandStatuses }
      : {}),
  });

  if (args.write) {
    const paths = await writeLoopCoordinatorArtifacts(assessment);
    process.stdout.write(
      `${stringifyDeterministicJson({
        loop_id: assessment.loop_id,
        outcome: assessment.outcome,
        checkpointPath: paths.checkpointPath,
        runbookPath: paths.runbookPath,
        blockers: assessment.blockers,
        next_commands: assessment.next_commands,
      })}\n`,
    );
    return;
  }

  if (args.stdoutOnly) {
    printAssessment(assessment);
    return;
  }

  printAssessment(assessment);
  process.stdout.write(`\n${renderLoopCoordinatorRunbook(assessment)}\n`);
};

export const handleLoopCoordinatorCliError = handleCliError;
