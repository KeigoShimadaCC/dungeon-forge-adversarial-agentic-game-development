import path from 'node:path';

import { stringifyDeterministicJson } from './json.js';
import {
  DEFAULT_LONGITUDINAL_BENCHMARK_PATH,
  buildLongitudinalBenchmarkReport,
  writeLongitudinalBenchmarkReport,
} from './longitudinal-benchmark.js';

export const LONGITUDINAL_BENCHMARK_CLI_USAGE = `Usage:
  pnpm run longitudinal-benchmark -- [options]

Options:
  --runs-root <path>  Repo or fixture root containing runs/ (default: current directory)
  --versions <list>   Comma-separated versions, for example v001,v002,v003
  --out <path>        Write report JSON (default when supplied by phase gate: ${DEFAULT_LONGITUDINAL_BENCHMARK_PATH})
  --help, -h          Show this help text

Defaults:
  Without --out, the report is printed to stdout and no files are created.

Notes:
  This command reads local files only. It does not call LLM providers or auto-accept versions.
`;

interface ParsedLongitudinalBenchmarkArgs {
  runsRoot: string;
  versions?: string[];
  outPath?: string;
  help: boolean;
}

export interface LongitudinalBenchmarkCliIo {
  stdout?: (value: string) => void;
}

export const parseLongitudinalBenchmarkCliArgs = (
  argv: string[],
  cwd = process.cwd(),
): ParsedLongitudinalBenchmarkArgs => {
  const args: ParsedLongitudinalBenchmarkArgs = {
    runsRoot: cwd,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--') {
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--runs-root' && next) {
      args.runsRoot = next;
      index += 1;
    } else if (arg === '--versions' && next) {
      args.versions = next.split(',').map((version) => version.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--out' && next) {
      args.outPath = next;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
};

export const runLongitudinalBenchmarkCli = async (
  argv: string[] = process.argv.slice(2),
  io: LongitudinalBenchmarkCliIo = {},
): Promise<void> => {
  const stdout = io.stdout ?? ((value: string) => process.stdout.write(value));
  const args = parseLongitudinalBenchmarkCliArgs(argv);
  if (args.help) {
    stdout(`${LONGITUDINAL_BENCHMARK_CLI_USAGE}\n`);
    return;
  }

  const runsRoot = path.resolve(args.runsRoot);
  const report = await buildLongitudinalBenchmarkReport(runsRoot, {
    ...(args.versions ? { versions: args.versions } : {}),
  });

  if (!args.outPath) {
    stdout(`${stringifyDeterministicJson(report)}\n`);
    return;
  }

  const writtenPath = await writeLongitudinalBenchmarkReport(report, path.resolve(args.outPath));
  stdout(`Wrote longitudinal benchmark report: ${writtenPath}\n`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runLongitudinalBenchmarkCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`longitudinal-benchmark failed: ${message}\n`);
    process.exitCode = 1;
  });
}
