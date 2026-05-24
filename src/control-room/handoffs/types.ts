import type {
  ControlRoomTimelineEvent,
  ControlRoomTimelineEvidenceRef,
} from '../timeline/index.js';

export const CONTROL_ROOM_HANDOFF_SCHEMA_VERSION = 1;

export const CONTROL_ROOM_HANDOFF_STATUSES = [
  'ready',
  'blocked',
  'missing_evidence',
  'needs_human_decision',
] as const;

export type ControlRoomHandoffStatus = (typeof CONTROL_ROOM_HANDOFF_STATUSES)[number];

export interface ControlRoomPreparedHandoffEvidence {
  kind: ControlRoomTimelineEvidenceRef['kind'];
  relativePath: string;
  label: string;
  sourceEventId: string;
  sourceEventType: ControlRoomTimelineEvent['type'];
  present: boolean;
  missingReason?: string;
}

export interface ControlRoomPreparedHandoffComment {
  actor: string;
  timestamp: string;
  targetVersion?: string;
  text: string;
}

export interface ControlRoomPreparedHandoffCommand {
  label: string;
  command: string;
  reason: string;
}

export interface ControlRoomPreparedHandoff {
  schemaVersion: typeof CONTROL_ROOM_HANDOFF_SCHEMA_VERSION;
  preparedAt: string;
  sessionId: string;
  status: ControlRoomHandoffStatus;
  selectedBaseVersion?: string;
  latestKnownVersion?: string;
  historicalVersionsAfterSelectedBase: string[];
  humanIdea?: string;
  humanComments: ControlRoomPreparedHandoffComment[];
  reviewerSummary?: string;
  developerContext?: string;
  versionSummary?: string;
  evidence: ControlRoomPreparedHandoffEvidence[];
  blockers: string[];
  suggestedCommands: ControlRoomPreparedHandoffCommand[];
  developerTaskText: string;
  humanSummary: string;
  timelineEvent: ControlRoomTimelineEvent;
}

export interface BuildControlRoomPreparedHandoffOptions {
  preparedAt?: string;
  handoffArtifactPath?: string;
  panelArtifactPath?: string;
}

export interface ControlRoomHandoffPanelEvidenceLink extends ControlRoomPreparedHandoffEvidence {
  href: string;
}

export interface ControlRoomHandoffPanelModel {
  schemaVersion: 1;
  readOnly: true;
  inert: true;
  handoff: Omit<ControlRoomPreparedHandoff, 'evidence'> & {
    evidence: ControlRoomHandoffPanelEvidenceLink[];
  };
  executionBoundary: {
    owner: 'human_orchestrator';
    browserExecutesCommands: false;
    providerCallsEnabled: false;
    commitsOrPrsEnabled: false;
  };
}
