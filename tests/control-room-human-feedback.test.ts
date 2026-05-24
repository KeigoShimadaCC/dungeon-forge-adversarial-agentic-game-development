import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  addHumanCommentToTimeline,
  addHumanIdeaToTimeline,
  buildV001V002V003TimelineArtifact,
  loadAndApplyHumanFeedbackToTimeline,
  projectHumanFeedbackContext,
  saveControlRoomTimeline,
  stringifyControlRoomTimeline,
  validateHumanFeedbackText,
} from '../src/control-room/timeline/index.js';
import { runControlRoomWebShellCli } from '../src/control-room/web-shell/control-room-web-shell-cli.js';

const HUMAN_TIMESTAMP = '2026-05-24T05:09:36.000Z';

type HumanFeedbackMutationResult = ReturnType<
  typeof addHumanIdeaToTimeline
> | ReturnType<typeof addHumanCommentToTimeline>;

const expectMutationOk = (
  result: HumanFeedbackMutationResult,
): Extract<HumanFeedbackMutationResult, { ok: true }> => {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error('Expected human feedback mutation to pass.');
  }
  return result;
};

const withTempRepoRoot = async (fn: (repoRoot: string) => Promise<void>): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'df-control-room-human-feedback-'));
  try {
    await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
};

const writeTimeline = async (repoRoot: string): Promise<string> => {
  const timeline = buildV001V002V003TimelineArtifact();
  return saveControlRoomTimeline(repoRoot, 'v001-v002-v003.timeline.json', timeline);
};

const readTimelineRaw = async (repoRoot: string, relativePath: string): Promise<string> =>
  readFile(path.join(repoRoot, relativePath), 'utf8');

describe('PHASE-26B human idea and feedback capture', () => {
  it('adds an initial human idea as timeline state and prepared context', () => {
    const timeline = buildV001V002V003TimelineArtifact();
    const result = expectMutationOk(addHumanIdeaToTimeline(timeline, {
      text: '  Build a tiny haunted vault loop.\r\n',
      timestamp: HUMAN_TIMESTAMP,
    }));

    expect(result.timeline.initialGameIdea).toBe('Build a tiny haunted vault loop.');
    expect(result.timeline.updatedAt).toBe(HUMAN_TIMESTAMP);
    expect(result.timeline.events.at(-1)).toMatchObject({
      type: 'human_idea',
      source: 'human',
      actor: 'human',
      summary: 'Build a tiny haunted vault loop.',
    });
    expect(result.timeline.events.at(-1)).not.toHaveProperty('evidence');
    expect(projectHumanFeedbackContext(result.timeline).initialIdea).toMatchObject({
      type: 'initial_idea',
      source: 'human',
      actor: 'human',
      text: 'Build a tiny haunted vault loop.',
      selectedVersion: 'v001',
      targetVersion: undefined,
    });
  });

  it('adds a per-version human comment without reviewer trace evidence', () => {
    const timeline = buildV001V002V003TimelineArtifact();
    const result = expectMutationOk(addHumanCommentToTimeline(timeline, {
      text: 'The v003 review should consider whether exits are too hidden.',
      timestamp: HUMAN_TIMESTAMP,
      targetVersion: 'v003',
    }));

    const comment = result.timeline.events.find((event) => event.id === 'v003-009-human_comment');
    expect(comment).toMatchObject({
      type: 'human_comment',
      source: 'human',
      actor: 'human',
      versionId: 'v003',
      summary: 'The v003 review should consider whether exits are too hidden.',
    });
    expect(comment).not.toHaveProperty('evidence');
    expect(projectHumanFeedbackContext(result.timeline).comments.at(-1)).toMatchObject({
      type: 'version_comment',
      source: 'human',
      actor: 'human',
      text: 'The v003 review should consider whether exits are too hidden.',
      selectedVersion: 'v001',
      targetVersion: 'v003',
    });
  });

  it('rejects empty and oversized input without partial timeline writes', async () => {
    await withTempRepoRoot(async (repoRoot) => {
      const relativePath = await writeTimeline(repoRoot);
      const before = await readTimelineRaw(repoRoot, relativePath);

      expect(validateHumanFeedbackText(' \n\t ').ok).toBe(false);
      expect(validateHumanFeedbackText('x'.repeat(4001)).diagnostics).toEqual([
        {
          path: '$.text',
          message: 'Human feedback text must be 4000 characters or fewer.',
        },
      ]);

      const emptyResult = await loadAndApplyHumanFeedbackToTimeline(repoRoot, relativePath, {
        kind: 'comment',
        text: '   ',
        timestamp: HUMAN_TIMESTAMP,
        targetVersion: 'v002',
      });

      expect(emptyResult.ok).toBe(false);
      expect(emptyResult.diagnostics).toEqual([
        { path: '$.comment', message: 'Human feedback text must not be empty.' },
      ]);
      expect(await readTimelineRaw(repoRoot, relativePath)).toBe(before);
    });
  });

  it('persists human comments through the local control-room capture CLI only', async () => {
    await withTempRepoRoot(async (repoRoot) => {
      const relativePath = await writeTimeline(repoRoot);
      const priorCwd = process.cwd();
      const stdout: string[] = [];
      try {
        process.chdir(repoRoot);
        await runControlRoomWebShellCli([
          '--timeline',
          relativePath,
          '--capture-comment',
          'Please keep v002 as a branchable base.',
          '--target-version',
          'v002',
          '--timestamp',
          HUMAN_TIMESTAMP,
        ], {
          stdout: (value) => stdout.push(value),
        });
      } finally {
        process.chdir(priorCwd);
      }

      expect(JSON.parse(stdout.join(''))).toMatchObject({
        ok: true,
        savedPath: relativePath,
        eventCount: 9,
        updatedAt: HUMAN_TIMESTAMP,
      });
      const saved = JSON.parse(await readTimelineRaw(repoRoot, relativePath));
      expect(saved.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'human_comment',
            source: 'human',
            versionId: 'v002',
            summary: 'Please keep v002 as a branchable base.',
          }),
        ]),
      );
    });
  });

  it('keeps deterministic serialization with human feedback context fields', () => {
    const commentResult = expectMutationOk(addHumanCommentToTimeline(buildV001V002V003TimelineArtifact(), {
      text: 'Preserve this exact plain text.',
      timestamp: HUMAN_TIMESTAMP,
      targetVersion: 'v001',
    }));

    expect(stringifyControlRoomTimeline(commentResult.timeline)).toContain(
      '"summary": "Preserve this exact plain text."',
    );
    expect(projectHumanFeedbackContext(commentResult.timeline).comments.at(-1)).toMatchObject({
      text: 'Preserve this exact plain text.',
      targetVersion: 'v001',
    });
  });
});
