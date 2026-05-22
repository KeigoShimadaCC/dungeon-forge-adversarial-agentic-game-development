import { handleCliError, writeJson } from './balance-cli-shared.js';
import { runBalanceBatch } from './balance-tuning.js';
import {
  isBaselinePolicyId,
  type BaselinePolicyId,
} from './policy-registry.js';

const parseArgs = (
  argv: string[],
): {
  version?: string;
  runsRoot: string;
  seeds?: string[];
  policies?: string[];
} => {
  const args: {
    version?: string;
    runsRoot: string;
    seeds?: string[];
    policies?: string[];
  } = { runsRoot: process.cwd() };

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
    } else if (arg === '--seeds' && next) {
      args.seeds = next.split(',').map((seed) => seed.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--policies' && next) {
      args.policies = next.split(',').map((policy) => policy.trim()).filter(Boolean);
      index += 1;
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

const parsePolicies = (policies: string[] | undefined): BaselinePolicyId[] | undefined => {
  if (!policies) {
    return undefined;
  }

  return policies.map((policy) => {
    if (!isBaselinePolicyId(policy)) {
      throw new Error(
        `Unknown policy "${policy}". Expected one of: random, stairs-seeking, cautious-low-hp, greedy-item-picker.`,
      );
    }
    return policy;
  });
};

export const runBalanceCli = async (argv: string[] = process.argv.slice(2)): Promise<void> => {
  const args = parseArgs(argv);
  const summary = await runBalanceBatch({
    runsRoot: args.runsRoot,
    version: requireArg(args.version, 'version'),
    ...(args.seeds ? { seeds: args.seeds } : {}),
    ...(args.policies ? { policies: parsePolicies(args.policies) } : {}),
  });
  writeJson(summary);
};

runBalanceCli().catch(handleCliError);
