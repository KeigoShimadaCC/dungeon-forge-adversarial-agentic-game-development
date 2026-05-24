import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from '../../harness/json.js';
import {
  buildControlRoomRoleCatalog,
  type ControlRoomModelChoice,
  type ControlRoomPersonaChoice,
  type ControlRoomRoleCatalog,
} from '../roles/index.js';
import {
  buildTimelineEventId,
  getHistoricalVersionsAfterActiveBase,
  getLatestKnownControlRoomVersion,
  projectHumanFeedbackContext,
  resolveEvidenceAbsolutePath,
  sortTimelineEvents,
  type ControlRoomTimelineArtifact,
  type ControlRoomTimelineEvent,
  type ControlRoomTimelineEvidenceRef,
} from '../timeline/index.js';
import type {
  BuildControlRoomPreparedHandoffOptions,
  ControlRoomHandoffPanelModel,
  ControlRoomPreparedHandoff,
  ControlRoomPreparedHandoffCommand,
  ControlRoomPreparedHandoffEvidence,
  ControlRoomPreparedHandoffReviewerSelection,
  ControlRoomPreparedHandoffComment,
  ControlRoomHandoffStatus,
} from './types.js';
import { CONTROL_ROOM_HANDOFF_SCHEMA_VERSION } from './types.js';

export * from './types.js';
export { renderControlRoomHandoffPanelHtml } from './render-html.js';

export const CONTROL_ROOM_HANDOFF_ROOT = path.join('runs', 'control-room', 'handoffs');

const DEFAULT_PREPARED_AT = '2026-05-24T05:32:22.000Z';

const isRelevantEvidenceEvent = (event: ControlRoomTimelineEvent): boolean =>
  event.type === 'developer_summary'
  || event.type === 'reviewer_summary'
  || event.type === 'human_comment'
  || event.type === 'version_selected_as_base'
  || event.type === 'prepared_next_step';

const normalizeHandoffArtifactPath = (relativePath: string): string => {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized.startsWith(`${CONTROL_ROOM_HANDOFF_ROOT.replace(/\\/g, '/')}/`)) {
    throw new Error(`Handoff artifact path must stay under ${CONTROL_ROOM_HANDOFF_ROOT.replace(/\\/g, '/')}/.`);
  }
  if (normalized.split('/').includes('..')) {
    throw new Error(`Handoff artifact path must not contain .. segments: ${relativePath}`);
  }
  return normalized;
};

const evidenceLabel = (evidence: ControlRoomTimelineEvidenceRef): string =>
  evidence.label ?? `${evidence.kind}: ${evidence.relativePath}`;

const buildEvidence = (
  events: readonly ControlRoomTimelineEvent[],
): ControlRoomPreparedHandoffEvidence[] =>
  events
    .filter(isRelevantEvidenceEvent)
    .flatMap((event) =>
      (event.evidence ?? []).map((evidence) => ({
        kind: evidence.kind,
        relativePath: evidence.relativePath,
        label: evidenceLabel(evidence),
        sourceEventId: event.id,
        sourceEventType: event.type,
        present: evidence.present ?? true,
        missingReason: evidence.missingReason,
      })),
    )
    .sort((left, right) =>
      `${left.relativePath}:${left.sourceEventId}`.localeCompare(
        `${right.relativePath}:${right.sourceEventId}`,
      ),
    );

const isSelectedBaseRequiredEvidenceEvent = (
  event: ControlRoomTimelineEvent,
  selectedBaseVersion: string | undefined,
): boolean =>
  selectedBaseVersion !== undefined
  && event.versionId === selectedBaseVersion
  && (
    event.type === 'developer_summary'
    || event.type === 'reviewer_summary'
    || event.type === 'version_selected_as_base'
  );

const buildSelectedBaseEvidenceBlockers = (
  events: readonly ControlRoomTimelineEvent[],
  selectedBaseVersion: string | undefined,
): string[] =>
  events
    .filter((event) => isSelectedBaseRequiredEvidenceEvent(event, selectedBaseVersion))
    .flatMap((event) => event.evidence ?? [])
    .filter((ref) => !ref.present)
    .map((ref) => `Missing evidence: ${ref.kind}: ${ref.relativePath}`);

const latestEvent = (
  events: readonly ControlRoomTimelineEvent[],
  type: ControlRoomTimelineEvent['type'],
  versionId?: string,
): ControlRoomTimelineEvent | undefined => {
  const matching = sortTimelineEvents(events).filter((event) =>
    event.type === type && (versionId === undefined || event.versionId === versionId),
  );
  return matching[matching.length - 1];
};

const buildHumanComments = (
  timeline: ControlRoomTimelineArtifact,
): ControlRoomPreparedHandoffComment[] =>
  projectHumanFeedbackContext(timeline).comments.map((comment) => ({
    actor: comment.actor,
    timestamp: comment.timestamp,
    targetVersion: comment.targetVersion,
    text: comment.text,
  }));

const buildSuggestedCommands = (
  selectedBaseVersion: string | undefined,
): ControlRoomPreparedHandoffCommand[] => {
  const base = selectedBaseVersion ?? '<select-base-version>';
  return [
    {
      label: 'Generate developer handoff',
      command: `pnpm run developer-task -- --target-version ${base} --runs-root .`,
      reason: 'Build a developer-facing task from existing local evidence.',
    },
    {
      label: 'Run bounded version evidence',
      command: `pnpm run run-version -- --version ${base} --runs-root . --on-existing archive`,
      reason: 'Regenerate deterministic local playthrough evidence for the selected base when the orchestrator chooses to proceed.',
    },
    {
      label: 'Compare local versions',
      command: 'pnpm run compare-versions -- --left v001 --right v003 --runs-root .',
      reason: 'Refresh local comparison evidence before deciding the next implementation task.',
    },
  ];
};

const reviewerRoleFromCatalog = (catalog: ControlRoomRoleCatalog) => {
  const reviewerRole = catalog.roles.find((role) => role.id === 'game_reviewer');
  if (!reviewerRole) {
    throw new Error('Control-room role catalog is missing game_reviewer.');
  }
  return reviewerRole;
};

const selectReviewerPersona = (
  personas: readonly ControlRoomPersonaChoice[],
  requestedPersonaId: string | undefined,
): ControlRoomPersonaChoice => {
  const personaId = requestedPersonaId ?? personas.find((persona) => persona.selectable)?.id;
  const persona = personas.find((candidate) => candidate.id === personaId && candidate.selectable);
  if (!persona) {
    throw new Error(`Unknown reviewer persona id: ${personaId ?? 'none'}`);
  }
  return persona;
};

const selectReviewerModel = (
  modelChoices: readonly ControlRoomModelChoice[],
  requestedModelId: string | undefined,
): ControlRoomModelChoice => {
  const modelId = requestedModelId ?? modelChoices.find((choice) => choice.default)?.id;
  const model = modelChoices.find((candidate) => candidate.id === modelId);
  if (!model) {
    throw new Error(`Unknown reviewer model id: ${modelId ?? 'none'}`);
  }
  return model;
};

const buildReviewerSelection = (
  options: BuildControlRoomPreparedHandoffOptions,
): ControlRoomPreparedHandoffReviewerSelection => {
  const reviewerRole = reviewerRoleFromCatalog(options.roleCatalog ?? buildControlRoomRoleCatalog());
  const persona = selectReviewerPersona(reviewerRole.personas, options.reviewerPersonaId);
  const model = selectReviewerModel(reviewerRole.modelChoices, options.reviewerModelId);
  return {
    personaId: persona.id,
    personaLabel: persona.displayName,
    modelId: model.id,
    modelLabel: model.modelLabel,
    providerKind: model.providerKind,
    advisoryOnly: true,
    providerCallEnabled: false,
  };
};

const statusFor = (
  selectedBaseVersion: string | undefined,
  blockers: readonly string[],
): ControlRoomHandoffStatus => {
  if (!selectedBaseVersion) {
    return 'needs_human_decision';
  }
  if (blockers.some((blocker) => blocker.startsWith('Missing evidence:'))) {
    return 'missing_evidence';
  }
  if (blockers.length > 0) {
    return 'blocked';
  }
  return 'ready';
};

const buildDeveloperTaskText = (input: {
  selectedBaseVersion?: string;
  latestKnownVersion?: string;
  historicalVersionsAfterSelectedBase: readonly string[];
  humanIdea?: string;
  humanComments: readonly ControlRoomPreparedHandoffComment[];
  reviewerSelection: ControlRoomPreparedHandoffReviewerSelection;
  reviewerSummary?: string;
  developerContext?: string;
  evidence: readonly ControlRoomPreparedHandoffEvidence[];
  blockers: readonly string[];
}): string => {
  const lines = [
    'Prepared next iteration handoff',
    `Selected base version: ${input.selectedBaseVersion ?? 'needs human decision'}`,
    `Latest known version: ${input.latestKnownVersion ?? 'none recorded'}`,
    `Historical versions after selected base: ${
      input.historicalVersionsAfterSelectedBase.length > 0
        ? input.historicalVersionsAfterSelectedBase.join(', ')
        : 'none'
    }`,
    `Human idea: ${input.humanIdea ?? 'none recorded'}`,
    `Developer context: ${input.developerContext ?? 'none recorded'}`,
    `Reviewer summary: ${input.reviewerSummary ?? 'none recorded'}`,
    `Reviewer persona metadata: ${input.reviewerSelection.personaLabel} (${input.reviewerSelection.personaId})`,
    `Reviewer model metadata: ${input.reviewerSelection.modelLabel} (${input.reviewerSelection.modelId})`,
    `Human comments: ${input.humanComments.length}`,
    ...input.humanComments.map((comment) =>
      `- ${comment.targetVersion ?? 'session'} ${comment.timestamp}: ${comment.text}`,
    ),
    `Evidence paths: ${input.evidence.length}`,
    ...input.evidence.map((evidence) =>
      `- ${evidence.present ? 'present' : 'missing'} ${evidence.kind} ${evidence.relativePath}`,
    ),
  ];
  if (input.blockers.length > 0) {
    lines.push('Blockers:', ...input.blockers.map((blocker) => `- ${blocker}`));
  }
  return lines.join('\n');
};

export const buildPreparedHandoffTimelineEvent = (input: {
  timeline: ControlRoomTimelineArtifact;
  handoff: Omit<ControlRoomPreparedHandoff, 'timelineEvent'>;
  handoffArtifactPath?: string;
  panelArtifactPath?: string;
}): ControlRoomTimelineEvent => {
  const evidence: ControlRoomTimelineEvidenceRef[] = [];
  if (input.handoffArtifactPath) {
    evidence.push({
      kind: 'other',
      relativePath: normalizeHandoffArtifactPath(input.handoffArtifactPath),
      label: 'prepared handoff artifact',
      present: true,
    });
  }
  if (input.panelArtifactPath) {
    evidence.push({
      kind: 'other',
      relativePath: normalizeHandoffArtifactPath(input.panelArtifactPath),
      label: 'prepared handoff panel',
      present: true,
    });
  }
  for (const ref of input.handoff.evidence.slice(0, 6)) {
    evidence.push({
      kind: ref.kind,
      relativePath: ref.relativePath,
      label: ref.label,
      present: ref.present,
      missingReason: ref.missingReason,
    });
  }

  return {
    id: buildTimelineEventId(
      input.timeline.events.length + 1,
      'prepared_next_step',
      input.handoff.selectedBaseVersion,
    ),
    type: 'prepared_next_step',
    timestamp: input.handoff.preparedAt,
    actor: 'orchestrator',
    source: 'system',
    versionId: input.handoff.selectedBaseVersion,
    summary: input.handoff.humanSummary,
    evidence,
    missingEvidence: input.handoff.blockers.filter((blocker) =>
      blocker.startsWith('Missing evidence:'),
    ),
  };
};

export const buildControlRoomPreparedHandoff = (
  timeline: ControlRoomTimelineArtifact,
  options: BuildControlRoomPreparedHandoffOptions = {},
): ControlRoomPreparedHandoff => {
  const selectedBaseVersion = timeline.activeBaseVersion;
  const latestKnownVersion = getLatestKnownControlRoomVersion(timeline);
  const historicalVersionsAfterSelectedBase = getHistoricalVersionsAfterActiveBase(timeline);
  const sortedEvents = sortTimelineEvents(timeline.events);
  const developerEvent = selectedBaseVersion
    ? latestEvent(sortedEvents, 'developer_summary', selectedBaseVersion)
    : latestEvent(sortedEvents, 'developer_summary');
  const reviewerEvent = selectedBaseVersion
    ? latestEvent(sortedEvents, 'reviewer_summary', selectedBaseVersion)
    : latestEvent(sortedEvents, 'reviewer_summary');
  const versionEvent = selectedBaseVersion
    ? latestEvent(sortedEvents, 'version_selected_as_base', selectedBaseVersion)
    : undefined;
  const evidence = buildEvidence(sortedEvents);
  const reviewerSelection = buildReviewerSelection(options);
  const humanIdea = projectHumanFeedbackContext(timeline).initialIdea?.text
    ?? timeline.initialGameIdea;
  const humanComments = buildHumanComments(timeline);
  const blockers = [
    ...(!selectedBaseVersion ? ['No selected base version is recorded.'] : []),
    ...(!developerEvent ? [`No developer summary is available for selected base ${selectedBaseVersion ?? 'none'}.`] : []),
    ...(!reviewerEvent ? [`No reviewer summary is available for selected base ${selectedBaseVersion ?? 'none'}.`] : []),
    ...buildSelectedBaseEvidenceBlockers(sortedEvents, selectedBaseVersion),
  ].sort((left, right) => left.localeCompare(right));
  const status = statusFor(selectedBaseVersion, blockers);
  const suggestedCommands = buildSuggestedCommands(selectedBaseVersion);
  const handoffBase = {
    schemaVersion: CONTROL_ROOM_HANDOFF_SCHEMA_VERSION,
    preparedAt: options.preparedAt ?? DEFAULT_PREPARED_AT,
    sessionId: timeline.sessionId,
    status,
    selectedBaseVersion,
    latestKnownVersion,
    historicalVersionsAfterSelectedBase,
    reviewerSelection,
    humanIdea,
    humanComments,
    reviewerSummary: reviewerEvent?.summary,
    developerContext: developerEvent?.summary,
    versionSummary: versionEvent?.summary,
    evidence,
    blockers,
    suggestedCommands,
    developerTaskText: '',
    humanSummary: '',
  } satisfies Omit<ControlRoomPreparedHandoff, 'developerTaskText' | 'humanSummary' | 'timelineEvent'> & {
    developerTaskText: string;
    humanSummary: string;
  };
  const developerTaskText = buildDeveloperTaskText(handoffBase);
  const humanSummary = status === 'ready'
    ? `Next iteration is ready from selected base ${selectedBaseVersion}; later versions (${historicalVersionsAfterSelectedBase.join(', ') || 'none'}) remain historical evidence.`
    : `Next iteration is ${status.replaceAll('_', ' ')}; resolve blockers before executing any suggested command.`;
  const withoutEvent = {
    ...handoffBase,
    developerTaskText,
    humanSummary,
  };
  const timelineEvent = buildPreparedHandoffTimelineEvent({
    timeline,
    handoff: withoutEvent,
    handoffArtifactPath: options.handoffArtifactPath,
    panelArtifactPath: options.panelArtifactPath,
  });

  return {
    ...withoutEvent,
    timelineEvent,
  };
};

export const stringifyControlRoomPreparedHandoff = (
  handoff: ControlRoomPreparedHandoff,
): string => stringifyDeterministicJson(handoff);

const safeHref = (relativePath: string, linkBase = ''): string => {
  try {
    resolveEvidenceAbsolutePath(process.cwd(), relativePath);
  } catch {
    return '#blocked-artifact-link';
  }
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const normalizedBase = linkBase.replace(/\\/g, '/').replace(/\/$/, '');
  if (
    normalizedBase.startsWith('/')
    || normalizedBase.startsWith('//')
    || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalizedBase)
  ) {
    return normalizedPath;
  }
  return normalizedBase && normalizedBase !== '.'
    ? `${normalizedBase}/${normalizedPath}`
    : normalizedPath;
};

export const buildControlRoomHandoffPanelModel = (
  handoff: ControlRoomPreparedHandoff,
  options: { linkBase?: string } = {},
): ControlRoomHandoffPanelModel => ({
  schemaVersion: 1,
  readOnly: true,
  inert: true,
  handoff: {
    ...handoff,
    evidence: handoff.evidence.map((evidence) => ({
      ...evidence,
      href: safeHref(evidence.relativePath, options.linkBase ?? ''),
    })),
  },
  executionBoundary: {
    owner: 'human_orchestrator',
    browserExecutesCommands: false,
    providerCallsEnabled: false,
    commitsOrPrsEnabled: false,
  },
});

export const saveControlRoomPreparedHandoff = async (
  repoRoot: string,
  relativePath: string,
  handoff: ControlRoomPreparedHandoff,
): Promise<string> => {
  const normalized = normalizeHandoffArtifactPath(relativePath);
  const absolutePath = path.join(repoRoot, normalized);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, stringifyControlRoomPreparedHandoff(handoff), 'utf8');
  return normalized;
};
