import { describe, expect, it } from 'vitest';

import { buildControlRoomRoleCatalog } from '../src/control-room/roles/index.js';
import {
  buildV001V002V003TimelineArtifact,
  labelMissingTimelineEvidence,
} from '../src/control-room/timeline/index.js';
import {
  buildControlRoomWebShellViewModel,
  controlRoomArtifactHref,
  renderControlRoomWebShellHtml,
} from '../src/control-room/web-shell/index.js';

const fixedGeneratedAt = '2026-05-24T05:00:00.000Z';

describe('PHASE-26A control-room web shell', () => {
  it('renders timeline events in chronological order grouped by version', async () => {
    const timeline = await labelMissingTimelineEvidence(
      process.cwd(),
      buildV001V002V003TimelineArtifact(),
    );
    const viewModel = buildControlRoomWebShellViewModel(timeline, {
      roleCatalog: buildControlRoomRoleCatalog(),
      generatedAt: fixedGeneratedAt,
    });

    expect(viewModel.session).toMatchObject({
      sessionId: 'control-room-v001-v002-v003',
      activeBaseVersion: 'v002',
      runsRoot: 'runs',
      eventCount: 7,
    });
    expect(viewModel.unversionedEvents.map((event) => event.id)).toEqual(['001-human_idea']);
    expect(viewModel.versions.map((version) => version.versionId)).toEqual(['v001', 'v002', 'v003']);
    expect(viewModel.versions.flatMap((version) => version.events.map((event) => event.id))).toEqual([
      'v001-002-developer_summary',
      'v001-003-reviewer_summary',
      'v002-004-human_comment',
      'v002-005-version_selected_as_base',
      'v003-007-reviewer_summary',
      'v003-006-prepared_next_step',
    ]);
    expect(viewModel.versions.find((version) => version.versionId === 'v003')).toMatchObject({
      evidenceCount: 3,
      missingEvidenceCount: 1,
    });
  });

  it('renders actor labels, evidence hrefs, and missing evidence without command controls', async () => {
    const timeline = await labelMissingTimelineEvidence(
      process.cwd(),
      buildV001V002V003TimelineArtifact(),
    );
    const viewModel = buildControlRoomWebShellViewModel(timeline, {
      roleCatalog: buildControlRoomRoleCatalog(),
      generatedAt: fixedGeneratedAt,
      linkBase: '..',
    });
    const html = renderControlRoomWebShellHtml(viewModel);

    expect(html).toContain('Dungeon Forge Control Room');
    expect(html).toContain('Version timeline');
    expect(html).toContain('Game Developer');
    expect(html).toContain('Game Reviewer');
    expect(html).toContain('Human');
    expect(html).toContain('Narrator');
    expect(html).toContain('Active base: <strong>v002</strong>');
    expect(html).toContain('Human Input');
    expect(html).toContain('Initial game idea');
    expect(html).toContain('Target version');
    expect(html).toContain('human feedback');
    expect(html).toContain('href="../runs/v001/traces/seed_001_careful_player.json"');
    expect(html).toContain('review: runs/v003/reviews/missing_optional_review.json');
    expect(html).toContain('missing');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('Launch Cursor');
    expect(html).not.toContain('pnpm run');
  });

  it('renders role, persona, prompt, and model panels without secret-like values', async () => {
    const envRecord = globalThis.process.env;
    const priorModel = envRecord.DUNGEON_FORGE_LLM_MODEL;
    envRecord.DUNGEON_FORGE_LLM_MODEL = 'secret-model-from-env';
    envRecord.OPENAI_API_KEY = 'secret-api-key-from-env';

    try {
      const timeline = await labelMissingTimelineEvidence(
        process.cwd(),
        buildV001V002V003TimelineArtifact(),
      );
      const html = renderControlRoomWebShellHtml(
        buildControlRoomWebShellViewModel(timeline, {
          roleCatalog: buildControlRoomRoleCatalog(),
          generatedAt: fixedGeneratedAt,
        }),
      );

      expect(html).toContain('Roles, Personas, And Models');
      expect(html).toContain('Careful Player');
      expect(html).toContain('LLM reviewer runtime prompt');
      expect(html).toContain('providerCallEnabled=false');
      expect(html).not.toContain('secret-model-from-env');
      expect(html).not.toContain('secret-api-key-from-env');
      expect(html).not.toContain('OPENAI_API_KEY');
    } finally {
      if (priorModel === undefined) {
        delete envRecord.DUNGEON_FORGE_LLM_MODEL;
      } else {
        envRecord.DUNGEON_FORGE_LLM_MODEL = priorModel;
      }
      delete envRecord.OPENAI_API_KEY;
    }
  });

  it('renders an empty timeline state', () => {
    const timeline = {
      ...buildV001V002V003TimelineArtifact(),
      events: [],
    };
    const html = renderControlRoomWebShellHtml(
      buildControlRoomWebShellViewModel(timeline, {
        roleCatalog: buildControlRoomRoleCatalog(),
        generatedAt: fixedGeneratedAt,
      }),
    );

    expect(html).toContain('No timeline events found.');
    expect(html).toContain('Events: <strong>0</strong>');
  });

  it('blocks unsafe artifact hrefs', () => {
    expect(controlRoomArtifactHref('runs/v001/version_summary.json')).toBe(
      'runs/v001/version_summary.json',
    );
    expect(controlRoomArtifactHref('../outside.json')).toBe('#blocked-artifact-link');
    expect(controlRoomArtifactHref('/tmp/outside.json')).toBe('#blocked-artifact-link');
    expect(controlRoomArtifactHref('javascript:alert(1)')).toBe('#blocked-artifact-link');
    expect(controlRoomArtifactHref('runs/v001/version_summary.json', '..')).toBe(
      '../runs/v001/version_summary.json',
    );
    expect(controlRoomArtifactHref('runs/v001/version_summary.json', 'javascript:alert(1)')).toBe(
      'runs/v001/version_summary.json',
    );
  });
});
