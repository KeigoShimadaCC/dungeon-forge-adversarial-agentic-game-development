import { startBrowserPlayServer } from './server.js';
import { createBrowserPlaySession } from './session.js';
import { loadBrowserReplay } from './replay.js';
import { stringifyDeterministicJson } from '../harness/json.js';

export const BROWSER_PLAY_CLI_USAGE = `Usage:
  pnpm run browser-play -- [--host 127.0.0.1] [--port 8787]
  pnpm run browser-play -- --smoke --seed seed_001 [--max-steps 3] [--export-trace]
  pnpm run browser-play -- --smoke-replay <trace-path>

Starts a local browser UI for structured-action play and read-only trace replay inspection.`;

interface BrowserPlayCliArgs {
  help: boolean;
  host: string;
  port: number;
  smoke: boolean;
  smokeReplay?: string;
  seed: string;
  maxSteps: number;
  exportTrace: boolean;
}

const parseBrowserPlayCliArgs = (argv: string[]): BrowserPlayCliArgs => {
  const tokens = argv.filter((token) => token !== '--');
  const args: BrowserPlayCliArgs = {
    help: false,
    host: '127.0.0.1',
    port: 8787,
    smoke: false,
    seed: 'seed_001',
    maxSteps: 3,
    exportTrace: false,
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const arg = tokens[index];
    switch (arg) {
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--host':
        args.host = tokens[++index] ?? args.host;
        break;
      case '--port':
        args.port = Number.parseInt(tokens[++index] ?? '', 10);
        if (!Number.isInteger(args.port) || args.port < 0) {
          throw new Error('--port must be a non-negative integer.');
        }
        break;
      case '--smoke':
        args.smoke = true;
        break;
      case '--smoke-replay':
        args.smokeReplay = tokens[++index];
        if (!args.smokeReplay) {
          throw new Error('--smoke-replay requires a trace path.');
        }
        break;
      case '--seed':
        args.seed = tokens[++index] ?? args.seed;
        break;
      case '--max-steps':
        args.maxSteps = Number.parseInt(tokens[++index] ?? '', 10);
        if (!Number.isInteger(args.maxSteps) || args.maxSteps < 1) {
          throw new Error('--max-steps must be a positive integer.');
        }
        break;
      case '--export-trace':
        args.exportTrace = true;
        break;
      default:
        throw new Error(`Unknown browser-play argument: ${arg}`);
    }
  }

  return args;
};

const runSmoke = async (args: BrowserPlayCliArgs): Promise<void> => {
  const session = createBrowserPlaySession({
    seed: args.seed,
    sessionLabel: 'browser-play-smoke',
  });
  let snapshot = session.snapshot();
  for (let index = 0; index < args.maxSteps && !snapshot.isTerminal; index += 1) {
    const action = snapshot.actions[0];
    if (!action) {
      break;
    }
    snapshot = session.applyAction({ actionId: action.id, actionType: action.type });
  }
  const exported = args.exportTrace
    ? await session.exportTrace(process.cwd(), { write: { onExisting: 'archive' } })
    : undefined;
  process.stdout.write(
    stringifyDeterministicJson({
      ok: true,
      mode: 'browser-play-smoke',
      seed: args.seed,
      terminalStatus: snapshot.terminalStatus,
      stepsRecorded: snapshot.stepsRecorded,
      actionCount: snapshot.actions.length,
      ...(exported
        ? {
            tracePath: exported.tracePath,
            scorecardPath: exported.scorecardPath,
          }
        : {}),
    }),
  );
};

const runSmokeReplay = async (tracePath: string): Promise<void> => {
  const replay = await loadBrowserReplay(tracePath);
  process.stdout.write(
    stringifyDeterministicJson({
      ok: replay.ok,
      mode: 'browser-replay-smoke',
      tracePath,
      diagnostics: replay.diagnostics,
      readOnly: replay.readOnly,
      stepCount: replay.steps.length,
      result: replay.trace?.result,
    }),
  );
  if (!replay.ok) {
    process.exitCode = 1;
  }
};

export const runBrowserPlayCli = async (argv: string[] = process.argv.slice(2)): Promise<void> => {
  const args = parseBrowserPlayCliArgs(argv);
  if (args.help) {
    process.stdout.write(`${BROWSER_PLAY_CLI_USAGE}\n`);
    return;
  }
  if (args.smokeReplay) {
    await runSmokeReplay(args.smokeReplay);
    return;
  }
  if (args.smoke) {
    await runSmoke(args);
    return;
  }

  const handle = await startBrowserPlayServer({ host: args.host, port: args.port });
  process.stdout.write(`Browser play UI: ${handle.url}\n`);
};

const isMainModule = (): boolean => {
  const entry = process.argv[1];
  return entry !== undefined && entry.endsWith('browser-play-cli.js');
};

if (isMainModule()) {
  runBrowserPlayCli().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
