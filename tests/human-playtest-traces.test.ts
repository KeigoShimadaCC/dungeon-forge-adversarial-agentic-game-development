import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runHumanPlaySession } from '../src/human-play/session.js';
import { HUMAN_PLAYER_PERSONA } from '../src/human-play/types.js';
import {
  buildScorecardRelativePath,
  buildTraceRelativePath,
} from '../src/harness/artifacts.js';
import { runPlaythrough } from '../src/harness/runner.js';
import {
  assertHumanPlaytestTraceShape,
  buildHumanNotesRelativePath,
  MAX_HUMAN_PLAYTEST_NOTES_LENGTH,
  MAX_HUMAN_SESSION_LABEL_LENGTH,
  PLAYER_KIND_AGENT,
  PLAYER_KIND_HUMAN,
} from '../src/harness/playtest-metadata.js';
import { deriveScorecardFromTrace, validateScorecard } from '../src/harness/scorecard.js';
import { summarizeVersion } from '../src/harness/version-loop.js';

describe('Phase 17B human playtest traces', () => {
  it('scripted human fixture produces a valid trace with human metadata', async () => {
    const result = await runHumanPlaySession({
      seed: 'seed_001',
      mode: 'script',
      scriptIndices: [0, 0, 0],
      maxSteps: 2,
      sessionLabel: 'smoke-script',
    });

    expect(result.trace.persona).toBe(HUMAN_PLAYER_PERSONA);
    expect(result.trace.player_kind).toBe(PLAYER_KIND_HUMAN);
    expect(result.trace.human_play_mode).toBe('script');
    expect(result.trace.session_label).toBe('smoke-script');
    expect(result.trace.steps.length).toBeGreaterThan(0);
    assertHumanPlaytestTraceShape(result.trace);

    const scorecard = deriveScorecardFromTrace(
      result.trace,
      buildTraceRelativePath(result.trace.version, result.trace.seed, result.trace.persona),
    );
    expect(scorecard.player_kind).toBe(PLAYER_KIND_HUMAN);
    expect(scorecard.human_play_mode).toBe('script');
    expect(() => validateScorecard(scorecard)).not.toThrow();
  });

  it('saves trace, scorecard, and optional human notes artifacts', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-human-trace-'));
    const version = 'v098';
    try {
      await mkdir(path.join(runsRoot, 'runs', version, 'traces'), { recursive: true });
      await mkdir(path.join(runsRoot, 'runs', version, 'scorecards'), { recursive: true });
      await mkdir(path.join(runsRoot, 'runs', version, 'human_notes'), { recursive: true });

      const result = await runHumanPlaySession({
        seed: 'seed_002',
        version,
        mode: 'auto',
        maxSteps: 2,
        saveTrace: true,
        runsRoot,
        sessionLabel: 'local-smoke',
        playtestNotes: 'Felt readable; stairs were far on this seed.',
      });

      expect(result.tracePath).toBeTruthy();
      expect(result.scorecardPath).toBeTruthy();
      expect(result.notesPath).toBeTruthy();

      const trace = JSON.parse(await readFile(result.tracePath!, 'utf8'));
      const scorecard = JSON.parse(await readFile(result.scorecardPath!, 'utf8'));
      const notes = JSON.parse(await readFile(result.notesPath!, 'utf8'));

      expect(trace.player_kind).toBe(PLAYER_KIND_HUMAN);
      expect(scorecard.player_kind).toBe(PLAYER_KIND_HUMAN);
      expect(notes.notes).toContain('readable');
      expect(notes.trace_path).toBe(
        buildTraceRelativePath(version, 'seed_002', HUMAN_PLAYER_PERSONA),
      );
      expect(notes.scorecard_path).toBe(
        buildScorecardRelativePath(version, 'seed_002', HUMAN_PLAYER_PERSONA),
      );
      expect(
        result.notesPath!.endsWith(
          path.basename(buildHumanNotesRelativePath(version, 'seed_002', HUMAN_PLAYER_PERSONA)),
        ),
      ).toBe(true);
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('bounds human labels and notes through the session API', async () => {
    await expect(
      runHumanPlaySession({
        seed: 'seed_001',
        mode: 'auto',
        maxSteps: 1,
        sessionLabel: ' '.repeat(2),
      }),
    ).rejects.toThrow('Session label must be non-empty');

    await expect(
      runHumanPlaySession({
        seed: 'seed_001',
        mode: 'auto',
        maxSteps: 1,
        sessionLabel: 'x'.repeat(MAX_HUMAN_SESSION_LABEL_LENGTH + 1),
      }),
    ).rejects.toThrow(`Session label exceeds ${MAX_HUMAN_SESSION_LABEL_LENGTH}`);

    await expect(
      runHumanPlaySession({
        seed: 'seed_001',
        mode: 'auto',
        maxSteps: 1,
        playtestNotes: 'x'.repeat(MAX_HUMAN_PLAYTEST_NOTES_LENGTH + 1),
      }),
    ).rejects.toThrow(`Human playtest notes exceed ${MAX_HUMAN_PLAYTEST_NOTES_LENGTH}`);
  });

  it('includes human run metadata in version summaries', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-human-summary-'));
    const version = 'v097';
    try {
      await runHumanPlaySession({
        seed: 'seed_003',
        version,
        mode: 'auto',
        maxSteps: 1,
        saveTrace: true,
        runsRoot,
        sessionLabel: 'summary-check',
      });

      const summary = await summarizeVersion(runsRoot, version, []);
      const humanRun = summary.runs.find((run) => run.persona === HUMAN_PLAYER_PERSONA);
      expect(humanRun).toBeDefined();
      expect(humanRun?.player_kind).toBe(PLAYER_KIND_HUMAN);
      expect(humanRun?.human_play_mode).toBe('auto');
      expect(humanRun?.session_label).toBe('summary-check');
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('leaves agent harness runs tagged as agent without human-only fields', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-agent-metadata-'));
    try {
      const { trace, scorecard } = await runPlaythrough({
        seed: 'seed_001',
        policyId: 'stairs-seeking',
        version: 'v096',
        runsRoot,
        maxSteps: 1,
      });

      expect(trace.player_kind).toBe(PLAYER_KIND_AGENT);
      expect(trace.agent_policy_class).toBe('baseline');
      expect(trace.human_play_mode).toBeUndefined();
      expect(scorecard.player_kind).toBe(PLAYER_KIND_AGENT);
      expect(scorecard.human_play_mode).toBeUndefined();
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });

  it('replays structured actions from a saved human trace fixture', async () => {
    const runsRoot = await mkdtemp(path.join(os.tmpdir(), 'df-human-replay-'));
    const version = 'v095';
    try {
      const first = await runHumanPlaySession({
        seed: 'seed_004',
        version,
        mode: 'script',
        scriptIndices: [0, 1, 0],
        maxSteps: 3,
        saveTrace: true,
        runsRoot,
      });

      const traceRaw = await readFile(first.tracePath!, 'utf8');
      const saved = JSON.parse(traceRaw) as typeof first.trace;
      const scriptIndices = saved.steps.map((step) => {
        const index = step.available_actions.findIndex(
          (action) =>
            action.id === step.chosen_action.id && action.type === step.chosen_action.type,
        );
        return index >= 0 ? index : 0;
      });

      const replay = await runHumanPlaySession({
        seed: 'seed_004',
        version,
        mode: 'script',
        scriptIndices,
        maxSteps: saved.steps.length,
      });

      expect(replay.trace.result).toBe(saved.result);
      expect(replay.trace.turns).toBe(saved.turns);
      expect(replay.trace.steps.length).toBe(saved.steps.length);
      for (let index = 0; index < saved.steps.length; index += 1) {
        expect(replay.trace.steps[index]?.chosen_action).toEqual(saved.steps[index]?.chosen_action);
      }
    } finally {
      await rm(runsRoot, { recursive: true, force: true });
    }
  });
});
