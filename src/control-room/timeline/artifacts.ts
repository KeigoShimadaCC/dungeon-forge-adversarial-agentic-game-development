import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from '../../harness/json.js';
import {
  CONTROL_ROOM_TIMELINE_EVENT_TYPES,
  CONTROL_ROOM_TIMELINE_EVIDENCE_KINDS,
  CONTROL_ROOM_TIMELINE_SCHEMA_VERSION,
  CONTROL_ROOM_TIMELINE_SOURCES,
  type ControlRoomTimelineArtifact,
  type ControlRoomTimelineDiagnostic,
  type ControlRoomTimelineEvent,
  type ControlRoomTimelineEvidenceRef,
  type ControlRoomHumanFeedbackContext,
  type ControlRoomHumanFeedbackContextEntry,
  type ControlRoomTimelineProjection,
  type ControlRoomTimelineProjectionEvent,
  type ControlRoomTimelineValidationResult,
  type LoadControlRoomTimelineResult,
} from './types.js';

export const CONTROL_ROOM_TIMELINE_ROOT = path.join('runs', 'control-room', 'timeline');
export const CONTROL_ROOM_HUMAN_FEEDBACK_MAX_LENGTH = 4000;

const VERSION_ID_PATTERN = /^v\d{3}$/;

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    const info = await stat(filePath);
    return info.isFile();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

export const buildTimelineEventId = (
  sequence: number,
  type: ControlRoomTimelineEvent['type'],
  versionId?: string,
): string => {
  const prefix = versionId ? `${versionId}-` : '';
  return `${prefix}${String(sequence).padStart(3, '0')}-${type}`;
};

export const normalizeHumanFeedbackText = (value: string): string =>
  value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

export const validateHumanFeedbackText = (
  value: string,
  pathLabel = '$.text',
): { ok: true; text: string; diagnostics: [] } | {
  ok: false;
  diagnostics: ControlRoomTimelineDiagnostic[];
} => {
  const text = normalizeHumanFeedbackText(value);
  if (text.length === 0) {
    return {
      ok: false,
      diagnostics: [{ path: pathLabel, message: 'Human feedback text must not be empty.' }],
    };
  }
  if (text.length > CONTROL_ROOM_HUMAN_FEEDBACK_MAX_LENGTH) {
    return {
      ok: false,
      diagnostics: [{
        path: pathLabel,
        message: `Human feedback text must be ${CONTROL_ROOM_HUMAN_FEEDBACK_MAX_LENGTH} characters or fewer.`,
      }],
    };
  }
  return { ok: true, text, diagnostics: [] };
};

const nextTimelineEventId = (
  events: readonly ControlRoomTimelineEvent[],
  type: ControlRoomTimelineEvent['type'],
  versionId?: string,
): string => {
  const existingIds = new Set(events.map((event) => event.id));
  let sequence = events.length + 1;
  let id = buildTimelineEventId(sequence, type, versionId);
  while (existingIds.has(id)) {
    sequence += 1;
    id = buildTimelineEventId(sequence, type, versionId);
  }
  return id;
};

const validateHumanFeedbackVersion = (
  versionId: string | undefined,
  pathLabel: string,
): ControlRoomTimelineDiagnostic[] => {
  if (versionId === undefined) {
    return [];
  }
  if (!VERSION_ID_PATTERN.test(versionId)) {
    return [{ path: pathLabel, message: 'target version must be a v001-style version id when set.' }];
  }
  return [];
};

export const addHumanIdeaToTimeline = (
  timeline: ControlRoomTimelineArtifact,
  input: {
    text: string;
    timestamp: string;
    actor?: string;
  },
): { ok: true; timeline: ControlRoomTimelineArtifact; diagnostics: [] } | {
  ok: false;
  diagnostics: ControlRoomTimelineDiagnostic[];
} => {
  const textValidation = validateHumanFeedbackText(input.text, '$.idea');
  if (!textValidation.ok) {
    return textValidation;
  }
  if (!isString(input.timestamp)) {
    return {
      ok: false,
      diagnostics: [{ path: '$.timestamp', message: 'timestamp is required and must be a string.' }],
    };
  }

  const event: ControlRoomTimelineEvent = {
    id: nextTimelineEventId(timeline.events, 'human_idea'),
    type: 'human_idea',
    timestamp: input.timestamp,
    actor: input.actor ?? 'human',
    source: 'human',
    summary: textValidation.text,
  };
  return {
    ok: true,
    timeline: {
      ...timeline,
      initialGameIdea: textValidation.text,
      updatedAt: input.timestamp,
      events: sortTimelineEvents([...timeline.events, event]),
    },
    diagnostics: [],
  };
};

export const addHumanCommentToTimeline = (
  timeline: ControlRoomTimelineArtifact,
  input: {
    text: string;
    timestamp: string;
    targetVersion?: string;
    actor?: string;
  },
): { ok: true; timeline: ControlRoomTimelineArtifact; diagnostics: [] } | {
  ok: false;
  diagnostics: ControlRoomTimelineDiagnostic[];
} => {
  const textValidation = validateHumanFeedbackText(input.text, '$.comment');
  const versionDiagnostics = validateHumanFeedbackVersion(input.targetVersion, '$.targetVersion');
  const diagnostics = [...(textValidation.ok ? [] : textValidation.diagnostics), ...versionDiagnostics];
  if (!isString(input.timestamp)) {
    diagnostics.push({ path: '$.timestamp', message: 'timestamp is required and must be a string.' });
  }
  if (diagnostics.length > 0 || !textValidation.ok) {
    return { ok: false, diagnostics };
  }

  const event: ControlRoomTimelineEvent = {
    id: nextTimelineEventId(timeline.events, 'human_comment', input.targetVersion),
    type: 'human_comment',
    timestamp: input.timestamp,
    actor: input.actor ?? 'human',
    source: 'human',
    versionId: input.targetVersion,
    summary: textValidation.text,
  };
  return {
    ok: true,
    timeline: {
      ...timeline,
      updatedAt: input.timestamp,
      events: sortTimelineEvents([...timeline.events, event]),
    },
    diagnostics: [],
  };
};

export const normalizeEvidenceRelativePath = (relativePath: string): string => {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized.startsWith('runs/')) {
    throw new Error(`Evidence path must stay under runs/: ${relativePath}`);
  }
  if (normalized.split('/').includes('..')) {
    throw new Error(`Evidence path must not contain .. segments: ${relativePath}`);
  }
  return normalized;
};

export const resolveEvidenceAbsolutePath = (
  repoRoot: string,
  relativePath: string,
): { absolutePath: string; normalizedRelative: string } => {
  const normalizedRelative = normalizeEvidenceRelativePath(relativePath);
  const absolutePath = path.resolve(repoRoot, normalizedRelative);
  const repoRootResolved = path.resolve(repoRoot);
  if (!absolutePath.startsWith(repoRootResolved + path.sep) && absolutePath !== repoRootResolved) {
    throw new Error(`Evidence path escapes repo root: ${relativePath}`);
  }
  return { absolutePath, normalizedRelative };
};

export const buildControlRoomTimelineRelativePath = (fileName: string): string => {
  if (fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    throw new Error(`Timeline file name must be a simple file name: ${fileName}`);
  }
  if (!fileName.endsWith('.json')) {
    throw new Error(`Timeline file name must end with .json: ${fileName}`);
  }
  return path.join(CONTROL_ROOM_TIMELINE_ROOT, fileName).replace(/\\/g, '/');
};

export const sortTimelineEvents = (
  events: readonly ControlRoomTimelineEvent[],
): ControlRoomTimelineEvent[] =>
  [...events].sort((left, right) => {
    const timestampOrder = left.timestamp.localeCompare(right.timestamp);
    if (timestampOrder !== 0) {
      return timestampOrder;
    }
    return left.id.localeCompare(right.id);
  });

export const createControlRoomTimeline = (input: {
  sessionId: string;
  timestamp: string;
  runsRoot: string;
  initialGameIdea?: string;
  activeBaseVersion?: string;
  events: readonly ControlRoomTimelineEvent[];
}): ControlRoomTimelineArtifact => ({
  schemaVersion: CONTROL_ROOM_TIMELINE_SCHEMA_VERSION,
  sessionId: input.sessionId,
  createdAt: input.timestamp,
  updatedAt: input.timestamp,
  runsRoot: input.runsRoot,
  initialGameIdea: input.initialGameIdea,
  activeBaseVersion: input.activeBaseVersion,
  events: sortTimelineEvents(input.events),
});

export const stringifyControlRoomTimeline = (
  timeline: ControlRoomTimelineArtifact,
): string => stringifyDeterministicJson({
  ...timeline,
  events: sortTimelineEvents(timeline.events),
});

const validateEvidenceRef = (
  value: unknown,
  pathLabel: string,
  diagnostics: ControlRoomTimelineDiagnostic[],
): ControlRoomTimelineEvidenceRef | null => {
  if (!isPlainRecord(value)) {
    diagnostics.push({ path: pathLabel, message: 'Evidence reference must be an object.' });
    return null;
  }
  if (!isString(value.kind) || !CONTROL_ROOM_TIMELINE_EVIDENCE_KINDS.includes(value.kind as never)) {
    diagnostics.push({
      path: `${pathLabel}.kind`,
      message: `Evidence kind must be one of: ${CONTROL_ROOM_TIMELINE_EVIDENCE_KINDS.join(', ')}.`,
    });
  }
  if (!isString(value.relativePath)) {
    diagnostics.push({
      path: `${pathLabel}.relativePath`,
      message: 'Evidence relativePath is required and must be a non-empty string.',
    });
  } else {
    try {
      normalizeEvidenceRelativePath(value.relativePath);
    } catch (error: unknown) {
      diagnostics.push({
        path: `${pathLabel}.relativePath`,
        message: error instanceof Error ? error.message : 'Evidence relativePath is invalid.',
      });
    }
  }
  if ('present' in value && typeof value.present !== 'boolean') {
    diagnostics.push({ path: `${pathLabel}.present`, message: 'present must be boolean when set.' });
  }
  if ('missingReason' in value && typeof value.missingReason !== 'string') {
    diagnostics.push({
      path: `${pathLabel}.missingReason`,
      message: 'missingReason must be a string when set.',
    });
  }
  return value as unknown as ControlRoomTimelineEvidenceRef;
};

export const validateControlRoomTimeline = (
  value: unknown,
): ControlRoomTimelineValidationResult => {
  const diagnostics: ControlRoomTimelineDiagnostic[] = [];
  if (!isPlainRecord(value)) {
    return {
      ok: false,
      diagnostics: [{ path: '$', message: 'Timeline artifact must be a JSON object.' }],
    };
  }

  if (value.schemaVersion !== CONTROL_ROOM_TIMELINE_SCHEMA_VERSION) {
    diagnostics.push({
      path: '$.schemaVersion',
      message: `schemaVersion must be ${CONTROL_ROOM_TIMELINE_SCHEMA_VERSION}.`,
    });
  }
  for (const key of ['sessionId', 'createdAt', 'updatedAt', 'runsRoot'] as const) {
    if (!isString(value[key])) {
      diagnostics.push({ path: `$.${key}`, message: `${key} is required and must be a string.` });
    }
  }
  if ('initialGameIdea' in value && typeof value.initialGameIdea !== 'string') {
    diagnostics.push({ path: '$.initialGameIdea', message: 'initialGameIdea must be a string.' });
  }
  if ('activeBaseVersion' in value) {
    if (!isString(value.activeBaseVersion) || !VERSION_ID_PATTERN.test(value.activeBaseVersion)) {
      diagnostics.push({
        path: '$.activeBaseVersion',
        message: 'activeBaseVersion must be a v001-style version id when set.',
      });
    }
  }
  if (!Array.isArray(value.events)) {
    diagnostics.push({ path: '$.events', message: 'events is required and must be an array.' });
    return { ok: diagnostics.length === 0, diagnostics };
  }

  value.events.forEach((event, index) => {
    const eventPath = `$.events[${index}]`;
    if (!isPlainRecord(event)) {
      diagnostics.push({ path: eventPath, message: 'Timeline event must be an object.' });
      return;
    }
    for (const key of ['id', 'timestamp', 'actor', 'summary'] as const) {
      if (!isString(event[key])) {
        diagnostics.push({
          path: `${eventPath}.${key}`,
          message: `${key} is required and must be a non-empty string.`,
        });
      }
    }
    if (!isString(event.type) || !CONTROL_ROOM_TIMELINE_EVENT_TYPES.includes(event.type as never)) {
      diagnostics.push({
        path: `${eventPath}.type`,
        message: `type must be one of: ${CONTROL_ROOM_TIMELINE_EVENT_TYPES.join(', ')}.`,
      });
    }
    if (!isString(event.source) || !CONTROL_ROOM_TIMELINE_SOURCES.includes(event.source as never)) {
      diagnostics.push({
        path: `${eventPath}.source`,
        message: `source must be one of: ${CONTROL_ROOM_TIMELINE_SOURCES.join(', ')}.`,
      });
    }
    if ('versionId' in event) {
      if (!isString(event.versionId) || !VERSION_ID_PATTERN.test(event.versionId)) {
        diagnostics.push({
          path: `${eventPath}.versionId`,
          message: 'versionId must be a v001-style version id when set.',
        });
      }
    }
    if ('evidence' in event) {
      if (!Array.isArray(event.evidence)) {
        diagnostics.push({ path: `${eventPath}.evidence`, message: 'evidence must be an array.' });
      } else {
        event.evidence.forEach((ref, refIndex) => {
          validateEvidenceRef(ref, `${eventPath}.evidence[${refIndex}]`, diagnostics);
        });
      }
    }
    if ('missingEvidence' in event) {
      if (!Array.isArray(event.missingEvidence)) {
        diagnostics.push({
          path: `${eventPath}.missingEvidence`,
          message: 'missingEvidence must be an array.',
        });
      } else {
        event.missingEvidence.forEach((entry, missingIndex) => {
          if (!isString(entry)) {
            diagnostics.push({
              path: `${eventPath}.missingEvidence[${missingIndex}]`,
              message: 'missing evidence notes must be non-empty strings.',
            });
          }
        });
      }
    }
  });

  return { ok: diagnostics.length === 0, diagnostics };
};

export const labelMissingTimelineEvidence = async (
  repoRoot: string,
  timeline: ControlRoomTimelineArtifact,
): Promise<ControlRoomTimelineArtifact> => {
  const events = await Promise.all(
    timeline.events.map(async (event) => {
      const missingEvidence = new Set(event.missingEvidence ?? []);
      const evidence = await Promise.all(
        (event.evidence ?? []).map(async (ref) => {
          const { absolutePath, normalizedRelative } = resolveEvidenceAbsolutePath(
            repoRoot,
            ref.relativePath,
          );
          const present = await fileExists(absolutePath);
          if (!present) {
            missingEvidence.add(`${ref.kind}: ${normalizedRelative}`);
          }
          return {
            ...ref,
            relativePath: normalizedRelative,
            present,
            missingReason: present ? undefined : `Missing on disk: ${normalizedRelative}`,
          };
        }),
      );
      return {
        ...event,
        evidence,
        missingEvidence: [...missingEvidence].sort((left, right) => left.localeCompare(right)),
      };
    }),
  );

  return { ...timeline, events: sortTimelineEvents(events) };
};

export const saveControlRoomTimeline = async (
  repoRoot: string,
  fileName: string,
  timeline: ControlRoomTimelineArtifact,
): Promise<string> => {
  const relativePath = buildControlRoomTimelineRelativePath(fileName);
  const absolutePath = path.join(repoRoot, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, stringifyControlRoomTimeline(timeline), 'utf8');
  return relativePath;
};

export const saveControlRoomTimelineAtPath = async (
  repoRoot: string,
  relativePath: string,
  timeline: ControlRoomTimelineArtifact,
): Promise<string> => {
  const { absolutePath, normalizedRelative } = resolveEvidenceAbsolutePath(repoRoot, relativePath);
  if (!normalizedRelative.startsWith(`${CONTROL_ROOM_TIMELINE_ROOT.replace(/\\/g, '/')}/`)) {
    throw new Error(`Timeline path must stay under ${CONTROL_ROOM_TIMELINE_ROOT.replace(/\\/g, '/')}/.`);
  }
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, stringifyControlRoomTimeline(timeline), 'utf8');
  return normalizedRelative;
};

export const loadAndApplyHumanFeedbackToTimeline = async (
  repoRoot: string,
  relativePath: string,
  input: {
    kind: 'idea' | 'comment';
    text: string;
    timestamp: string;
    targetVersion?: string;
    actor?: string;
  },
): Promise<LoadControlRoomTimelineResult & { savedPath?: string }> => {
  const loaded = await loadControlRoomTimeline(repoRoot, relativePath);
  if (!loaded.ok || !loaded.timeline) {
    return loaded;
  }
  const updated = input.kind === 'idea'
    ? addHumanIdeaToTimeline(loaded.timeline, input)
    : addHumanCommentToTimeline(loaded.timeline, input);
  if (!updated.ok) {
    return { ok: false, diagnostics: updated.diagnostics };
  }
  const savedPath = await saveControlRoomTimelineAtPath(repoRoot, relativePath, updated.timeline);
  return { ok: true, timeline: updated.timeline, diagnostics: [], savedPath };
};

export const loadControlRoomTimeline = async (
  repoRoot: string,
  relativePath: string,
): Promise<LoadControlRoomTimelineResult> => {
  let normalizedRelative: string;
  let absolutePath: string;
  try {
    const resolved = resolveEvidenceAbsolutePath(repoRoot, relativePath);
    normalizedRelative = resolved.normalizedRelative;
    absolutePath = resolved.absolutePath;
  } catch (error: unknown) {
    return {
      ok: false,
      diagnostics: [{
        path: '$.path',
        message: error instanceof Error ? error.message : 'Timeline path is invalid.',
      }],
    };
  }
  if (!normalizedRelative.startsWith(`${CONTROL_ROOM_TIMELINE_ROOT.replace(/\\/g, '/')}/`)) {
    return {
      ok: false,
      diagnostics: [{
        path: '$.path',
        message: `Timeline path must stay under ${CONTROL_ROOM_TIMELINE_ROOT.replace(/\\/g, '/')}/.`,
      }],
    };
  }
  if (!(await fileExists(absolutePath))) {
    return {
      ok: false,
      diagnostics: [{ path: '$.path', message: `Timeline artifact not found: ${normalizedRelative}` }],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(absolutePath, 'utf8'));
  } catch (error: unknown) {
    return {
      ok: false,
      diagnostics: [{
        path: '$',
        message: error instanceof Error ? `Timeline JSON parse failed: ${error.message}` : 'Timeline JSON parse failed.',
      }],
    };
  }

  const validation = validateControlRoomTimeline(parsed);
  if (!validation.ok) {
    return { ok: false, diagnostics: validation.diagnostics };
  }
  const timeline = await labelMissingTimelineEvidence(repoRoot, parsed as ControlRoomTimelineArtifact);
  return { ok: true, timeline, diagnostics: [] };
};

const buildProjectionEvents = (
  events: readonly ControlRoomTimelineEvent[],
): ControlRoomTimelineProjectionEvent[] =>
  sortTimelineEvents(events).map((event) => {
    const evidence = event.evidence ?? [];
    const missingEvidence = event.missingEvidence ?? [];
    return {
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      actor: event.actor,
      source: event.source,
      versionId: event.versionId,
      summary: event.summary,
      evidence,
      missingEvidence,
      evidenceCount: evidence.length,
      missingEvidenceCount: missingEvidence.length,
    };
  });

export const listControlRoomTimelineEvents = (
  timeline: ControlRoomTimelineArtifact,
): ControlRoomTimelineProjectionEvent[] => buildProjectionEvents(timeline.events);

export const projectControlRoomTimeline = (
  timeline: ControlRoomTimelineArtifact,
): ControlRoomTimelineProjection => ({
  sessionId: timeline.sessionId,
  activeBaseVersion: timeline.activeBaseVersion,
  initialGameIdea: timeline.initialGameIdea,
  events: listControlRoomTimelineEvents(timeline),
});

export const projectHumanFeedbackContext = (
  timeline: ControlRoomTimelineArtifact,
): ControlRoomHumanFeedbackContext => {
  const humanEvents = sortTimelineEvents(timeline.events).filter(
    (event) => event.source === 'human' && (
      event.type === 'human_idea' || event.type === 'human_comment'
    ),
  );
  const toEntry = (
    event: ControlRoomTimelineEvent,
  ): ControlRoomHumanFeedbackContextEntry => ({
    type: event.type === 'human_idea' ? 'initial_idea' : 'version_comment',
    timestamp: event.timestamp,
    actor: event.actor,
    source: 'human',
    text: event.summary,
    selectedVersion: timeline.activeBaseVersion,
    targetVersion: event.versionId,
  });
  const humanIdeas = humanEvents.filter((event) => event.type === 'human_idea');
  return {
    initialIdea: humanIdeas.length > 0
      ? toEntry(humanIdeas[humanIdeas.length - 1])
      : undefined,
    comments: humanEvents
      .filter((event) => event.type === 'human_comment')
      .map(toEntry),
  };
};
