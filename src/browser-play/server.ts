import http from 'node:http';
import { randomUUID } from 'node:crypto';

import {
  createBrowserPlaySession,
  type BrowserPlaySession,
  type BrowserPlayStartOptions,
} from './session.js';
import { loadBrowserReplay } from './replay.js';
import type { PlayerActionType } from '../game/types.js';

export interface BrowserPlayServerOptions {
  host?: string;
  port?: number;
}

export interface BrowserPlayServerHandle {
  server: http.Server;
  sessions: Map<string, BrowserPlaySession>;
  url: string;
  close: () => Promise<void>;
}

const readBody = async (request: http.IncomingMessage): Promise<unknown> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sendJson = (
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
): void => {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(payload));
};

const sendHtml = (response: http.ServerResponse): void => {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(BROWSER_PLAY_HTML);
};

const parseStartOptions = (body: unknown): BrowserPlayStartOptions => {
  if (!isRecord(body) || typeof body.seed !== 'string' || body.seed.trim().length === 0) {
    throw new Error('seed is required.');
  }
  return {
    seed: body.seed.trim(),
    ...(typeof body.version === 'string' && body.version.trim()
      ? { version: body.version.trim() }
      : {}),
    ...(typeof body.challengeMode === 'string' && body.challengeMode.trim()
      ? { challengeMode: body.challengeMode.trim() }
      : {}),
    ...(typeof body.scenarioPack === 'string' && body.scenarioPack.trim()
      ? { scenarioPack: body.scenarioPack.trim() }
      : {}),
    ...(typeof body.sessionLabel === 'string' && body.sessionLabel.trim()
      ? { sessionLabel: body.sessionLabel.trim() }
      : {}),
  };
};

const requireSession = (
  sessions: Map<string, BrowserPlaySession>,
  body: unknown,
): BrowserPlaySession => {
  if (!isRecord(body) || typeof body.sessionId !== 'string') {
    throw new Error('sessionId is required.');
  }
  const session = sessions.get(body.sessionId);
  if (!session) {
    throw new Error(`Unknown browser play session: ${body.sessionId}`);
  }
  return session;
};

const PLAYER_ACTION_TYPES = new Set<PlayerActionType>([
  'move',
  'attack',
  'wait',
  'use_item',
  'pickup',
  'descend',
  'talk',
  'inspect',
]);

const parseActionType = (value: unknown): PlayerActionType | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  if (!PLAYER_ACTION_TYPES.has(value as PlayerActionType)) {
    throw new Error(`Unknown action type: ${value}`);
  }
  return value as PlayerActionType;
};

export const createBrowserPlayHttpServer = (): {
  server: http.Server;
  sessions: Map<string, BrowserPlaySession>;
} => {
  const sessions = new Map<string, BrowserPlaySession>();
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (request.method === 'GET' && url.pathname === '/') {
        sendHtml(response);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/play/start') {
        const session = createBrowserPlaySession(parseStartOptions(await readBody(request)));
        const sessionId = randomUUID();
        sessions.set(sessionId, session);
        sendJson(response, 200, { sessionId, snapshot: session.snapshot() });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/play/action') {
        const body = await readBody(request);
        const session = requireSession(sessions, body);
        if (!isRecord(body) || typeof body.actionId !== 'string') {
          throw new Error('actionId is required.');
        }
        sendJson(response, 200, {
          snapshot: session.applyAction({
            actionId: body.actionId,
            ...(parseActionType(body.actionType)
              ? { actionType: parseActionType(body.actionType) }
              : {}),
          }),
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/play/export') {
        const body = await readBody(request);
        const session = requireSession(sessions, body);
        const runsRoot = isRecord(body) && typeof body.runsRoot === 'string'
          ? body.runsRoot
          : process.cwd();
        const exported = await session.exportTrace(runsRoot);
        sendJson(response, 200, {
          tracePath: exported.tracePath,
          scorecardPath: exported.scorecardPath,
          result: exported.trace.result,
          turns: exported.trace.turns,
        });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/replay/load') {
        const body = await readBody(request);
        if (!isRecord(body) || typeof body.tracePath !== 'string') {
          throw new Error('tracePath is required.');
        }
        sendJson(response, 200, await loadBrowserReplay(body.tracePath));
        return;
      }
      sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendJson(response, 400, { error: message });
    }
  });
  return { server, sessions };
};

export const startBrowserPlayServer = async (
  options: BrowserPlayServerOptions = {},
): Promise<BrowserPlayServerHandle> => {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 8787;
  const { server, sessions } = createBrowserPlayHttpServer();
  await new Promise<void>((resolve) => {
    server.listen(port, host, resolve);
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  return {
    server,
    sessions,
    url: `http://${host}:${actualPort}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
};

const BROWSER_PLAY_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dungeon Forge Browser Play</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; }
    body { margin: 0; background: #101418; color: #f4f1e8; }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; display: grid; gap: 16px; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: center; }
    h1 { font-size: 24px; margin: 0; }
    h2 { font-size: 16px; margin: 0 0 10px; }
    .toolbar, .grid, .actions { display: grid; gap: 10px; }
    .toolbar { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); align-items: end; }
    .grid { grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.9fr); }
    section { border: 1px solid #3d4752; border-radius: 8px; padding: 14px; background: #171d23; }
    label { display: grid; gap: 4px; color: #cbd5df; font-size: 13px; }
    input { border: 1px solid #536170; border-radius: 6px; padding: 8px; background: #0d1116; color: #f4f1e8; }
    button { border: 1px solid #7a8ca0; border-radius: 6px; padding: 8px 10px; background: #26313b; color: #fff; cursor: pointer; }
    button:disabled { opacity: .5; cursor: default; }
    pre { margin: 0; white-space: pre-wrap; font: 13px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .status { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
    .pill { border: 1px solid #536170; border-radius: 6px; padding: 8px; background: #11171d; }
    .actions { grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
    .muted { color: #aab5c0; }
    .danger { color: #ffb4a8; }
    @media (max-width: 840px) { .grid { grid-template-columns: 1fr; } header { display: grid; } }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Dungeon Forge Browser Play</h1>
      <div class="muted">Game state and local play evidence, not reviewer or acceptance verdicts</div>
    </header>
    <section class="toolbar">
      <label>Seed <input id="seed" value="seed_001"></label>
      <label>Version <input id="version" value="0.3.0-minimal-dungeon"></label>
      <label>Replay trace path <input id="tracePath" value="runs/v001/traces/seed_001_greedy-item-picker.json"></label>
      <button id="start">Start game</button>
      <button id="export" disabled>Export trace</button>
      <button id="loadReplay">Load replay</button>
    </section>
    <div class="grid">
      <section>
        <h2>Game state</h2>
        <div id="status" class="status"></div>
        <pre id="render">(start a game)</pre>
        <h2>Structured actions</h2>
        <div id="actions" class="actions"></div>
      </section>
      <section>
        <h2>Events and evidence paths</h2>
        <pre id="events"></pre>
        <h2 id="replayTitle">Read-only trace replay inspection</h2>
        <p id="replayHint" class="muted">Existing trace evidence only — not reviewer or acceptance verdicts</p>
        <pre id="replayMeta">(load a replay trace)</pre>
        <div class="toolbar">
          <button id="prevReplay" disabled>Previous step</button>
          <button id="nextReplay" disabled>Next step</button>
          <span id="replayPosition" class="muted"></span>
        </div>
        <pre id="replay">(load a replay trace)</pre>
      </section>
    </div>
  </main>
  <script>
    let sessionId;
    let replaySteps = [];
    let replayIndex = 0;
    let replayHeader = '';
    let replayLabel = 'Read-only trace replay inspection';
    const post = async (url, body) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      const json = await response.json();
      if (!response.ok || json.error) throw new Error(json.error || response.statusText);
      return json;
    };
    const setText = (id, text) => { document.getElementById(id).textContent = text; };
    const renderSnapshot = (snapshot) => {
      document.getElementById('export').disabled = snapshot.stepsRecorded === 0;
      setText('render', snapshot.render);
      document.getElementById('status').innerHTML = [
        ['Terminal', snapshot.terminalStatus],
        ['Turn', snapshot.state.turn],
        ['Floor', snapshot.state.floor],
        ['HP', snapshot.state.hp + '/' + snapshot.state.maxHp],
        ['Inventory', snapshot.inventory.join(', ') || '(empty)'],
        ['Trace steps', snapshot.stepsRecorded]
      ].map(([k, v]) => '<div class="pill"><strong>' + k + '</strong><br>' + v + '</div>').join('');
      document.getElementById('actions').replaceChildren(...snapshot.actions.map((action) => {
        const button = document.createElement('button');
        button.textContent = action.label + ' (' + action.type + ')';
        button.disabled = snapshot.isTerminal;
        button.onclick = async () => {
          try {
            const result = await post('/api/play/action', { sessionId, actionId: action.id, actionType: action.type });
            renderSnapshot(result.snapshot);
          } catch (error) { setText('events', String(error.message || error)); }
        };
        return button;
      }));
      setText('events', snapshot.events.map((event) => event.type + ': ' + event.message).join('\\n') || '(none)');
    };
    document.getElementById('start').onclick = async () => {
      const result = await post('/api/play/start', {
        seed: document.getElementById('seed').value,
        version: document.getElementById('version').value
      });
      sessionId = result.sessionId;
      renderSnapshot(result.snapshot);
    };
    document.getElementById('export').onclick = async () => {
      const result = await post('/api/play/export', { sessionId });
      setText('events', 'Saved trace: ' + result.tracePath + '\\nSaved scorecard: ' + result.scorecardPath);
    };
    const renderReplayStep = () => {
      if (replaySteps.length === 0) return;
      const step = replaySteps[replayIndex];
      setText('replayPosition', 'Step ' + (replayIndex + 1) + ' of ' + replaySteps.length + ' (turn ' + step.turn + ')');
      setText('replay', (replayHeader ? replayHeader + '\\n\\n' : '') + step.formatted);
      document.getElementById('prevReplay').disabled = replayIndex === 0;
      document.getElementById('nextReplay').disabled = replayIndex >= replaySteps.length - 1;
    };
    document.getElementById('loadReplay').onclick = async () => {
      const result = await post('/api/replay/load', { tracePath: document.getElementById('tracePath').value });
      replayLabel = result.label || replayLabel;
      setText('replayTitle', replayLabel);
      if (!result.ok) {
        replaySteps = [];
        replayHeader = '';
        setText('replayMeta', result.readOnly ? 'Trace file unchanged (read-only load).' : 'Trace file changed during load.');
        setText('replayPosition', '');
        setText('replay', result.diagnostics.map((d) => '[' + d.category + '] ' + (d.field || 'trace') + ': ' + d.message).join('\\n'));
        document.getElementById('prevReplay').disabled = true;
        document.getElementById('nextReplay').disabled = true;
        return;
      }
      replaySteps = result.steps;
      replayHeader = result.traceHeader || '';
      replayIndex = 0;
      const summary = result.trace
        ? 'seed: ' + result.trace.seed + ' | result: ' + result.trace.result + ' | steps: ' + result.trace.stepCount
        : '';
      setText('replayMeta', summary + (result.readOnly ? ' | trace file unchanged (read-only)' : ' | WARNING: trace file changed'));
      renderReplayStep();
    };
    document.getElementById('prevReplay').onclick = () => { replayIndex = Math.max(0, replayIndex - 1); renderReplayStep(); };
    document.getElementById('nextReplay').onclick = () => { replayIndex = Math.min(replaySteps.length - 1, replayIndex + 1); renderReplayStep(); };
  </script>
</body>
</html>`;
