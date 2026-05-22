import { handleCliError, writeJson } from './balance-cli-shared.js';
import {
  parseCommandStatusArg,
  writeAcceptanceReport,
  type CommandCheckId,
  type CommandCheckStatus,
} from './acceptance-gate.js';

const parseArgs = (
  argv: string[],
): {
  version?: string;
  runsRoot: string;
  commandStatuses: Partial<Record<CommandCheckId, CommandCheckStatus>>;
  reviewerDriven?: boolean;
} => {
  const args: {
    version?: string;
    runsRoot: string;
    commandStatuses: Partial<Record<CommandCheckId, CommandCheckStatus>>;
    reviewerDriven?: boolean;
  } = {
    runsRoot: process.cwd(),
    commandStatuses: {},
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--') {
      continue;
    } else if (arg === '--version' && next) {
      args.version = next;
      index += 1;
    } else if (arg === '--runs-root' && next) {
      args.runsRoot = next;
      index += 1;
    } else if (arg === '--command-status' && next) {
      const parsed = parseCommandStatusArg(next);
      args.commandStatuses[parsed.id] = parsed.status;
      index += 1;
    } else if (arg === '--reviewer-driven') {
      args.reviewerDriven = true;
    } else if (arg === '--not-reviewer-driven') {
      args.reviewerDriven = false;
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

export const runAcceptVersionCli = async (argv: string[] = process.argv.slice(2)): Promise<void> => {
  const args = parseArgs(argv);
  const result = await writeAcceptanceReport({
    runsRoot: args.runsRoot,
    version: requireArg(args.version, 'version'),
    commandStatuses: args.commandStatuses,
    ...(args.reviewerDriven !== undefined ? { reviewerDriven: args.reviewerDriven } : {}),
  });
  writeJson({
    version: result.version,
    acceptancePath: result.acceptancePath,
    machine_recommendation: result.machine_recommendation,
    human_decision: result.human_decision,
    blockers: result.blockers,
    risks: result.risks,
    counts: result.counts,
  });
};

runAcceptVersionCli().catch(handleCliError);
