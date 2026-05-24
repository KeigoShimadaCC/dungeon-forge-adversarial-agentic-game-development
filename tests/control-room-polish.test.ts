import { describe, expect, it } from 'vitest';

import {
  buildControlRoomPreparedHandoff,
  stringifyControlRoomPreparedHandoff,
} from '../src/control-room/handoffs/index.js';
import {
  buildV001V002V003TimelineArtifact,
  labelMissingTimelineEvidence,
} from '../src/control-room/timeline/index.js';
import {
  buildControlRoomWebShellViewModel,
  renderControlRoomWebShellHtml,
} from '../src/control-room/web-shell/index.js';

describe('PHASE-28B control-room polish and scalability', () => {
  it('builds a one-page view model with quick summaries and prepared handoff state', async () => {
    const timeline = await labelMissingTimelineEvidence(
      process.cwd(),
      buildV001V002V003TimelineArtifact(),
    );
    const viewModel = buildControlRoomWebShellViewModel(timeline, {
      generatedAt: '2026-05-24T06:40:00.000Z',
    });

    expect(viewModel.preparedHandoff).toMatchObject({
      status: 'ready',
      selectedBaseVersion: 'v001',
      latestKnownVersion: 'v003',
      reviewerSelection: {
        personaId: 'careful_player',
        providerCallEnabled: false,
      },
    });
    expect(viewModel.versions.map((version) => ({
      id: version.versionId,
      active: version.isActiveBase,
      historical: version.isHistoricalAfterActiveBase,
      hasSummary: version.quickSummary.length > 0,
    }))).toEqual([
      { id: 'v001', active: true, historical: false, hasSummary: true },
      { id: 'v002', active: false, historical: true, hasSummary: true },
      { id: 'v003', active: false, historical: true, hasSummary: true },
    ]);
  });

  it('keeps reviewer persona and model choices as inert prepared handoff metadata', async () => {
    const handoff = buildControlRoomPreparedHandoff(
      await labelMissingTimelineEvidence(process.cwd(), buildV001V002V003TimelineArtifact()),
      {
        reviewerPersonaId: 'bug_hunter',
        reviewerModelId: 'configured_reviewer_model',
      },
    );

    expect(handoff.reviewerSelection).toMatchObject({
      personaId: 'bug_hunter',
      personaLabel: 'Bug Hunter',
      modelId: 'configured_reviewer_model',
      modelLabel: 'gpt-4o-mini',
      advisoryOnly: true,
      providerCallEnabled: false,
    });
    expect(stringifyControlRoomPreparedHandoff(handoff)).toContain(
      '"providerCallEnabled": false',
    );
    expect(handoff.developerTaskText).toContain('Reviewer persona metadata: Bug Hunter');
    expect(() =>
      buildControlRoomPreparedHandoff(buildV001V002V003TimelineArtifact(), {
        reviewerPersonaId: 'unknown_persona',
      }),
    ).toThrow('Unknown reviewer persona id: unknown_persona');
    expect(() =>
      buildControlRoomPreparedHandoff(buildV001V002V003TimelineArtifact(), {
        reviewerModelId: 'unknown_model',
      }),
    ).toThrow('Unknown reviewer model id: unknown_model');
  });

  it('renders safe prompt inspection and metadata controls without exposing env secrets', async () => {
    const priorApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'must-not-render';
    try {
      const html = renderControlRoomWebShellHtml(
        buildControlRoomWebShellViewModel(
          await labelMissingTimelineEvidence(process.cwd(), buildV001V002V003TimelineArtifact()),
        ),
      );

      expect(html).toContain('Version Summary Cards');
      expect(html).toContain('Prepared Handoff');
      expect(html).toContain('Reviewer persona metadata');
      expect(html).toContain('Reviewer model metadata');
      expect(html).toContain('Prompt Inspection');
      expect(html).toContain('LLM reviewer runtime prompt');
      expect(html).toContain('Runtime prompts, evidence JSON, environment variables, and credentials are not assembled here.');
      expect(html).toContain('Provider calls are disabled here.');
      expect(html).not.toContain('must-not-render');
      expect(html).not.toContain('OPENAI_API_KEY');
      expect(html).not.toContain('<script');
      expect(html).not.toContain('<button');
    } finally {
      if (priorApiKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = priorApiKey;
      }
    }
  });
});
