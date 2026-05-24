import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildControlRoomTimelineRelativePath,
  buildV001V002V003TimelineArtifact,
  buildV001V002V003TimelineEvents,
  labelMissingTimelineEvidence,
  listControlRoomTimelineEvents,
  loadControlRoomTimeline,
  projectControlRoomTimeline,
  saveControlRoomTimeline,
  selectControlRoomBaseVersion,
  stringifyControlRoomTimeline,
  validateControlRoomTimeline,
} from '../src/control-room/timeline/index.js';
import { stringifyDeterministicJson } from '../src/harness/json.js';

const FIXED_TIMESTAMP = '2026-05-24T04:06:47.000Z';

const withTempRepoRoot = async (fn: (repoRoot: string) => Promise<void>): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'df-control-room-timeline-'));
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

describe('PHASE-25A control-room timeline artifacts', () => {
  it('lists UI-ready projection events for v001 -> v002 -> v003 without parsing raw evidence JSON', () => {
    const timeline = buildV001V002V003TimelineArtifact();
    const events = listControlRoomTimelineEvents(timeline);

    expect(events.map((event) => event.type)).toEqual([
      'human_idea',
      'developer_summary',
      'reviewer_summary',
      'human_comment',
      'version_selected_as_base',
      'reviewer_summary',
      'prepared_next_step',
      'version_selected_as_base',
    ]);
    expect(events.map((event) => event.versionId ?? null)).toEqual([
      null,
      'v001',
      'v001',
      'v002',
      'v002',
      'v003',
      'v003',
      'v001',
    ]);
    expect(events[3]).toMatchObject({
      type: 'human_comment',
      source: 'human',
      summary: 'Human comment: keep the Smoke Bomb clarity improvement.',
      evidence: expect.arrayContaining([
        expect.objectContaining({ kind: 'comparison' }),
        expect.objectContaining({ kind: 'changelog' }),
      ]),
    });
    expect(projectControlRoomTimeline(timeline).events).toEqual(events);
  });

  it('creates, saves, loads, and projects a v001 -> v002 -> v003 timeline deterministically', async () => {
    await withTempRepoRoot(async (repoRoot) => {
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
        'runs/v003/balance_summary.json',
      ]) {
        await writeEvidence(repoRoot, relativePath);
      }

      const timeline = buildV001V002V003TimelineArtifact();
      const labeledTimeline = await labelMissingTimelineEvidence(repoRoot, timeline);

      expect(labeledTimeline.events.map((event) => event.id)).toEqual([
        '001-human_idea',
        'v001-002-developer_summary',
        'v001-003-reviewer_summary',
        'v002-004-human_comment',
        'v002-005-version_selected_as_base',
        'v003-007-reviewer_summary',
        'v003-006-prepared_next_step',
        'v001-008-version_selected_as_base',
      ]);
      expect(labeledTimeline.events[3]).toMatchObject({
        type: 'human_comment',
        source: 'human',
        summary: 'Human comment: keep the Smoke Bomb clarity improvement.',
      });
      expect(labeledTimeline.events[5]?.missingEvidence).toEqual([
        'review: runs/v003/reviews/missing_optional_review.json',
      ]);

      const relativePath = await saveControlRoomTimeline(
        repoRoot,
        'v001-v002-v003.timeline.json',
        labeledTimeline,
      );
      expect(relativePath).toBe('runs/control-room/timeline/v001-v002-v003.timeline.json');

      const loaded = await loadControlRoomTimeline(repoRoot, relativePath);
      expect(loaded.ok).toBe(true);
      expect(loaded.diagnostics).toEqual([]);
      expect(projectControlRoomTimeline(loaded.timeline!)).toMatchObject({
        sessionId: 'control-room-v001-v002-v003',
        activeBaseVersion: 'v001',
        latestKnownVersion: 'v003',
        historicalVersionsAfterActiveBase: ['v002', 'v003'],
        events: [
          { id: '001-human_idea', evidenceCount: 0, missingEvidenceCount: 0 },
          { id: 'v001-002-developer_summary', evidenceCount: 3, missingEvidenceCount: 0 },
          { id: 'v001-003-reviewer_summary', evidenceCount: 2, missingEvidenceCount: 0 },
          { id: 'v002-004-human_comment', evidenceCount: 2, missingEvidenceCount: 0 },
          { id: 'v002-005-version_selected_as_base', evidenceCount: 1, missingEvidenceCount: 0 },
          { id: 'v003-007-reviewer_summary', evidenceCount: 2, missingEvidenceCount: 1 },
          { id: 'v003-006-prepared_next_step', evidenceCount: 1, missingEvidenceCount: 0 },
          { id: 'v001-008-version_selected_as_base', evidenceCount: 1, missingEvidenceCount: 0 },
        ],
      });
    });
  });

  it('selects an older existing base without removing later version evidence', () => {
    const timeline = {
      ...buildV001V002V003TimelineArtifact(),
      activeBaseVersion: 'v006',
      events: [
        ...buildV001V002V003TimelineEvents(),
        {
          id: 'v005-009-developer_summary',
          type: 'developer_summary' as const,
          timestamp: '2026-05-24T04:14:00.000Z',
          actor: 'developer',
          source: 'developer_ai' as const,
          versionId: 'v005',
          summary: 'Developer summary for version five.',
        },
        {
          id: 'v006-010-reviewer_summary',
          type: 'reviewer_summary' as const,
          timestamp: '2026-05-24T04:15:00.000Z',
          actor: 'reviewer',
          source: 'reviewer_ai' as const,
          versionId: 'v006',
          summary: 'Reviewer summary for version six.',
        },
      ],
    };

    const result = selectControlRoomBaseVersion(timeline, {
      versionId: 'v005',
      timestamp: '2026-05-24T04:16:00.000Z',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.timeline.activeBaseVersion).toBe('v005');
    expect(result.timeline.updatedAt).toBe('2026-05-24T04:16:00.000Z');
    expect(result.timeline.events.map((event) => event.versionId).filter(Boolean)).toEqual(
      expect.arrayContaining(['v005', 'v006']),
    );
    expect(result.timeline.events).toContainEqual(
      expect.objectContaining({
        type: 'version_selected_as_base',
        versionId: 'v005',
        summary: 'Select v005 as the active base for the next iteration without deleting later versions.',
      }),
    );
    expect(projectControlRoomTimeline(result.timeline)).toMatchObject({
      activeBaseVersion: 'v005',
      latestKnownVersion: 'v006',
      historicalVersionsAfterActiveBase: ['v006'],
    });
  });

  it('rejects selecting an unknown base version', () => {
    const result = selectControlRoomBaseVersion(buildV001V002V003TimelineArtifact(), {
      versionId: 'v999',
      timestamp: '2026-05-24T04:16:00.000Z',
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toEqual([
      {
        path: '$.versionId',
        message: 'selected base version must exist in timeline evidence: v999',
      },
    ]);
  });

  it('keeps stable serialization for equivalent unsorted input and the committed fixture', async () => {
    const timeline = buildV001V002V003TimelineArtifact();
    const reversedTimeline = { ...timeline, events: [...buildV001V002V003TimelineEvents()].reverse() };
    const fixtureRaw = await readFile(
      path.join(process.cwd(), 'tests/fixtures/control-room-timeline/v001-v002-v003-timeline.json'),
      'utf8',
    );

    expect(stringifyControlRoomTimeline(reversedTimeline)).toBe(stringifyControlRoomTimeline(timeline));
    expect(JSON.parse(fixtureRaw)).toEqual(JSON.parse(stringifyControlRoomTimeline(timeline)));
  });

  it('rejects malformed required records with actionable diagnostics', () => {
    const validation = validateControlRoomTimeline({
      schemaVersion: 1,
      sessionId: '',
      createdAt: FIXED_TIMESTAMP,
      updatedAt: FIXED_TIMESTAMP,
      runsRoot: 'runs',
      activeBaseVersion: 'latest',
      events: [
        {
          id: 'bad-event',
          type: 'reviewer_summary',
          timestamp: FIXED_TIMESTAMP,
          actor: 'reviewer',
          source: 'reviewer_ai',
          versionId: 'v1',
          summary: '',
          evidence: [{ kind: 'trace', relativePath: '../outside.json' }],
        },
      ],
    });

    expect(validation.ok).toBe(false);
    expect(validation.diagnostics).toEqual(
      expect.arrayContaining([
        { path: '$.sessionId', message: 'sessionId is required and must be a string.' },
        { path: '$.activeBaseVersion', message: 'activeBaseVersion must be a v001-style version id when set.' },
        { path: '$.events[0].summary', message: 'summary is required and must be a non-empty string.' },
        { path: '$.events[0].versionId', message: 'versionId must be a v001-style version id when set.' },
        { path: '$.events[0].evidence[0].relativePath', message: 'Evidence path must stay under runs/: ../outside.json' },
      ]),
    );
  });

  it('limits timeline files to the control-room timeline artifact boundary', async () => {
    await withTempRepoRoot(async (repoRoot) => {
      expect(buildControlRoomTimelineRelativePath('sample.json')).toBe(
        'runs/control-room/timeline/sample.json',
      );
      expect(() => buildControlRoomTimelineRelativePath('../sample.json')).toThrow(
        'Timeline file name must be a simple file name',
      );
      await writeEvidence(repoRoot, 'runs/v001/version_summary.json', stringifyDeterministicJson({}));

      const loaded = await loadControlRoomTimeline(repoRoot, 'runs/v001/version_summary.json');
      expect(loaded.ok).toBe(false);
      expect(loaded.diagnostics).toEqual([
        {
          path: '$.path',
          message: 'Timeline path must stay under runs/control-room/timeline/.',
        },
      ]);
    });
  });
});
