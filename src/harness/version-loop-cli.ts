import { parseHarnessCliCommonArgs } from './cli-args.js';
import { stringifyDeterministicJson } from './json.js';
import {
  ensureVersionFolder,
  persistVersionComparison,
  persistVersionSummary,
  runVersion,
} from './version-loop.js';

interface ParsedArgs {
  version?: string;
  base?: string;
  target?: string;
  runsRoot: string;
  onExisting: import('./artifact-write-policy.js').ArtifactWriteMode;
  stdoutOnly: boolean;
}

const parseArgs = (argv: string[]): ParsedArgs => {
  const common = parseHarnessCliCommonArgs(argv);
  const args: ParsedArgs = {
    runsRoot: common.runsRoot,
    onExisting: common.onExisting,
    stdoutOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--') {
      continue;
    } else if (arg === '--version' && next) {
      args.version = next;
      index += 1;
    } else if (arg === '--base' && next) {
      args.base = next;
      index += 1;
    } else if (arg === '--target' && next) {
      args.target = next;
      index += 1;
    } else if (arg === '--stdout-only') {
      args.stdoutOnly = true;
    } else if (arg === '--runs-root' || arg === '--on-existing') {
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

const writeJson = (value: unknown): void => {
  process.stdout.write(`${stringifyDeterministicJson(value)}\n`);
};

export const runNewVersionCli = async (argv: string[] = process.argv.slice(2)): Promise<void> => {
  const args = parseArgs(argv);
  writeJson(await ensureVersionFolder(args.runsRoot, requireArg(args.version, 'version')));
};

export const runRunVersionCli = async (argv: string[] = process.argv.slice(2)): Promise<void> => {
  const args = parseArgs(argv);
  writeJson(
    await runVersion(args.runsRoot, requireArg(args.version, 'version'), undefined, {
      onExisting: args.onExisting,
    }),
  );
};

export const runSummarizeVersionCli = async (
  argv: string[] = process.argv.slice(2),
): Promise<void> => {
  const args = parseArgs(argv);
  const version = requireArg(args.version, 'version');
  if (args.stdoutOnly) {
    const { summarizeVersion } = await import('./version-loop.js');
    writeJson(await summarizeVersion(args.runsRoot, version));
    return;
  }
  const { summary, summaryPath } = await persistVersionSummary(args.runsRoot, version, undefined, {
    onExisting: args.onExisting,
  });
  writeJson({ summary, summaryPath, persisted: true });
};

export const runCompareVersionsCli = async (
  argv: string[] = process.argv.slice(2),
): Promise<void> => {
  const args = parseArgs(argv);
  const base = requireArg(args.base, 'base');
  const target = requireArg(args.target, 'target');
  if (args.stdoutOnly) {
    const { compareVersions } = await import('./version-loop.js');
    writeJson(await compareVersions(args.runsRoot, base, target));
    return;
  }
  const result = await persistVersionComparison(args.runsRoot, base, target, {
    onExisting: args.onExisting,
  });
  writeJson({ ...result, persisted: true });
};

export const runCli = async (
  command: 'new-version' | 'run-version' | 'summarize-version' | 'compare-versions',
  argv: string[] = process.argv.slice(2),
): Promise<void> => {
  switch (command) {
    case 'new-version':
      await runNewVersionCli(argv);
      break;
    case 'run-version':
      await runRunVersionCli(argv);
      break;
    case 'summarize-version':
      await runSummarizeVersionCli(argv);
      break;
    case 'compare-versions':
      await runCompareVersionsCli(argv);
      break;
  }
};

export const handleCliError = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
};
