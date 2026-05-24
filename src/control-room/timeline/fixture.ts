import {
  buildTimelineEventId,
  createControlRoomTimeline,
} from './artifacts.js';
import type { ControlRoomTimelineArtifact, ControlRoomTimelineEvent } from './types.js';

export const V001_V002_V003_TIMELINE_SESSION_ID = 'control-room-v001-v002-v003';

export const V001_V002_V003_TIMELINE_TIMESTAMP = '2026-05-24T04:06:47.000Z';

export const buildV001V002V003TimelineEvents = (): ControlRoomTimelineEvent[] => [
  {
    id: buildTimelineEventId(6, 'prepared_next_step', 'v003'),
    type: 'prepared_next_step',
    timestamp: '2026-05-24T04:12:00.000Z',
    actor: 'orchestrator',
    source: 'system',
    versionId: 'v003',
    summary: 'Prepare the next bounded improvement from v003 evidence without executing it.',
    evidence: [
      {
        kind: 'acceptance',
        relativePath: 'runs/v003/acceptance.md',
        label: 'v003 acceptance notes',
      },
    ],
  },
  {
    id: buildTimelineEventId(1, 'human_idea'),
    type: 'human_idea',
    timestamp: V001_V002_V003_TIMELINE_TIMESTAMP,
    actor: 'human',
    source: 'human',
    summary: 'Make a tiny dungeon loop that can improve through trace-backed review.',
  },
  {
    id: buildTimelineEventId(3, 'reviewer_summary', 'v001'),
    type: 'reviewer_summary',
    timestamp: '2026-05-24T04:08:00.000Z',
    actor: 'reviewer',
    source: 'reviewer_ai',
    versionId: 'v001',
    summary: 'Reviewer flagged shallow item use and limited tactical choices.',
    evidence: [
      {
        kind: 'review',
        relativePath: 'runs/v001/reviews/seed_001_careful_player.json',
      },
      {
        kind: 'scorecard',
        relativePath: 'runs/v001/scorecards/seed_001_careful_player.json',
      },
    ],
  },
  {
    id: buildTimelineEventId(2, 'developer_summary', 'v001'),
    type: 'developer_summary',
    timestamp: '2026-05-24T04:07:00.000Z',
    actor: 'developer',
    source: 'developer_ai',
    versionId: 'v001',
    summary: 'Developer produced the baseline version evidence.',
    evidence: [
      {
        kind: 'trace',
        relativePath: 'runs/v001/traces/seed_001_careful_player.json',
      },
      {
        kind: 'version_summary',
        relativePath: 'runs/v001/version_summary.json',
      },
      {
        kind: 'developer_notes',
        relativePath: 'runs/v001/developer_notes.md',
      },
    ],
  },
  {
    id: buildTimelineEventId(4, 'human_comment', 'v002'),
    type: 'human_comment',
    timestamp: '2026-05-24T04:09:00.000Z',
    actor: 'human',
    source: 'human',
    versionId: 'v002',
    summary: 'Human comment: keep the Smoke Bomb clarity improvement.',
    evidence: [
      {
        kind: 'comparison',
        relativePath: 'runs/comparisons/v001_vs_v002.json',
      },
      {
        kind: 'changelog',
        relativePath: 'runs/v002/changelog.md',
      },
    ],
  },
  {
    id: buildTimelineEventId(5, 'version_selected_as_base', 'v002'),
    type: 'version_selected_as_base',
    timestamp: '2026-05-24T04:10:00.000Z',
    actor: 'human',
    source: 'human',
    versionId: 'v002',
    summary: 'Select v002 as the active base without deleting or rolling back later versions.',
    evidence: [
      {
        kind: 'comparison',
        relativePath: 'runs/comparisons/v002_vs_v003.json',
      },
    ],
  },
  {
    id: buildTimelineEventId(7, 'reviewer_summary', 'v003'),
    type: 'reviewer_summary',
    timestamp: '2026-05-24T04:11:00.000Z',
    actor: 'reviewer',
    source: 'reviewer_ai',
    versionId: 'v003',
    summary: 'Reviewer summary is linked to expected evidence, with absent optional evidence labeled.',
    evidence: [
      {
        kind: 'review',
        relativePath: 'runs/v003/reviews/missing_optional_review.json',
      },
      {
        kind: 'balance_summary',
        relativePath: 'runs/v003/balance_summary.json',
      },
    ],
  },
  {
    id: buildTimelineEventId(8, 'version_selected_as_base', 'v001'),
    type: 'version_selected_as_base',
    timestamp: '2026-05-24T04:13:00.000Z',
    actor: 'human',
    source: 'human',
    versionId: 'v001',
    summary: 'Select v001 as the next active base without deleting v002 or v003 historical evidence.',
    evidence: [
      {
        kind: 'version_summary',
        relativePath: 'runs/v001/version_summary.json',
        label: 'v001 selected-base summary',
      },
    ],
  },
];

export const buildV001V002V003TimelineArtifact = (): ControlRoomTimelineArtifact =>
  createControlRoomTimeline({
    sessionId: V001_V002_V003_TIMELINE_SESSION_ID,
    timestamp: V001_V002_V003_TIMELINE_TIMESTAMP,
    runsRoot: 'runs',
    initialGameIdea: 'Make a tiny dungeon loop that improves through review.',
    activeBaseVersion: 'v001',
    events: buildV001V002V003TimelineEvents(),
  });
