import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildControlRoomNarration,
  buildControlRoomNarrationRenderModel,
  renderControlRoomNarrationHtml,
  stringifyControlRoomNarration,
} from '../src/control-room/narration/index.js';
import { runControlRoomNarrationCli } from '../src/control-room/narration/control-room-narration-cli.js';
import {
  buildV001V002V003TimelineArtifact,
  labelMissingTimelineEvidence,
  saveControlRoomTimeline,
} from '../src/control-room/timeline/index.js';

const GENERATED_AT = '2026-05-24T06:00:00.000Z';

const withTempRepoRoot = async (fn: (repoRoot: string) => Promise<void>): Promise<void> => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'df-control-room-narration-'));
  try {
    await fn(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
};

const writeEvidence = async (repoRoot: string, relativePath: string, content: string): Promise<void> => {
  const absolutePath = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, 'utf8');
};

const writeNarrationEvidence = async (repoRoot: string): Promise<void> => {
  await writeEvidence(repoRoot, 'runs/v001/traces/seed_001_careful_player.json', '{}\n');
  await writeEvidence(repoRoot, 'runs/v001/version_summary.json', JSON.stringify({
    acceptance_status: 'accepted',
    runs: [{ result: 'LOSS' }, { result: 'ABORTED' }],
    summary: 'Baseline run evidence showed shallow tactical options.',
  }));
  await writeEvidence(repoRoot, 'runs/v001/developer_notes.md', [
    '# Developer Notes',
    '## Implementation notes',
    '- Added the first bounded dungeon loop.',
    '## Evidence',
    '- Trace and version summary were generated locally.',
  ].join('\n'));
  await writeEvidence(repoRoot, 'runs/v001/reviews/seed_001_careful_player.json', JSON.stringify({
    top_issues: [{ observation: 'Item use is shallow.' }],
    suggested_next_changes: ['Add a clearer tactical item decision.'],
  }));
  await writeEvidence(repoRoot, 'runs/v001/scorecards/seed_001_careful_player.json', JSON.stringify({
    result: 'LOSS',
    turns: 18,
    diagnostics: { primary_category: 'tactical_depth' },
  }));
  await writeEvidence(repoRoot, 'runs/comparisons/v001_vs_v002.json', JSON.stringify({
    objective_metric_deltas: { items_used: { base: 0, target: 1, delta: 1 } },
    reviewer_score_deltas: { tactical_depth: { base: 2, target: 3, delta: 1 } },
  }));
  await writeEvidence(repoRoot, 'runs/v002/changelog.md', [
    '# Changelog',
    '## Implemented changes',
    '- Clarified Smoke Bomb feedback.',
  ].join('\n'));
  await writeEvidence(repoRoot, 'runs/comparisons/v002_vs_v003.json', JSON.stringify({
    objective_metric_deltas: { invalid_actions: { base: 1, target: 0, delta: -1 } },
  }));
  await writeEvidence(repoRoot, 'runs/v003/acceptance.md', [
    '# Acceptance',
    '## Acceptance',
    '- v003 is ready for a bounded follow-up.',
  ].join('\n'));
  await writeEvidence(repoRoot, 'runs/v003/reviews/missing_optional_review.json', JSON.stringify({
    top_issues: [{ observation: 'Exit affordance still needs clearer evidence.' }],
  }));
  await writeEvidence(repoRoot, 'runs/v003/balance_summary.json', JSON.stringify({
    problem_run_count: 2,
  }));
};

describe('PHASE-27B control-room narration', () => {
  it('generates evidence-backed narration without LLM credentials', async () => {
    await withTempRepoRoot(async (repoRoot) => {
      await writeNarrationEvidence(repoRoot);
      const timeline = await labelMissingTimelineEvidence(repoRoot, buildV001V002V003TimelineArtifact());
      process.env.DUNGEON_FORGE_LLM_API_KEY = 'not-used-by-narration-test';
      const narration = await buildControlRoomNarration(timeline, {
        repoRoot,
        generatedAt: GENERATED_AT,
        timelinePath: 'runs/control-room/timeline/v001-v002-v003.timeline.json',
      });
      delete process.env.DUNGEON_FORGE_LLM_API_KEY;

      expect(narration.versions).toHaveLength(3);
      expect(narration.versions.map((version) => version.versionId)).toEqual(['v001', 'v002', 'v003']);
      expect(narration.versions[0].messages.map((message) => message.role)).toEqual(
        expect.arrayContaining(['developer_summary', 'reviewer_summary', 'narrator_summary']),
      );
      expect(narration.versions[1].messages.map((message) => message.role)).toEqual(
        expect.arrayContaining(['human_comment', 'narrator_summary']),
      );
      expect(narration.versions[0].messages.at(-1)?.text).toContain('What changed: Added the first bounded dungeon loop.');
      expect(narration.versions[0].messages.at(-1)?.text).toContain('What the reviewer found: Item use is shallow.');
      expect(narration.versions[0].messages.at(-1)?.sourceArtifacts.map((source) => source.relativePath)).toEqual(
        expect.arrayContaining([
          'runs/v001/developer_notes.md',
          'runs/v001/reviews/seed_001_careful_player.json',
        ]),
      );
    });
  });

  it('labels missing evidence without fabricating claims', async () => {
    const timeline = await labelMissingTimelineEvidence(
      process.cwd(),
      buildV001V002V003TimelineArtifact(),
    );
    const narration = await buildControlRoomNarration(timeline, {
      repoRoot: process.cwd(),
      generatedAt: GENERATED_AT,
    });

    expect(narration.versions.some((version) => version.evidenceStatus === 'partial')).toBe(true);
    expect(narration.versions.flatMap((version) => version.missingEvidence)).toContain(
      'review: runs/v003/reviews/missing_optional_review.json: Missing on disk: runs/v003/reviews/missing_optional_review.json',
    );
    expect(stringifyControlRoomNarration(narration)).toContain('Missing on disk');
  });

  it('renders an inert chat-style narration panel with distinguishable roles', async () => {
    const narration = await buildControlRoomNarration(
      await labelMissingTimelineEvidence(process.cwd(), buildV001V002V003TimelineArtifact()),
      { repoRoot: process.cwd(), generatedAt: GENERATED_AT },
    );
    const html = renderControlRoomNarrationHtml(buildControlRoomNarrationRenderModel(narration));

    expect(html).toContain('Control Room Narration');
    expect(html).toContain('developer_summary');
    expect(html).toContain('reviewer_summary');
    expect(html).toContain('narrator_summary');
    expect(html).toContain('human_comment');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('Launch Cursor');
    expect(html).not.toContain('agent --print');
  });

  it('serializes deterministic narration output matching committed fixtures', async () => {
    const narration = await buildControlRoomNarration(
      await labelMissingTimelineEvidence(process.cwd(), buildV001V002V003TimelineArtifact()),
      {
        repoRoot: process.cwd(),
        generatedAt: GENERATED_AT,
        timelinePath: 'runs/control-room/timeline/v001-v002-v003.timeline.json',
      },
    );
    const fixture = await readFile(
      path.join(process.cwd(), 'tests/fixtures/control-room-narration/v001-v002-v003.narration.json'),
      'utf8',
    );

    expect(JSON.parse(fixture)).toEqual(JSON.parse(stringifyControlRoomNarration(narration)));
  });

  it('writes narration artifacts through the local CLI without mutating the timeline', async () => {
    await withTempRepoRoot(async (repoRoot) => {
      await writeNarrationEvidence(repoRoot);
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
        await runControlRoomNarrationCli([
          '--timeline',
          timelinePath,
          '--out',
          'runs/control-room/narration/v001-v002-v003.narration.json',
          '--html',
          'runs/control-room/narration/v001-v002-v003.narration.html',
          '--generated-at',
          GENERATED_AT,
        ], {
          stdout: (value) => stdout.push(value),
        });
      } finally {
        process.chdir(priorCwd);
      }

      expect(stdout.join('')).toContain('Control-room narration generated for 3 version(s).');
      expect(await readFile(path.join(repoRoot, timelinePath), 'utf8')).toBe(before);
      expect(JSON.parse(await readFile(
        path.join(repoRoot, 'runs/control-room/narration/v001-v002-v003.narration.json'),
        'utf8',
      ))).toMatchObject({ schemaVersion: 1, sessionId: 'control-room-v001-v002-v003' });
      expect(await readFile(
        path.join(repoRoot, 'runs/control-room/narration/v001-v002-v003.narration.html'),
        'utf8',
      )).toContain('Credential-free fallback');
    });
  });
});
