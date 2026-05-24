export const CONTROL_ROOM_TIMELINE_SCHEMA_VERSION = 1;

export const CONTROL_ROOM_TIMELINE_EVENT_TYPES = [
  'human_idea',
  'developer_summary',
  'reviewer_summary',
  'human_comment',
  'version_selected_as_base',
  'prepared_next_step',
] as const;

export type ControlRoomTimelineEventType = (typeof CONTROL_ROOM_TIMELINE_EVENT_TYPES)[number];

export const CONTROL_ROOM_TIMELINE_SOURCES = [
  'human',
  'developer_ai',
  'reviewer_ai',
  'system',
] as const;

export type ControlRoomTimelineSource = (typeof CONTROL_ROOM_TIMELINE_SOURCES)[number];

export const CONTROL_ROOM_TIMELINE_EVIDENCE_KINDS = [
  'trace',
  'review',
  'scorecard',
  'changelog',
  'developer_notes',
  'comparison',
  'acceptance',
  'version_summary',
  'balance_summary',
  'other',
] as const;

export type ControlRoomTimelineEvidenceKind =
  (typeof CONTROL_ROOM_TIMELINE_EVIDENCE_KINDS)[number];

export interface ControlRoomTimelineEvidenceRef {
  kind: ControlRoomTimelineEvidenceKind;
  relativePath: string;
  label?: string;
  present?: boolean;
  missingReason?: string;
}

export interface ControlRoomTimelineEvent {
  id: string;
  type: ControlRoomTimelineEventType;
  timestamp: string;
  actor: string;
  source: ControlRoomTimelineSource;
  versionId?: string;
  summary: string;
  evidence?: ControlRoomTimelineEvidenceRef[];
  missingEvidence?: string[];
}

export interface ControlRoomTimelineArtifact {
  schemaVersion: typeof CONTROL_ROOM_TIMELINE_SCHEMA_VERSION;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  runsRoot: string;
  initialGameIdea?: string;
  activeBaseVersion?: string;
  events: ControlRoomTimelineEvent[];
}

export interface ControlRoomTimelineProjectionEvent {
  id: string;
  type: ControlRoomTimelineEventType;
  timestamp: string;
  actor: string;
  source: ControlRoomTimelineSource;
  versionId?: string;
  summary: string;
  evidence: ControlRoomTimelineEvidenceRef[];
  missingEvidence: string[];
  evidenceCount: number;
  missingEvidenceCount: number;
}

export interface ControlRoomTimelineProjection {
  sessionId: string;
  activeBaseVersion?: string;
  initialGameIdea?: string;
  events: ControlRoomTimelineProjectionEvent[];
}

export interface ControlRoomTimelineDiagnostic {
  path: string;
  message: string;
}

export interface ControlRoomTimelineValidationResult {
  ok: boolean;
  diagnostics: ControlRoomTimelineDiagnostic[];
}

export interface LoadControlRoomTimelineResult {
  ok: boolean;
  timeline?: ControlRoomTimelineArtifact;
  diagnostics: ControlRoomTimelineDiagnostic[];
}

export interface ControlRoomHumanFeedbackContextEntry {
  type: 'initial_idea' | 'version_comment';
  timestamp: string;
  actor: string;
  source: 'human';
  text: string;
  selectedVersion?: string;
  targetVersion?: string;
}

export interface ControlRoomHumanFeedbackContext {
  initialIdea?: ControlRoomHumanFeedbackContextEntry;
  comments: ControlRoomHumanFeedbackContextEntry[];
}
