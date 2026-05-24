import type {
  ControlRoomTimelineEventType,
  ControlRoomTimelineEvidenceKind,
} from '../timeline/index.js';

export const CONTROL_ROOM_NARRATION_SCHEMA_VERSION = 1;

export const CONTROL_ROOM_NARRATION_MESSAGE_ROLES = [
  'developer_summary',
  'reviewer_summary',
  'narrator_summary',
  'human_comment',
] as const;

export type ControlRoomNarrationMessageRole =
  (typeof CONTROL_ROOM_NARRATION_MESSAGE_ROLES)[number];

export type ControlRoomNarrationEvidenceStatus =
  | 'present'
  | 'missing'
  | 'unavailable'
  | 'unparsed';

export interface ControlRoomNarrationSourceArtifact {
  kind: ControlRoomTimelineEvidenceKind | 'timeline_event';
  relativePath: string;
  label: string;
  status: ControlRoomNarrationEvidenceStatus;
  sourceEventId?: string;
  sourceEventType?: ControlRoomTimelineEventType;
  missingReason?: string;
  extractedClaims: string[];
}

export interface ControlRoomNarrationMessage {
  id: string;
  role: ControlRoomNarrationMessageRole;
  label: string;
  versionId?: string;
  timestamp: string;
  actor: string;
  text: string;
  sourceArtifacts: ControlRoomNarrationSourceArtifact[];
  unavailable: string[];
}

export interface ControlRoomVersionNarration {
  versionId: string;
  evidenceStatus: 'available' | 'partial' | 'missing';
  messages: ControlRoomNarrationMessage[];
  missingEvidence: string[];
  likelyNextFocus: string;
}

export interface ControlRoomNarrationArtifact {
  schemaVersion: typeof CONTROL_ROOM_NARRATION_SCHEMA_VERSION;
  sessionId: string;
  generatedAt: string;
  activeBaseVersion?: string;
  timelinePath?: string;
  summary: string;
  versions: ControlRoomVersionNarration[];
  sessionMessages: ControlRoomNarrationMessage[];
}

export interface BuildControlRoomNarrationOptions {
  repoRoot: string;
  generatedAt?: string;
  timelinePath?: string;
}

export interface ControlRoomNarrationRenderEvidenceLink
  extends ControlRoomNarrationSourceArtifact {
  href: string;
}

export interface ControlRoomNarrationRenderMessage
  extends Omit<ControlRoomNarrationMessage, 'sourceArtifacts'> {
  sourceArtifacts: ControlRoomNarrationRenderEvidenceLink[];
}

export interface ControlRoomNarrationRenderVersion
  extends Omit<ControlRoomVersionNarration, 'messages'> {
  messages: ControlRoomNarrationRenderMessage[];
}

export interface ControlRoomNarrationRenderModel {
  schemaVersion: 1;
  readOnly: true;
  inert: true;
  generatedAt: string;
  sessionId: string;
  activeBaseVersion?: string;
  summary: string;
  versions: ControlRoomNarrationRenderVersion[];
  sessionMessages: ControlRoomNarrationRenderMessage[];
  boundary: {
    deterministicFallback: true;
    providerCallsRequired: false;
    acceptanceDecisionAuthority: false;
    preservesArtifactLinks: true;
  };
}
