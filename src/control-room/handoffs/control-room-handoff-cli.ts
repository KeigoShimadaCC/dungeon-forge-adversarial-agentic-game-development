import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildControlRoomHandoffPanelModel,
  buildControlRoomPreparedHandoff,
  renderControlRoomHandoffPanelHtml,
  saveControlRoomPreparedHandoff,
  stringifyControlRoomPreparedHandoff,
} from './index.js';
import { loadControlRoomTimeline } from '../timeline/index.js';

export const CONTROL_ROOM_HANDOFF_CLI_USAGE = `Usage:
  node dist/src/control-room/handoffs/control-room-handoff-cli.js --timeline <runs/control-room/timeline/file.json> [options]

Options:
  --timeline <path>       Timeline artifact under runs/control-room/timeline/
  --out <path>            Write prepared handoff JSON under runs/control-room/handoffs/
  --html <path>           Write inert handoff panel HTML under runs/control-room/handoffs/
  --prepared-at <iso>     Stable prepared timestamp
  --json                  Print handoff JSON to stdout
  --help, -h              Show this help text

Notes:
  This command only prepares local handoff artifacts.
  It does not run suggested commands, launch agents, call providers, commit, open PRs, merge, or update phase state.
`;

interface ParsedControlRoomHandoffArgs {
  timelinePath?: string;
  outPath?: string;
  htmlPath?: string;
  preparedAt?: string;
  json: boolean;
  help: boolean;
}

export interface ControlRoomHandoffCliIo {
  stdout?: (value: string) => void;
}

export const parseControlRoomHandoffCliArgs = (
  argv: string[],
): ParsedControlRoomHandoffArgs => {
  const args: ParsedControlRoomHandoffArgs = {
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    const hasNext = index + 1 < argv.length;
    if (arg === '--') {
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--timeline' && hasNext) {
      args.timelinePath = next;
      index += 1;
    } else if (arg === '--out' && hasNext) {
      args.outPath = next;
      index += 1;
    } else if (arg === '--html' && hasNext) {
      args.htmlPath = next;
      index += 1;
    } else if (arg === '--prepared-at' && hasNext) {
      args.preparedAt = next;
      index += 1;
    } else if (arg === '--json') {
      args.json = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.help && !args.timelinePath) {
    throw new Error('--timeline is required.');
  }
  return args;
};

const linkBaseForOutput = (repoRoot: string, outPath: string): string => {
  const relative = path.relative(path.dirname(outPath), repoRoot).replace(/\\/g, '/');
  return relative.length === 0 ? '.' : relative;
};

export const runControlRoomHandoffCli = async (
  argv: string[] = process.argv.slice(2),
  io: ControlRoomHandoffCliIo = {},
): Promise<void> => {
  const stdout = io.stdout ?? ((value: string) => process.stdout.write(value));
  const args = parseControlRoomHandoffCliArgs(argv);
  if (args.help) {
    stdout(`${CONTROL_ROOM_HANDOFF_CLI_USAGE}\n`);
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

  const handoff = buildControlRoomPreparedHandoff(loaded.timeline, {
    preparedAt: args.preparedAt,
    handoffArtifactPath: args.outPath,
    panelArtifactPath: args.htmlPath,
  });

  if (args.outPath) {
    await saveControlRoomPreparedHandoff(repoRoot, args.outPath, handoff);
  }
  if (args.htmlPath) {
    const absoluteHtmlPath = path.resolve(repoRoot, args.htmlPath);
    const panelModel = buildControlRoomHandoffPanelModel(handoff, {
      linkBase: linkBaseForOutput(repoRoot, absoluteHtmlPath),
    });
    await mkdir(path.dirname(absoluteHtmlPath), { recursive: true });
    await writeFile(absoluteHtmlPath, renderControlRoomHandoffPanelHtml(panelModel), 'utf8');
  }
  if (args.json || (!args.outPath && !args.htmlPath)) {
    stdout(`${stringifyControlRoomPreparedHandoff(handoff)}\n`);
    return;
  }
  stdout(`Prepared control-room handoff: ${handoff.status}\n`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runControlRoomHandoffCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`control-room-handoff failed: ${message}\n`);
    process.exitCode = 1;
  });
}
