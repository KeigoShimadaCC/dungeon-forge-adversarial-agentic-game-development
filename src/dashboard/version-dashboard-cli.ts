import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from '../harness/json.js';
import { buildDashboardIndex } from './build-index.js';
import { loadArtifactPayload } from './load-artifacts.js';
import { renderDashboardHtml } from './render-html.js';

export const VERSION_DASHBOARD_CLI_USAGE = `Usage:
  pnpm run version-dashboard -- [options]

Options:
  --runs-root <path>       Repo or fixture root containing runs/ (default: current directory)
  --out <path>             Write static dashboard HTML to this path
  --json                   Print dashboard index JSON instead of HTML
  --artifact <runs/path>   Print one readable artifact payload without mutating it
  --help, -h               Show this help text

Notes:
  The dashboard reads local run artifacts as source data.
  Without --out, output is written to stdout and no files are created.
  With --out, only the derived HTML viewer is written; evidence files are not edited.
`;

interface ParsedVersionDashboardArgs {
  runsRoot: string;
  outPath?: string;
  json: boolean;
  artifactPath?: string;
  help: boolean;
}

export interface VersionDashboardCliIo {
  stdout?: (value: string) => void;
}

export const parseVersionDashboardCliArgs = (
  argv: string[],
  cwd = process.cwd(),
): ParsedVersionDashboardArgs => {
  const args: ParsedVersionDashboardArgs = {
    runsRoot: cwd,
    json: false,
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
    } else if (arg === '--out' && next) {
      args.outPath = next;
      index += 1;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--artifact' && next) {
      args.artifactPath = next;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.json && args.outPath) {
    throw new Error('--json cannot be combined with --out.');
  }
  if (args.artifactPath && args.outPath) {
    throw new Error('--artifact cannot be combined with --out.');
  }
  if (args.artifactPath && args.json) {
    throw new Error('--artifact cannot be combined with --json.');
  }

  return args;
};

const normalizePathForHref = (value: string): string => value.replace(/\\/g, '/');

export const dashboardLinkBaseForOutput = (runsRoot: string, outPath: string): string => {
  const relative = normalizePathForHref(path.relative(path.dirname(outPath), runsRoot));
  return relative.length === 0 ? '.' : relative;
};

export const runVersionDashboardCli = async (
  argv: string[] = process.argv.slice(2),
  io: VersionDashboardCliIo = {},
): Promise<void> => {
  const stdout = io.stdout ?? ((value: string) => process.stdout.write(value));
  const args = parseVersionDashboardCliArgs(argv);

  if (args.help) {
    stdout(`${VERSION_DASHBOARD_CLI_USAGE}\n`);
    return;
  }

  const runsRoot = path.resolve(args.runsRoot);

  if (args.artifactPath) {
    const payload = await loadArtifactPayload(runsRoot, args.artifactPath);
    stdout(`# ${payload.relativePath}\n\n${payload.content}\n`);
    return;
  }

  const index = await buildDashboardIndex(runsRoot);
  if (args.json) {
    stdout(`${stringifyDeterministicJson(index)}\n`);
    return;
  }

  const outPath = args.outPath ? path.resolve(args.outPath) : undefined;
  const html = renderDashboardHtml(index, {
    linkBase: outPath ? dashboardLinkBaseForOutput(runsRoot, outPath) : '',
  });

  if (!outPath) {
    stdout(html);
    return;
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, html, 'utf8');
  stdout(`Wrote version dashboard: ${outPath}\n`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runVersionDashboardCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`version-dashboard failed: ${message}\n`);
    process.exitCode = 1;
  });
}
