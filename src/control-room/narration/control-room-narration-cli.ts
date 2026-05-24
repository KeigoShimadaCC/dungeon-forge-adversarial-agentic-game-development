import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  buildControlRoomNarration,
  buildControlRoomNarrationRenderModel,
  renderControlRoomNarrationHtml,
  saveControlRoomNarration,
  stringifyControlRoomNarration,
} from './index.js';
import { loadControlRoomTimeline } from '../timeline/index.js';

export const CONTROL_ROOM_NARRATION_CLI_USAGE = `Usage:
  node dist/src/control-room/narration/control-room-narration-cli.js --timeline <runs/control-room/timeline/file.json> [options]

Options:
  --timeline <path>       Timeline artifact under runs/control-room/timeline/
  --out <path>            Write narration JSON under runs/control-room/narration/
  --html <path>           Write inert narration HTML under runs/control-room/narration/
  --generated-at <iso>    Stable generated timestamp
  --json                  Print narration JSON to stdout
  --help, -h              Show this help text

Notes:
  This command uses deterministic local artifact parsing by default.
  It does not require LLM credentials, call providers, run agents, make acceptance decisions, or execute commands from the browser.
`;

interface ParsedControlRoomNarrationArgs {
  timelinePath?: string;
  outPath?: string;
  htmlPath?: string;
  generatedAt?: string;
  json: boolean;
  help: boolean;
}

export interface ControlRoomNarrationCliIo {
  stdout?: (value: string) => void;
}

export const parseControlRoomNarrationCliArgs = (
  argv: string[],
): ParsedControlRoomNarrationArgs => {
  const args: ParsedControlRoomNarrationArgs = {
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
    } else if (arg === '--generated-at' && hasNext) {
      args.generatedAt = next;
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

export const runControlRoomNarrationCli = async (
  argv: string[] = process.argv.slice(2),
  io: ControlRoomNarrationCliIo = {},
): Promise<void> => {
  const stdout = io.stdout ?? ((value: string) => process.stdout.write(value));
  const args = parseControlRoomNarrationCliArgs(argv);
  if (args.help) {
    stdout(`${CONTROL_ROOM_NARRATION_CLI_USAGE}\n`);
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

  const narration = await buildControlRoomNarration(loaded.timeline, {
    repoRoot,
    generatedAt: args.generatedAt,
    timelinePath: args.timelinePath,
  });
  if (args.outPath) {
    await saveControlRoomNarration(repoRoot, args.outPath, narration);
  }
  if (args.htmlPath) {
    const absoluteHtmlPath = path.resolve(repoRoot, args.htmlPath);
    const model = buildControlRoomNarrationRenderModel(narration, {
      linkBase: linkBaseForOutput(repoRoot, absoluteHtmlPath),
    });
    await mkdir(path.dirname(absoluteHtmlPath), { recursive: true });
    await writeFile(absoluteHtmlPath, renderControlRoomNarrationHtml(model), 'utf8');
  }
  if (args.json || (!args.outPath && !args.htmlPath)) {
    stdout(`${stringifyControlRoomNarration(narration)}\n`);
    return;
  }
  stdout(`Control-room narration generated for ${narration.versions.length} version(s).\n`);
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runControlRoomNarrationCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`control-room-narration failed: ${message}\n`);
    process.exitCode = 1;
  });
}
