import path from 'node:path';

import { stringifyDeterministicJson } from './json.js';
import {
  BALANCE_ANALYTICS_REPORT_PATH,
  BALANCE_LEADERBOARD_PATH,
  buildBalanceAnalyticsReport,
  writeBalanceAnalyticsArtifacts,
} from './balance-analytics.js';

export const BALANCE_ANALYTICS_CLI_USAGE = `Usage:
  pnpm run balance-analytics -- [options]

Options:
  --runs-root <path>       Repo or fixture root containing runs/ (default: current directory)
  --versions <list>        Comma-separated versions, for example v001,v002,v003
  --out <path>             Write balance analytics report JSON
  --leaderboard-out <path> Write standalone leaderboard JSON
  --help, -h               Show this help text

Defaults:
  Without --out, the report is printed to stdout and no files are created.
  Suggested report path: ${BALANCE_ANALYTICS_REPORT_PATH}
  Suggested leaderboard path: ${BALANCE_LEADERBOARD_PATH}

Notes:
  Analytics are advisory. Reviewer critique and trace evidence remain authoritative.
`;

interface ParsedBalanceAnalyticsArgs {
  runsRoot: string;
  versions?: string[];
  outPath?: string;
  leaderboardOutPath?: string;
  help: boolean;
}

export interface BalanceAnalyticsCliIo {
  stdout?: (value: string) => void;
}

export const parseBalanceAnalyticsCliArgs = (
  argv: string[],
  cwd = process.cwd(),
): ParsedBalanceAnalyticsArgs => {
  const args: ParsedBalanceAnalyticsArgs = {
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
    } else if (arg === '--leaderboard-out' && next) {
      args.leaderboardOutPath = next;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
};

export const runBalanceAnalyticsCli = async (
  argv: string[] = process.argv.slice(2),
  io: BalanceAnalyticsCliIo = {},
): Promise<void> => {
  const stdout = io.stdout ?? ((value: string) => process.stdout.write(value));
  const args = parseBalanceAnalyticsCliArgs(argv);
  if (args.help) {
    stdout(`${BALANCE_ANALYTICS_CLI_USAGE}\n`);
    return;
  }

  const runsRoot = path.resolve(args.runsRoot);
  const report = await buildBalanceAnalyticsReport(runsRoot, {
    ...(args.versions ? { versions: args.versions } : {}),
  });

  if (!args.outPath && !args.leaderboardOutPath) {
    stdout(`${stringifyDeterministicJson(report)}\n`);
    return;
  }

  const written = await writeBalanceAnalyticsArtifacts(report, {
    ...(args.outPath ? { reportPath: path.resolve(args.outPath) } : {}),
    ...(args.leaderboardOutPath
      ? { leaderboardPath: path.resolve(args.leaderboardOutPath) }
      : {}),
  });

  if (written.reportPath) {
    stdout(`Wrote balance analytics report: ${written.reportPath}\n`);
  }
  if (written.leaderboardPath) {
    stdout(`Wrote balance leaderboard: ${written.leaderboardPath}\n`);
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runBalanceAnalyticsCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`balance-analytics failed: ${message}\n`);
    process.exitCode = 1;
  });
}
