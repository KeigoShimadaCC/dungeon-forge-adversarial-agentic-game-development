import path from 'node:path';

import {
  DEFAULT_CONTENT_GOVERNANCE_REPORT_PATH,
  renderContentGovernanceMarkdown,
  runContentGovernance,
  writeContentGovernanceReport,
} from './content-governance.js';
import { stringifyDeterministicJson } from './json.js';

export const CONTENT_GOVERNANCE_CLI_USAGE = `Usage:
  pnpm run content-governance -- [options]

Options:
  --format <json|markdown> Output format when printing or writing (default: json)
  --out <path>             Write the report to a file
  --base-only              Check base content only, without scenario or extension packs
  --help, -h               Show this help text

Defaults:
  Without --out, the report is printed to stdout and no files are created.
  Suggested report path: ${DEFAULT_CONTENT_GOVERNANCE_REPORT_PATH}

Notes:
  This command is local and advisory. Blockers must be fixed before content is used by the engine or harness.
`;

interface ParsedContentGovernanceArgs {
  format: 'json' | 'markdown';
  outPath?: string;
  baseOnly: boolean;
  help: boolean;
}

export interface ContentGovernanceCliIo {
  stdout?: (value: string) => void;
  stderr?: (value: string) => void;
}

export const parseContentGovernanceCliArgs = (
  argv: string[],
): ParsedContentGovernanceArgs => {
  const args: ParsedContentGovernanceArgs = {
    format: 'json',
    baseOnly: false,
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
    if (arg === '--base-only') {
      args.baseOnly = true;
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
    throw new Error(`Unknown or incomplete argument: ${arg}\n${CONTENT_GOVERNANCE_CLI_USAGE}`);
  }

  return args;
};

export const runContentGovernanceCli = async (
  argv: string[] = process.argv.slice(2),
  io: ContentGovernanceCliIo = {},
): Promise<void> => {
  const stdout = io.stdout ?? ((value: string) => process.stdout.write(value));
  const args = parseContentGovernanceCliArgs(argv);
  if (args.help) {
    stdout(CONTENT_GOVERNANCE_CLI_USAGE);
    return;
  }

  const report = runContentGovernance({
    includeScenarioPacks: !args.baseOnly,
    includeExtensionPacks: !args.baseOnly,
  });

  if (args.outPath) {
    await writeContentGovernanceReport(report, path.resolve(args.outPath), args.format);
    stdout(`Wrote content governance report: ${path.resolve(args.outPath)}\n`);
  } else if (args.format === 'markdown') {
    stdout(renderContentGovernanceMarkdown(report));
  } else {
    stdout(stringifyDeterministicJson(report));
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runContentGovernanceCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`content-governance failed: ${message}\n`);
    process.exitCode = 1;
  });
}
