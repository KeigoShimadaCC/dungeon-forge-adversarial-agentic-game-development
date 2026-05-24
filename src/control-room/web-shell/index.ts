import { buildControlRoomRoleCatalog } from '../roles/index.js';
import type {
  ControlRoomRoleCatalog,
  ControlRoomRoleCatalogEntry,
} from '../roles/index.js';
import {
  projectControlRoomTimeline,
  projectHumanFeedbackContext,
  type ControlRoomTimelineArtifact,
  type ControlRoomTimelineEvidenceRef,
  type ControlRoomHumanFeedbackContext,
  type ControlRoomTimelineProjectionEvent,
  type ControlRoomTimelineSource,
} from '../timeline/index.js';

export interface ControlRoomWebShellEvidenceLink {
  kind: ControlRoomTimelineEvidenceRef['kind'];
  label: string;
  relativePath: string;
  href: string;
  present: boolean;
  missingReason?: string;
}

export interface ControlRoomWebShellEvent {
  id: string;
  type: ControlRoomTimelineProjectionEvent['type'];
  timestamp: string;
  actor: string;
  actorLabel: string;
  source: ControlRoomTimelineSource;
  roleId: ControlRoomRoleCatalogEntry['id'];
  isHumanFeedback: boolean;
  versionId?: string;
  summary: string;
  evidence: ControlRoomWebShellEvidenceLink[];
  missingEvidence: string[];
}

export interface ControlRoomWebShellVersionSection {
  versionId: string;
  events: ControlRoomWebShellEvent[];
  eventCount: number;
  evidenceCount: number;
  missingEvidenceCount: number;
  summary: string;
  isActiveBase: boolean;
  isLatestKnown: boolean;
  isHistoricalAfterActiveBase: boolean;
}

export interface ControlRoomWebShellViewModel {
  schemaVersion: 1;
  readOnly: true;
  generatedAt: string;
  session: {
    sessionId: string;
    runsRoot: string;
    activeBaseVersion?: string;
    latestKnownVersion?: string;
    historicalVersionsAfterActiveBase: string[];
    initialGameIdea?: string;
    eventCount: number;
  };
  humanFeedback: ControlRoomHumanFeedbackContext;
  unversionedEvents: ControlRoomWebShellEvent[];
  versions: ControlRoomWebShellVersionSection[];
  roles: ControlRoomRoleCatalogEntry[];
  diagnostics: string[];
}

export interface BuildControlRoomWebShellViewModelOptions {
  roleCatalog?: ControlRoomRoleCatalog;
  generatedAt?: string;
  linkBase?: string;
}

const sourceRoleId = (
  source: ControlRoomTimelineSource,
): ControlRoomRoleCatalogEntry['id'] => {
  if (source === 'developer_ai') {
    return 'game_developer';
  }
  if (source === 'reviewer_ai') {
    return 'game_reviewer';
  }
  if (source === 'human') {
    return 'human';
  }
  return 'narrator';
};

const roleFallbackLabel = (roleId: ControlRoomRoleCatalogEntry['id']): string => {
  if (roleId === 'game_developer') {
    return 'Game Developer';
  }
  if (roleId === 'game_reviewer') {
    return 'Game Reviewer';
  }
  if (roleId === 'human') {
    return 'Human';
  }
  return 'Narrator';
};

const normalizeHref = (value: string): string => value.replace(/\\/g, '/');

export const isSafeControlRoomHrefPath = (value: string): boolean => {
  const normalized = normalizeHref(value);
  if (
    normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalized)
  ) {
    return false;
  }
  return !normalized.split('/').some((segment) => segment === '..');
};

export const controlRoomArtifactHref = (relativePath: string, linkBase = ''): string => {
  if (!isSafeControlRoomHrefPath(relativePath)) {
    return '#blocked-artifact-link';
  }
  const normalizedPath = normalizeHref(relativePath);
  const normalizedBase = normalizeHref(linkBase).replace(/\/$/, '');
  if (
    normalizedBase
    && (
      normalizedBase.startsWith('/')
      || normalizedBase.startsWith('//')
      || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalizedBase)
    )
  ) {
    return normalizedPath;
  }
  if (!normalizedBase || normalizedBase === '.') {
    return normalizedPath;
  }
  return `${normalizedBase}/${normalizedPath}`;
};

const evidenceLabel = (evidence: ControlRoomTimelineEvidenceRef): string =>
  evidence.label ?? `${evidence.kind}: ${evidence.relativePath}`;

const buildEvent = (
  event: ControlRoomTimelineProjectionEvent,
  roleById: Map<ControlRoomRoleCatalogEntry['id'], ControlRoomRoleCatalogEntry>,
  linkBase: string,
): ControlRoomWebShellEvent => {
  const roleId = sourceRoleId(event.source);
  const role = roleById.get(roleId);
  return {
    id: event.id,
    type: event.type,
    timestamp: event.timestamp,
    actor: event.actor,
    actorLabel: role?.displayName ?? roleFallbackLabel(roleId),
    source: event.source,
    roleId,
    isHumanFeedback: event.source === 'human' && (
      event.type === 'human_idea' || event.type === 'human_comment'
    ),
    versionId: event.versionId,
    summary: event.summary,
    evidence: event.evidence.map((evidence) => ({
      kind: evidence.kind,
      label: evidenceLabel(evidence),
      relativePath: evidence.relativePath,
      href: controlRoomArtifactHref(evidence.relativePath, linkBase),
      present: evidence.present ?? true,
      missingReason: evidence.missingReason,
    })),
    missingEvidence: [...event.missingEvidence],
  };
};

const summarizeVersion = (
  versionId: string,
  events: readonly ControlRoomWebShellEvent[],
): string => {
  const summary = events.find((event) => event.type === 'developer_summary')
    ?? events.find((event) => event.type === 'reviewer_summary')
    ?? events[0];
  return summary?.summary ?? `${versionId} has no timeline summary.`;
};

export const buildControlRoomWebShellViewModel = (
  timeline: ControlRoomTimelineArtifact,
  options: BuildControlRoomWebShellViewModelOptions = {},
): ControlRoomWebShellViewModel => {
  const roleCatalog = options.roleCatalog ?? buildControlRoomRoleCatalog();
  const roles = roleCatalog.roles.map((role) => ({
    ...role,
    personas: role.personas.map((persona) => ({ ...persona, emphasis: [...persona.emphasis] })),
    prompts: role.prompts.map((prompt) => ({
      ...prompt,
      sourceReferences: prompt.sourceReferences.map((source) => ({ ...source })),
      diagnostics: [...prompt.diagnostics],
    })),
    modelChoices: role.modelChoices.map((choice) => ({
      ...choice,
      configurableEnvVars: [...choice.configurableEnvVars],
      notes: [...choice.notes],
    })),
  }));
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const projection = projectControlRoomTimeline(timeline);
  const humanFeedback = projectHumanFeedbackContext(timeline);
  const events = projection.events.map((event) =>
    buildEvent(event, roleById, options.linkBase ?? ''),
  );
  const versionIds = [...new Set(events.flatMap((event) => event.versionId ? [event.versionId] : []))];
  const versions = versionIds.map((versionId) => {
    const versionEvents = events.filter((event) => event.versionId === versionId);
    return {
      versionId,
      events: versionEvents,
      eventCount: versionEvents.length,
      evidenceCount: versionEvents.reduce((count, event) => count + event.evidence.length, 0),
      missingEvidenceCount: versionEvents.reduce(
        (count, event) => count + event.missingEvidence.length,
        0,
      ),
      summary: summarizeVersion(versionId, versionEvents),
      isActiveBase: versionId === projection.activeBaseVersion,
      isLatestKnown: versionId === projection.latestKnownVersion,
      isHistoricalAfterActiveBase: projection.historicalVersionsAfterActiveBase.includes(versionId),
    };
  });

  return {
    schemaVersion: 1,
    readOnly: true,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    session: {
      sessionId: timeline.sessionId,
      runsRoot: timeline.runsRoot,
      activeBaseVersion: timeline.activeBaseVersion,
      latestKnownVersion: projection.latestKnownVersion,
      historicalVersionsAfterActiveBase: projection.historicalVersionsAfterActiveBase,
      initialGameIdea: timeline.initialGameIdea,
      eventCount: events.length,
    },
    humanFeedback,
    unversionedEvents: events.filter((event) => !event.versionId),
    versions,
    roles,
    diagnostics: events.length === 0 ? ['No timeline events found.'] : [],
  };
};

export { renderControlRoomWebShellHtml } from './render-html.js';
