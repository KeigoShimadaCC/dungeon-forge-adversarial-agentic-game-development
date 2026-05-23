import { parseHarnessCliCommonArgs } from './cli-args.js';
import { handleCliError, writeJson } from './balance-cli-shared.js';
import { verifyAcceptanceEvidence } from './acceptance-evidence-check.js';

const parseArgs = (
  argv: string[],
): {
  runsRoot: string;
  versions?: string[];
} => {
  const common = parseHarnessCliCommonArgs(argv);
  const args: { runsRoot: string; versions?: string[] } = { runsRoot: common.runsRoot };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--') {
      continue;
    } else if (arg === '--version' && next) {
      args.versions = args.versions ?? [];
      args.versions.push(next);
      index += 1;
    } else if (arg === '--runs-root' || arg === '--on-existing') {
      index += 1;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
};

export const runVerifyAcceptanceEvidenceCli = async (
  argv: string[] = process.argv.slice(2),
): Promise<void> => {
  const args = parseArgs(argv);
  const result = await verifyAcceptanceEvidence({
    runsRoot: args.runsRoot,
    ...(args.versions ? { versions: args.versions } : {}),
  });
  writeJson(result);
  if (!result.ok) {
    process.exitCode = 1;
    const failed = result.versions.filter((entry) => entry.status === 'fail');
    const lines = failed.map(
      (entry) =>
        `${entry.version}: ${entry.machine_recommendation ?? 'unknown'} (${entry.blockers?.join('; ') ?? entry.summary ?? 'no details'})`,
    );
    process.stderr.write(`Acceptance evidence verification failed:\n${lines.join('\n')}\n`);
  }
};

const isMainModule = (): boolean => {
  const entry = process.argv[1];
  return entry !== undefined && entry.endsWith('verify-acceptance-evidence-cli.js');
};

if (isMainModule()) {
  runVerifyAcceptanceEvidenceCli().catch(handleCliError);
}
