import path from 'node:path';

import { stringifyDeterministicJson } from '../harness/json.js';
import { buildStaticDemoBundle } from './build-bundle.js';
import { exportStaticDemoBundle } from './export-bundle.js';
import { renderStaticDemoHtml } from './render-html.js';
import { renderStaticDemoMarkdown } from './render-markdown.js';

export const STATIC_DEMO_EXPORT_CLI_USAGE = `Usage:
  pnpm run export-static-demo -- [options]

Options:
  --runs-root <path>   Repo or fixture root containing runs/ (default: current directory)
  --out <path>         Write static demo bundle (index.html, index.md, manifest.json)
  --json               Print bundle manifest JSON to stdout (no files written)
  --markdown           Print markdown bundle to stdout (no files written)
  --help, -h           Show this help text

Notes:
  The exporter reads local run artifacts as source data and does not edit them.
  Without --out, output goes to stdout unless --json or --markdown is set.
`;

interface ParsedStaticDemoExportArgs {
  runsRoot: string;
  outPath?: string;
  json: boolean;
  markdown: boolean;
  help: boolean;
}

export interface StaticDemoExportCliIo {
  stdout?: (value: string) => void;
}

export const parseStaticDemoExportCliArgs = (
  argv: string[],
  cwd = process.cwd(),
): ParsedStaticDemoExportArgs => {
  const args: ParsedStaticDemoExportArgs = {
    runsRoot: cwd,
    json: false,
    markdown: false,
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
    } else if (arg === '--markdown') {
      args.markdown = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.json && args.markdown) {
    throw new Error('--json cannot be combined with --markdown.');
  }
  if (args.outPath && args.json) {
    throw new Error('--json cannot be combined with --out.');
  }
  if (args.outPath && args.markdown) {
    throw new Error('--markdown cannot be combined with --out.');
  }

  return args;
};

export const runStaticDemoExportCli = async (
  argv: string[] = process.argv.slice(2),
  io: StaticDemoExportCliIo = {},
): Promise<void> => {
  const stdout = io.stdout ?? ((value: string) => process.stdout.write(value));
  const args = parseStaticDemoExportCliArgs(argv);

  if (args.help) {
    stdout(`${STATIC_DEMO_EXPORT_CLI_USAGE}\n`);
    return;
  }

  const runsRoot = path.resolve(args.runsRoot);

  if (args.outPath) {
    const result = await exportStaticDemoBundle(runsRoot, args.outPath);
    stdout(`Wrote static demo bundle to ${result.outputDir}\n`);
    for (const file of result.files) {
      stdout(`- ${file}\n`);
    }
    return;
  }

  const bundle = await buildStaticDemoBundle(runsRoot);
  if (args.json) {
    stdout(
      `${stringifyDeterministicJson({
        generatedAt: bundle.generatedAt,
        runsRoot: bundle.runsRoot,
        readOnly: bundle.readOnly,
        timeline: bundle.timeline,
        comparisons: bundle.comparisons,
        versions: bundle.index.versions.map((entry) => entry.version),
      })}\n`,
    );
    return;
  }

  if (args.markdown) {
    stdout(`${renderStaticDemoMarkdown(bundle)}\n`);
    return;
  }

  stdout(`${renderStaticDemoHtml(bundle)}\n`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runStaticDemoExportCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`export-static-demo failed: ${message}\n`);
    process.exitCode = 1;
  });
}
