import path from 'node:path';

import {
  DEFAULT_OPTIONAL_MEDIA_REPORT_PATH,
  buildOptionalMediaReport,
  renderOptionalMediaMarkdown,
  writeOptionalMediaReport,
} from './optional-media.js';
import { stringifyDeterministicJson } from './json.js';

export const OPTIONAL_MEDIA_CLI_USAGE = `Usage:
  pnpm run optional-media -- [options]

Options:
  --format <json|markdown> Output format when printing or writing (default: json)
  --out <path>             Write the report to a file
  --check-files            Check whether local media asset files exist
  --media-root <path>      Repository root used when checking media/ asset paths
  --repo-root <path>       Alias for --media-root
  --help, -h               Show this help text

Defaults:
  Without --out, the report is printed to stdout and no files are created.
  Missing media files are reported as optional metadata, not blockers.
  Suggested report path: ${DEFAULT_OPTIONAL_MEDIA_REPORT_PATH}

Notes:
  This command proves presentation media stays additive. Gameplay, traces, scorecards,
  and reviewer evaluation must remain usable without loading image, audio, or video files.
`;

interface ParsedOptionalMediaArgs {
  format: 'json' | 'markdown';
  outPath?: string;
  checkFiles: boolean;
  mediaRoot: string;
  help: boolean;
}

export interface OptionalMediaCliIo {
  stdout?: (value: string) => void;
}

export const parseOptionalMediaCliArgs = (
  argv: string[],
): ParsedOptionalMediaArgs => {
  const args: ParsedOptionalMediaArgs = {
    format: 'json',
    checkFiles: false,
    mediaRoot: process.cwd(),
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
      continue;
    }
    if (arg === '--check-files') {
      args.checkFiles = true;
      continue;
    }
    if (arg === '--format' && next) {
      if (next !== 'json' && next !== 'markdown') {
        throw new Error(`--format must be json or markdown, received "${next}"`);
      }
      args.format = next;
      index += 1;
      continue;
    }
    if (arg === '--out' && next) {
      args.outPath = next;
      index += 1;
      continue;
    }
    if ((arg === '--media-root' || arg === '--repo-root') && next) {
      args.mediaRoot = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete argument: ${arg}\n${OPTIONAL_MEDIA_CLI_USAGE}`);
  }

  return args;
};

export const runOptionalMediaCli = async (
  argv: string[] = process.argv.slice(2),
  io: OptionalMediaCliIo = {},
): Promise<void> => {
  const stdout = io.stdout ?? ((value: string) => process.stdout.write(value));
  const args = parseOptionalMediaCliArgs(argv);
  if (args.help) {
    stdout(OPTIONAL_MEDIA_CLI_USAGE);
    return;
  }

  const report = await buildOptionalMediaReport({
    repoRoot: path.resolve(args.mediaRoot),
    checkFiles: args.checkFiles,
  });

  if (args.outPath) {
    await writeOptionalMediaReport(report, path.resolve(args.outPath), args.format);
    stdout(`Wrote optional media report: ${path.resolve(args.outPath)}\n`);
  } else if (args.format === 'markdown') {
    stdout(renderOptionalMediaMarkdown(report));
  } else {
    stdout(stringifyDeterministicJson(report));
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runOptionalMediaCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`optional-media failed: ${message}\n`);
    process.exitCode = 1;
  });
}
