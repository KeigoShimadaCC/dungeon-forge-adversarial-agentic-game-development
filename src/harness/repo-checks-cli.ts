import { parseHarnessCliCommonArgs } from './cli-args.js';
import { handleCliError, writeJson } from './balance-cli-shared.js';
import { runRepoChecks } from './repo-checks.js';

const parseArgs = (
  argv: string[],
): {
  runsRoot: string;
  smokeVersion?: string;
  skipAcceptanceEvidence: boolean;
  acceptanceVersions?: string[];
} => {
  const common = parseHarnessCliCommonArgs(argv);
  const args: {
    runsRoot: string;
    smokeVersion?: string;
    skipAcceptanceEvidence: boolean;
    acceptanceVersions?: string[];
  } = {
    runsRoot: common.runsRoot,
    skipAcceptanceEvidence: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--') {
      continue;
    } else if (arg === '--smoke-version' && next) {
      args.smokeVersion = next;
      index += 1;
    } else if (arg === '--version' && next) {
      args.acceptanceVersions = args.acceptanceVersions ?? [];
      args.acceptanceVersions.push(next);
      index += 1;
    } else if (arg === '--skip-acceptance-evidence') {
      args.skipAcceptanceEvidence = true;
    } else if (arg === '--runs-root' || arg === '--on-existing') {
      index += 1;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
};

export const runRepoChecksCli = async (argv: string[] = process.argv.slice(2)): Promise<void> => {
  const args = parseArgs(argv);
  const result = await runRepoChecks({
    runsRoot: args.runsRoot,
    smokeVersion: args.smokeVersion,
    skipAcceptanceEvidence: args.skipAcceptanceEvidence,
    acceptanceVersions: args.acceptanceVersions,
  });
  writeJson(result);
  if (!result.ok) {
    process.exitCode = 1;
    if (!result.smoke.ok) {
      process.stderr.write(
        `Repo checks: CI smoke failed (${result.smoke.failed_runs.length} problem runs).\n`,
      );
    }
    if (!result.acceptance.ok) {
      process.stderr.write('Repo checks: acceptance evidence verification failed.\n');
    }
  }
};

const isMainModule = (): boolean => {
  const entry = process.argv[1];
  return entry !== undefined && entry.endsWith('repo-checks-cli.js');
};

if (isMainModule()) {
  runRepoChecksCli().catch(handleCliError);
}
