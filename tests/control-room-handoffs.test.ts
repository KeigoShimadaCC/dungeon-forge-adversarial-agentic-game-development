import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildControlRoomHandoffPanelModel,
  buildControlRoomPreparedHandoff,
  buildPreparedHandoffTimelineEvent,
  renderControlRoomHandoffPanelHtml,
  stringifyControlRoomPreparedHandoff,
} from '../src/control-room/handoffs/index.js';
import { runControlRoomHandoffCli } from '../src/control-room/handoffs/control-room-handoff-cli.js';
import {
  buildV001V002V003TimelineArtifact,
  labelMissingTimelineEvidence,
  saveControlRoomTimeline,
} from '../src/control-room/timeline/index.js';

const PREPARED_AT = '2026-05-24T05:32:22.000Z';

const withTempRepoRoot = async (fn: (repoRoot: string) => Promise<void>): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'df-control-room-handoff-'));
  try {
    await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
};

const writeEvidence = async (repoRoot: string, relativePath: string, content = '{}\n'): Promise<void> => {
  const absolutePath = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, 'utf8');
};

const writeAllFixtureEvidence = async (repoRoot: string): Promise<void> => {
  for (const relativePath of [
    'runs/v001/traces/seed_001_careful_player.json',
    'runs/v001/reviews/seed_001_careful_player.json',
    'runs/v001/scorecards/seed_001_careful_player.json',
    'runs/v001/version_summary.json',
    'runs/v001/developer_notes.md',
    'runs/comparisons/v001_vs_v002.json',
    'runs/v002/changelog.md',
    'runs/comparisons/v002_vs_v003.json',
    'runs/v003/acceptance.md',
    'runs/v003/reviews/missing_optional_review.json',
    'runs/v003/balance_summary.json',
  ]) {
    await writeEvidence(repoRoot, relativePath);
  }
};

describe('PHASE-27A prepared control-room handoffs', () => {
  it('builds a ready handoff with base version, human context, summaries, evidence, and commands', async () => {
    await withTempRepoRoot(async (repoRoot) => {
      await writeAllFixtureEvidence(repoRoot);
      const timeline = await labelMissingTimelineEvidence(
        repoRoot,
        buildV001V002V003TimelineArtifact(),
      );
      const handoff = buildControlRoomPreparedHandoff(timeline, {
        preparedAt: PREPARED_AT,
        handoffArtifactPath: 'runs/control-room/handoffs/v001-v002-v003.prepared-handoff.json',
        panelArtifactPath: 'runs/control-room/handoffs/v001-v002-v003.panel.html',
      });

      expect(handoff).toMatchObject({
        schemaVersion: 1,
        status: 'ready',
        selectedBaseVersion: 'v001',
        latestKnownVersion: 'v003',
        historicalVersionsAfterSelectedBase: ['v002', 'v003'],
        humanIdea: 'Make a tiny dungeon loop that can improve through trace-backed review.',
        developerContext: 'Developer produced the baseline version evidence.',
        reviewerSummary: 'Reviewer flagged shallow item use and limited tactical choices.',
      });
      expect(handoff.humanComments).toEqual([
        expect.objectContaining({
          targetVersion: 'v002',
          text: 'Human comment: keep the Smoke Bomb clarity improvement.',
        }),
      ]);
      expect(handoff.evidence.map((entry) => entry.relativePath)).toEqual(
        expect.arrayContaining([
          'runs/v001/traces/seed_001_careful_player.json',
          'runs/v001/reviews/seed_001_careful_player.json',
          'runs/v003/reviews/missing_optional_review.json',
        ]),
      );
      expect(handoff.blockers).toEqual([]);
      expect(handoff.suggestedCommands.map((command) => command.command)).toEqual(
        expect.arrayContaining([
          'pnpm run developer-task -- --target-version v001 --runs-root .',
        ]),
      );
      expect(handoff.developerTaskText).toContain('Selected base version: v001');
      expect(handoff.developerTaskText).toContain('Historical versions after selected base: v002, v003');
      expect(handoff.timelineEvent).toMatchObject({
        type: 'prepared_next_step',
        source: 'system',
        versionId: 'v001',
      });
    });
  });

  it('marks missing evidence as blocked and never ready', async () => {
    const timeline = await labelMissingTimelineEvidence(process.cwd(), {
      ...buildV001V002V003TimelineArtifact(),
      activeBaseVersion: 'v003',
    });
    const handoff = buildControlRoomPreparedHandoff(timeline, { preparedAt: PREPARED_AT });

    expect(handoff.status).toBe('missing_evidence');
    expect(handoff.blockers).toContain(
      'Missing evidence: review: runs/v003/reviews/missing_optional_review.json',
    );
    expect(handoff.blockers).toContain(
      'No developer summary is available for selected base v003.',
    );
    expect(handoff.humanSummary).toContain('missing evidence');
  });

  it('renders an inert panel with no browser execution controls', async () => {
    await withTempRepoRoot(async (repoRoot) => {
      await writeAllFixtureEvidence(repoRoot);
      const handoff = buildControlRoomPreparedHandoff(
        await labelMissingTimelineEvidence(repoRoot, buildV001V002V003TimelineArtifact()),
        { preparedAt: PREPARED_AT },
      );
      const html = renderControlRoomHandoffPanelHtml(buildControlRoomHandoffPanelModel(handoff));

      expect(html).toContain('Prepared Control Room Handoff');
      expect(html).toContain('Suggested Commands');
      expect(html).toContain('pnpm run developer-task');
      expect(html).not.toContain('<script');
      expect(html).not.toContain('<button');
      expect(html).not.toContain('<form');
      expect(html).not.toContain('Launch Cursor');
      expect(html).not.toContain('agent --print');
      expect(html).not.toContain('gh pr');
      expect(html).not.toContain('git commit');
      expect(html).not.toContain('git merge');
    });
  });

  it('serializes deterministic handoff output and matches the committed ready fixture', async () => {
    await withTempRepoRoot(async (repoRoot) => {
      await writeAllFixtureEvidence(repoRoot);
      const timeline = await labelMissingTimelineEvidence(repoRoot, buildV001V002V003TimelineArtifact());
      const first = buildControlRoomPreparedHandoff(timeline, { preparedAt: PREPARED_AT });
      const second = buildControlRoomPreparedHandoff(
        { ...timeline, events: [...timeline.events].reverse() },
        { preparedAt: PREPARED_AT },
      );
      const fixtureRaw = await readFile(
        path.join(process.cwd(), 'tests/fixtures/control-room-handoffs/ready-handoff.json'),
        'utf8',
      );

      expect(stringifyControlRoomPreparedHandoff(first)).toBe(
        stringifyControlRoomPreparedHandoff(second),
      );
      expect(JSON.parse(fixtureRaw)).toEqual(JSON.parse(stringifyControlRoomPreparedHandoff(first)));
    });
  });

  it('keeps blocked fixture output deterministic', async () => {
    const handoff = buildControlRoomPreparedHandoff(
      await labelMissingTimelineEvidence(process.cwd(), {
        ...buildV001V002V003TimelineArtifact(),
        activeBaseVersion: 'v003',
      }),
      { preparedAt: PREPARED_AT },
    );
    const fixtureRaw = await readFile(
      path.join(process.cwd(), 'tests/fixtures/control-room-handoffs/blocked-missing-evidence-handoff.json'),
      'utf8',
    );

    expect(JSON.parse(fixtureRaw)).toEqual(JSON.parse(stringifyControlRoomPreparedHandoff(handoff)));
  });

  it('writes handoff artifacts through the local CLI without mutating the timeline', async () => {
    await withTempRepoRoot(async (repoRoot) => {
      await writeAllFixtureEvidence(repoRoot);
      const timelinePath = await saveControlRoomTimeline(
        repoRoot,
        'v001-v002-v003.timeline.json',
        buildV001V002V003TimelineArtifact(),
      );
      const before = await readFile(path.join(repoRoot, timelinePath), 'utf8');
      const stdout: string[] = [];
      const priorCwd = process.cwd();
      try {
        process.chdir(repoRoot);
        await runControlRoomHandoffCli([
          '--timeline',
          timelinePath,
          '--out',
          'runs/control-room/handoffs/v001-v002-v003.prepared-handoff.json',
          '--html',
          'runs/control-room/handoffs/v001-v002-v003.panel.html',
          '--prepared-at',
          PREPARED_AT,
        ], {
          stdout: (value) => stdout.push(value),
        });
      } finally {
        process.chdir(priorCwd);
      }

      expect(stdout.join('')).toContain('Prepared control-room handoff: ready');
      expect(await readFile(path.join(repoRoot, timelinePath), 'utf8')).toBe(before);
      expect(JSON.parse(await readFile(
        path.join(repoRoot, 'runs/control-room/handoffs/v001-v002-v003.prepared-handoff.json'),
        'utf8',
      ))).toMatchObject({ status: 'ready', selectedBaseVersion: 'v001' });
      expect(await readFile(
        path.join(repoRoot, 'runs/control-room/handoffs/v001-v002-v003.panel.html'),
        'utf8',
      )).toContain('Suggested Commands');
    });
  });

  it('rejects unsafe local handoff artifact paths', () => {
    const timeline = buildV001V002V003TimelineArtifact();
    const handoff = buildControlRoomPreparedHandoff(timeline, { preparedAt: PREPARED_AT });
    expect(() =>
      buildPreparedHandoffTimelineEvent({
        timeline,
        handoff,
        handoffArtifactPath: 'runs/v001/outside.json',
      }),
    ).toThrow('Handoff artifact path must stay under runs/control-room/handoffs/.');
  });
});
