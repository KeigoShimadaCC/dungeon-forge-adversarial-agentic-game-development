import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from '../../harness/json.js';
import { buildControlRoomRoleCatalog } from '../roles/index.js';
import {
  loadAndApplyHumanFeedbackToTimeline,
  loadAndSelectControlRoomBaseVersion,
  loadControlRoomTimeline,
} from '../timeline/index.js';
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
  --capture-idea <text>
                       Add or replace the initial human game idea in the timeline
  --capture-comment <text>
                       Add a human comment event to the timeline
  --select-base-version <id>
                       Select an existing v001-style version as active base
  --target-version <id>
                       Attach --capture-comment to a v001-style version id
  --timestamp <iso>    Timestamp for capture writes (defaults to current time)
  --help, -h           Show this help text

Notes:
  The shell reads local timeline and role metadata only.
  Capture options mutate only the selected timeline artifact.
  Without --out, output is written to stdout and no files are created.
  With --out, only the derived HTML viewer is written; source evidence is not edited.
`;

interface ParsedControlRoomWebShellArgs {
  timelinePath?: string;
  outPath?: string;
  captureIdea?: string;
  captureComment?: string;
  selectBaseVersion?: string;
  targetVersion?: string;
  timestamp?: string;
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
    } else if (arg === '--capture-idea' && hasNext) {
      args.captureIdea = next;
      index += 1;
    } else if (arg === '--capture-comment' && hasNext) {
      args.captureComment = next;
      index += 1;
    } else if (arg === '--select-base-version' && hasNext) {
      args.selectBaseVersion = next;
      index += 1;
    } else if (arg === '--target-version' && hasNext) {
      args.targetVersion = next;
      index += 1;
    } else if (arg === '--timestamp' && hasNext) {
      args.timestamp = next;
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
  if (args.captureIdea !== undefined && args.captureComment !== undefined) {
    throw new Error('--capture-idea cannot be combined with --capture-comment.');
  }
  if (args.selectBaseVersion !== undefined && (
    args.captureIdea !== undefined || args.captureComment !== undefined
  )) {
    throw new Error('--select-base-version cannot be combined with capture options.');
  }
  if (args.targetVersion !== undefined && args.captureComment === undefined) {
    throw new Error('--target-version requires --capture-comment.');
  }
  if ((args.captureIdea !== undefined || args.captureComment !== undefined || args.selectBaseVersion !== undefined) && args.outPath) {
    throw new Error('Timeline mutation options cannot be combined with --out.');
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
  if (args.captureIdea !== undefined || args.captureComment !== undefined) {
    const result = await loadAndApplyHumanFeedbackToTimeline(repoRoot, args.timelinePath!, {
      kind: args.captureIdea !== undefined ? 'idea' : 'comment',
      text: args.captureIdea ?? args.captureComment!,
      timestamp: args.timestamp ?? new Date().toISOString(),
      targetVersion: args.targetVersion,
    });
    if (!result.ok || !result.timeline) {
      const diagnostics = result.diagnostics
        .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
        .join('\n');
      throw new Error(`Control-room human feedback capture failed:\n${diagnostics}`);
    }
    const payload = {
      ok: true,
      savedPath: result.savedPath,
      eventCount: result.timeline.events.length,
      updatedAt: result.timeline.updatedAt,
    };
    stdout(`${stringifyDeterministicJson(payload)}\n`);
    return;
  }
  if (args.selectBaseVersion !== undefined) {
    const result = await loadAndSelectControlRoomBaseVersion(repoRoot, args.timelinePath!, {
      versionId: args.selectBaseVersion,
      timestamp: args.timestamp ?? new Date().toISOString(),
    });
    if (!result.ok || !result.timeline) {
      const diagnostics = result.diagnostics
        .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
        .join('\n');
      throw new Error(`Control-room base-version selection failed:\n${diagnostics}`);
    }
    const payload = {
      ok: true,
      savedPath: result.savedPath,
      activeBaseVersion: result.timeline.activeBaseVersion,
      eventCount: result.timeline.events.length,
      updatedAt: result.timeline.updatedAt,
    };
    stdout(`${stringifyDeterministicJson(payload)}\n`);
    return;
  }

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
