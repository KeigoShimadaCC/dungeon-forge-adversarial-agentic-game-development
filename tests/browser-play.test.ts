import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { createBrowserPlaySession } from '../src/browser-play/session.js';
import { loadBrowserReplay } from '../src/browser-play/replay.js';
import { createBrowserPlayHttpServer } from '../src/browser-play/server.js';
import { runBrowserPlayCli } from '../src/browser-play/browser-play-cli.js';
import { runPlaythrough } from '../src/harness/runner.js';

describe('PHASE-24A browser play and replay UI adapters', () => {
  it('starts browser play with structured actions from the engine', () => {
    const session = createBrowserPlaySession({ seed: 'seed_001' });
    const snapshot = session.snapshot();

    expect(snapshot.label).toBe('Game state and local play evidence');
    expect(snapshot.render).toContain('@');
    expect(snapshot.actions.length).toBeGreaterThan(0);
    expect(snapshot.actions.every((action) => action.id && action.type && action.label)).toBe(true);
    expect(snapshot.tracePreview.human_play_mode).toBe('browser');
  });

  it('applies only available structured actions and records trace steps', () => {
    const session = createBrowserPlaySession({ seed: 'seed_001' });
    const initial = session.snapshot();
    const action = initial.actions[0];
    expect(action).toBeTruthy();

    const next = session.applyAction({ actionId: action!.id, actionType: action!.type });
    expect(next.stepsRecorded).toBe(1);
    expect(next.events.length).toBeGreaterThan(0);
    expect(() => session.applyAction({ actionId: 'free_text' })).toThrow(/not available/u);
  });

  it('exports harness-compatible browser play traces and scorecards', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-browser-play-'));
    try {
      const session = createBrowserPlaySession({
        seed: 'seed_002',
        sessionLabel: 'browser-test',
      });
      const action = session.snapshot().actions[0];
      session.applyAction({ actionId: action!.id, actionType: action!.type });

      const exported = await session.exportTrace(runsRoot);
      const traceRaw = await readFile(exported.tracePath, 'utf8');
      const trace = JSON.parse(traceRaw) as typeof exported.trace;
      expect(trace.player_kind).toBe('human');
      expect(trace.human_play_mode).toBe('browser');
      expect(trace.session_label).toBe('browser-test');
      expect(trace.steps[0]?.chosen_action.id).toBe(action!.id);

      const scorecardRaw = await readFile(exported.scorecardPath, 'utf8');
      expect(scorecardRaw).toContain('"human_play_mode": "browser"');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('loads replay traces without mutating source evidence', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-browser-replay-'));
    try {
      const { artifacts, trace } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'greedy-item-picker',
        version: 'v001',
        runsRoot,
      });
      const before = await stat(artifacts.tracePath);

      const replay = await loadBrowserReplay(artifacts.tracePath);
      const after = await stat(artifacts.tracePath);

      expect(replay.ok).toBe(true);
      expect(replay.label).toBe('Read-only trace replay inspection');
      expect(replay.readOnly).toBe(true);
      expect(after.mtimeMs).toBe(before.mtimeMs);
      expect(after.size).toBe(before.size);
      expect(replay.trace?.result).toBe(trace.result);
      expect(replay.traceHeader).toContain('=== trace replay ===');
      expect(replay.steps[0]?.formatted).toContain('action:');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('labels malformed replay data with diagnostics', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-browser-replay-bad-'));
    try {
      const tracePath = path.join(runsRoot, 'bad-trace.json');
      await writeFile(tracePath, '{"version":"v001","steps":"bad"}\n', 'utf8');

      const replay = await loadBrowserReplay(tracePath);
      expect(replay.ok).toBe(false);
      expect(replay.diagnostics.some((entry) => entry.category === 'blocker')).toBe(true);
      expect(replay.diagnostics.map((entry) => entry.field).join(' ')).toContain('steps');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('constructs the local browser server without making the browser authoritative', () => {
    const { server, sessions } = createBrowserPlayHttpServer();
    expect(server.listening).toBe(false);
    expect(sessions.size).toBe(0);
    server.close();
  });

  it('runs CLI smoke paths for play and replay', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-browser-cli-'));
    const priorCwd = process.cwd();
    try {
      process.chdir(runsRoot);
      await runBrowserPlayCli(['--smoke', '--seed', 'seed_001', '--max-steps', '2', '--export-trace']);
      const tracePath = path.join(
        runsRoot,
        'runs',
        '0.3.0-minimal-dungeon',
        'traces',
        'seed_001_human_player.json',
      );
      expect(await readFile(tracePath, 'utf8')).toContain('"human_play_mode": "browser"');
      await runBrowserPlayCli(['--smoke', '--seed', 'seed_001', '--max-steps', '2', '--export-trace']);
      expect(await readFile(tracePath, 'utf8')).toContain('"human_play_mode": "browser"');
      await runBrowserPlayCli(['--smoke-replay', tracePath]);
    } finally {
      process.chdir(priorCwd);
      await rm(runsRoot, { recursive: true, force: true });
    }
  });
});
