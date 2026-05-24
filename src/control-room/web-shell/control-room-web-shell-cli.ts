import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from '../../harness/json.js';
import { buildControlRoomRoleCatalog } from '../roles/index.js';
import { loadControlRoomTimeline } from '../timeline/index.js';
import {
  buildControlRoomWebShellViewModel,
  renderControlRoomWebShellHtml,
} from './index.js';

export const CONTROL_ROOM_WEB_SHELL_CLI_USAGE = `Usage:
  pnpm run control-room-web-shell -- --timeline <runs/control-room/timeline/file.json> [options]

Options:
  --timeline <path>    Timeline artifact under runs/control-room/timeline/
  --out <path>         Write static HTML to this path
  --json               Print view-model JSON instead of HTML
  --help, -h           Show this help text

Notes:
  The shell reads local timeline and role metadata only.
  Without --out, output is written to stdout and no files are created.
  With --out, only the derived HTML viewer is written; source evidence is not edited.
`;

interface ParsedControlRoomWebShellArgs {
  timelinePath?: string;
  outPath?: string;
  json: boolean;
  help: boolean;
}

export interface ControlRoomWebShellCliIo {
  stdout?: (value: string) => void;
}

export const parseControlRoomWebShellCliArgs = (
  argv: string[],
): ParsedControlRoomWebShellArgs => {
  const args: ParsedControlRoomWebShellArgs = {
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
    } else if (arg === '--timeline' && next) {
      args.timelinePath = next;
      index += 1;
    } else if (arg === '--out' && next) {
      args.outPath = next;
      index += 1;
    } else if (arg === '--json') {
      args.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.json && args.outPath) {
    throw new Error('--json cannot be combined with --out.');
  }
  if (!args.help && !args.timelinePath) {
    throw new Error('--timeline is required.');
  }

  return args;
};

const normalizePathForHref = (value: string): string => value.replace(/\\/g, '/');

export const controlRoomWebShellLinkBaseForOutput = (
  repoRoot: string,
  outPath: string,
): string => {
  const relative = normalizePathForHref(path.relative(path.dirname(outPath), repoRoot));
  return relative.length === 0 ? '.' : relative;
};

export const runControlRoomWebShellCli = async (
  argv: string[] = process.argv.slice(2),
  io: ControlRoomWebShellCliIo = {},
): Promise<void> => {
  const stdout = io.stdout ?? ((value: string) => process.stdout.write(value));
  const args = parseControlRoomWebShellCliArgs(argv);

  if (args.help) {
    stdout(`${CONTROL_ROOM_WEB_SHELL_CLI_USAGE}\n`);
    return;
  }

  const repoRoot = process.cwd();
  const loaded = await loadControlRoomTimeline(repoRoot, args.timelinePath!);
  if (!loaded.ok || !loaded.timeline) {
    const diagnostics = loaded.diagnostics
      .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
      .join('\n');
    throw new Error(`Control-room timeline load failed:\n${diagnostics}`);
  }

  const outPath = args.outPath ? path.resolve(args.outPath) : undefined;
  const viewModel = buildControlRoomWebShellViewModel(loaded.timeline, {
    roleCatalog: buildControlRoomRoleCatalog(),
    linkBase: outPath ? controlRoomWebShellLinkBaseForOutput(repoRoot, outPath) : '',
  });

  if (args.json) {
    stdout(`${stringifyDeterministicJson(viewModel)}\n`);
    return;
  }

  const html = renderControlRoomWebShellHtml(viewModel);
  if (!outPath) {
    stdout(html);
    return;
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, html, 'utf8');
  stdout(`Wrote control-room web shell: ${outPath}\n`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runControlRoomWebShellCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`control-room-web-shell failed: ${message}\n`);
    process.exitCode = 1;
  });
}
