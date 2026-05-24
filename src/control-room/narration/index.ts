import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { stringifyDeterministicJson } from '../../harness/json.js';
import {
  resolveEvidenceAbsolutePath,
  sortTimelineEvents,
  type ControlRoomTimelineArtifact,
  type ControlRoomTimelineEvent,
  type ControlRoomTimelineEvidenceRef,
} from '../timeline/index.js';
import {
  CONTROL_ROOM_NARRATION_SCHEMA_VERSION,
  type BuildControlRoomNarrationOptions,
  type ControlRoomNarrationArtifact,
  type ControlRoomNarrationMessage,
  type ControlRoomNarrationRenderModel,
  type ControlRoomNarrationSourceArtifact,
  type ControlRoomVersionNarration,
} from './types.js';

export * from './types.js';
export { renderControlRoomNarrationHtml } from './render-html.js';

export const CONTROL_ROOM_NARRATION_ROOT = path.join('runs', 'control-room', 'narration');

const DEFAULT_GENERATED_AT = '2026-05-24T06:00:00.000Z';

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const firstString = (...values: unknown[]): string | undefined => {
  for (const value of values) {
    if (isString(value)) {
      return value.trim();
    }
  }
  return undefined;
};

const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const sentence = (value: string, maxLength = 220): string => {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}.`;
};

const fileExists = async (absolutePath: string): Promise<boolean> => {
  try {
    const info = await stat(absolutePath);
    return info.isFile();
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

const normalizeNarrationArtifactPath = (relativePath: string): string => {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const root = CONTROL_ROOM_NARRATION_ROOT.replace(/\\/g, '/');
  if (!normalized.startsWith(`${root}/`)) {
    throw new Error(`Narration artifact path must stay under ${root}/.`);
  }
  if (normalized.split('/').includes('..')) {
    throw new Error(`Narration artifact path must not contain .. segments: ${relativePath}`);
  }
  return normalized;
};

const timelineSource = (event: ControlRoomTimelineEvent): ControlRoomNarrationSourceArtifact => ({
  kind: 'timeline_event',
  relativePath: `timeline:${event.id}`,
  label: `${event.type}: ${event.id}`,
  status: 'present',
  sourceEventId: event.id,
  sourceEventType: event.type,
  extractedClaims: [event.summary],
});

const evidenceLabel = (evidence: ControlRoomTimelineEvidenceRef): string =>
  evidence.label ?? `${evidence.kind}: ${evidence.relativePath}`;

const markdownBulletsAfterHeading = (content: string, heading: string): string[] => {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((line) => line.trim().toLowerCase() === heading.toLowerCase());
  if (start < 0) {
    return [];
  }
  const bullets: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,6}\s/.test(line) && bullets.length > 0) {
      break;
    }
    const match = /^-\s+(.+)$/.exec(line.trim());
    if (match) {
      bullets.push(sentence(match[1]));
    }
  }
  return bullets;
};

const markdownStatus = (content: string): string | undefined => {
  const match = /^Status:\s*(.+)$/im.exec(content);
  return match ? `Status: ${sentence(match[1])}` : undefined;
};

const claimsFromMarkdown = (content: string, kind: string): string[] => {
  const claims: string[] = [];
  if (kind === 'changelog') {
    claims.push(...markdownBulletsAfterHeading(content, '## Implemented changes').slice(0, 3));
    claims.push(...markdownBulletsAfterHeading(content, '## Residual risks').slice(0, 1));
  } else if (kind === 'developer_notes') {
    claims.push(...markdownBulletsAfterHeading(content, '## Implementation notes').slice(0, 3));
    claims.push(...markdownBulletsAfterHeading(content, '## Evidence').slice(0, 2));
  } else if (kind === 'acceptance') {
    claims.push(...markdownBulletsAfterHeading(content, '## Acceptance').slice(0, 2));
    claims.push(...markdownBulletsAfterHeading(content, '## Blockers').slice(0, 2));
  }
  const status = markdownStatus(content);
  if (status) {
    claims.push(status);
  }
  return claims;
};

const metricDeltaClaim = (
  label: string,
  value: unknown,
): string | undefined => {
  if (!isPlainRecord(value)) {
    return undefined;
  }
  const base = value.base;
  const target = value.target;
  const delta = value.delta;
  if (
    typeof base === 'number'
    && typeof target === 'number'
    && typeof delta === 'number'
  ) {
    return `${label}: ${base} -> ${target} (delta ${delta >= 0 ? '+' : ''}${delta}).`;
  }
  return undefined;
};

const claimsFromJson = (value: unknown, kind: string): string[] => {
  if (!isPlainRecord(value)) {
    return [];
  }
  const claims: string[] = [];
  const directSummary = firstString(value.summary, value.interpretation);
  if (directSummary) {
    claims.push(sentence(directSummary));
  }
  if (kind === 'version_summary') {
    const status = firstString(value.acceptance_status);
    if (status) {
      claims.push(`Acceptance status: ${status}.`);
    }
    const runs = Array.isArray(value.runs) ? value.runs : [];
    if (runs.length > 0) {
      const losses = runs.filter((run) => isPlainRecord(run) && run.result === 'LOSS').length;
      const aborted = runs.filter((run) => isPlainRecord(run) && run.result === 'ABORTED').length;
      claims.push(`Version summary covers ${runs.length} runs (${losses} LOSS, ${aborted} ABORTED).`);
    }
  }
  if (kind === 'review') {
    const issues = Array.isArray(value.top_issues) ? value.top_issues : [];
    for (const issue of issues.slice(0, 2)) {
      if (isPlainRecord(issue)) {
        const observation = firstString(issue.observation, issue.recommendation, issue.diagnosis);
        if (observation) {
          claims.push(sentence(observation));
        }
      }
    }
    const nextChanges = Array.isArray(value.suggested_next_changes)
      ? value.suggested_next_changes.filter(isString).slice(0, 2)
      : [];
    claims.push(...nextChanges.map((change) => `Suggested next change: ${sentence(change)}`));
  }
  if (kind === 'scorecard') {
    const result = firstString(value.result);
    const turns = typeof value.turns === 'number' ? value.turns : undefined;
    if (result && turns !== undefined) {
      claims.push(`Scorecard result: ${result} in ${turns} turns.`);
    }
    const diagnostics = isPlainRecord(value.diagnostics) ? value.diagnostics : undefined;
    const primary = firstString(diagnostics?.primary_category);
    if (primary) {
      claims.push(`Primary diagnostic category: ${primary}.`);
    }
  }
  if (kind === 'comparison') {
    const objective = isPlainRecord(value.objective_metric_deltas)
      ? value.objective_metric_deltas
      : {};
    const tactical = isPlainRecord(value.reviewer_score_deltas)
      ? value.reviewer_score_deltas.tactical_depth
      : undefined;
    for (const claim of [
      metricDeltaClaim('Items used', objective.items_used),
      metricDeltaClaim('Invalid actions', objective.invalid_actions),
      metricDeltaClaim('Tactical depth score', tactical),
    ]) {
      if (claim) {
        claims.push(claim);
      }
    }
  }
  if (kind === 'balance_summary') {
    const problemRuns = isPlainRecord(value.problem_run_count)
      ? value.problem_run_count.total
      : value.problem_run_count;
    if (typeof problemRuns === 'number') {
      claims.push(`Balance summary reports ${problemRuns} problem runs.`);
    }
  }
  return claims;
};

const readEvidenceClaims = async (
  repoRoot: string,
  event: ControlRoomTimelineEvent,
  evidence: ControlRoomTimelineEvidenceRef,
): Promise<ControlRoomNarrationSourceArtifact> => {
  let resolved: { absolutePath: string; normalizedRelative: string };
  try {
    resolved = resolveEvidenceAbsolutePath(repoRoot, evidence.relativePath);
  } catch (error: unknown) {
    return {
      kind: evidence.kind,
      relativePath: evidence.relativePath,
      label: evidenceLabel(evidence),
      status: 'unavailable',
      sourceEventId: event.id,
      sourceEventType: event.type,
      missingReason: error instanceof Error ? error.message : 'Evidence path is invalid.',
      extractedClaims: [],
    };
  }

  const expectedPresent = evidence.present ?? true;
  const present = expectedPresent && await fileExists(resolved.absolutePath);
  if (!present) {
    return {
      kind: evidence.kind,
      relativePath: resolved.normalizedRelative,
      label: evidenceLabel(evidence),
      status: 'missing',
      sourceEventId: event.id,
      sourceEventType: event.type,
      missingReason: evidence.missingReason ?? 'Evidence artifact is unavailable on disk.',
      extractedClaims: [],
    };
  }

  try {
    const content = await readFile(resolved.absolutePath, 'utf8');
    const claims = resolved.normalizedRelative.endsWith('.json')
      ? claimsFromJson(JSON.parse(content), evidence.kind)
      : claimsFromMarkdown(content, evidence.kind);
    return {
      kind: evidence.kind,
      relativePath: resolved.normalizedRelative,
      label: evidenceLabel(evidence),
      status: claims.length > 0 ? 'present' : 'unparsed',
      sourceEventId: event.id,
      sourceEventType: event.type,
      missingReason: claims.length > 0
        ? undefined
        : 'Evidence exists, but no supported summary fields were found.',
      extractedClaims: claims.slice(0, 5),
    };
  } catch (error: unknown) {
    return {
      kind: evidence.kind,
      relativePath: resolved.normalizedRelative,
      label: evidenceLabel(evidence),
      status: 'unparsed',
      sourceEventId: event.id,
      sourceEventType: event.type,
      missingReason: error instanceof Error ? error.message : 'Evidence could not be parsed.',
      extractedClaims: [],
    };
  }
};

const sourcesForEvent = async (
  repoRoot: string,
  event: ControlRoomTimelineEvent,
): Promise<ControlRoomNarrationSourceArtifact[]> => {
  const evidenceSources = await Promise.all(
    (event.evidence ?? []).map((evidence) => readEvidenceClaims(repoRoot, event, evidence)),
  );
  return [timelineSource(event), ...evidenceSources].sort((left, right) =>
    `${left.relativePath}:${left.label}`.localeCompare(`${right.relativePath}:${right.label}`),
  );
};

const messageLabelFor = (event: ControlRoomTimelineEvent): string => {
  if (event.type === 'developer_summary') {
    return 'Developer summary';
  }
  if (event.type === 'reviewer_summary') {
    return 'Reviewer summary';
  }
  if (event.type === 'human_comment' || event.type === 'human_idea') {
    return 'Human comment';
  }
  return 'Narrator summary';
};

const roleForEvent = (
  event: ControlRoomTimelineEvent,
): ControlRoomNarrationMessage['role'] => {
  if (event.type === 'developer_summary') {
    return 'developer_summary';
  }
  if (event.type === 'reviewer_summary') {
    return 'reviewer_summary';
  }
  if (event.type === 'human_comment' || event.type === 'human_idea') {
    return 'human_comment';
  }
  return 'narrator_summary';
};

const buildEventMessage = async (
  repoRoot: string,
  event: ControlRoomTimelineEvent,
): Promise<ControlRoomNarrationMessage> => {
  const sources = await sourcesForEvent(repoRoot, event);
  const unavailable = sources
    .filter((source) => source.status !== 'present')
    .map((source) => `${source.label}: ${source.missingReason ?? source.status}`);
  return {
    id: `message-${event.id}`,
    role: roleForEvent(event),
    label: messageLabelFor(event),
    versionId: event.versionId,
    timestamp: event.timestamp,
    actor: event.actor,
    text: event.summary,
    sourceArtifacts: sources,
    unavailable,
  };
};

const firstClaim = (
  sources: readonly ControlRoomNarrationSourceArtifact[],
  kind: string,
): string | undefined =>
  sources.find((source) => source.kind === kind && source.extractedClaims.length > 0)
    ?.extractedClaims[0];

const firstAnyClaim = (
  sources: readonly ControlRoomNarrationSourceArtifact[],
  kinds: readonly string[],
): string | undefined => {
  for (const kind of kinds) {
    const claim = firstClaim(sources, kind);
    if (claim) {
      return claim;
    }
  }
  return sources.find((source) => source.extractedClaims.length > 0)?.extractedClaims[0];
};

const buildNarratorMessage = (
  versionId: string,
  generatedAt: string,
  messages: readonly ControlRoomNarrationMessage[],
): ControlRoomNarrationMessage => {
  const sources = messages.flatMap((message) => message.sourceArtifacts)
    .filter((source) => source.kind !== 'timeline_event');
  const changed = firstAnyClaim(sources, ['changelog', 'developer_notes', 'version_summary']);
  const reviewerFound = firstAnyClaim(sources, ['review', 'scorecard', 'comparison']);
  const evidenceCount = sources.filter((source) => source.status === 'present').length;
  const missing = sources.filter((source) => source.status !== 'present');
  const nextFocus = firstAnyClaim(sources, ['review', 'comparison', 'acceptance'])
    ?? (missing.length > 0 ? 'Resolve missing evidence before claiming more.' : 'No next focus was derived from supported evidence.');
  const text = [
    `What changed: ${changed ?? 'Unavailable from supported artifacts.'}`,
    `What the reviewer found: ${reviewerFound ?? 'Unavailable from supported artifacts.'}`,
    `Evidence status: ${evidenceCount} source artifact(s) parsed; ${missing.length} unavailable or unsupported.`,
    `Likely next: ${nextFocus}`,
  ].join(' ');

  return {
    id: `${versionId}-narrator_summary`,
    role: 'narrator_summary',
    label: 'Narrator summary',
    versionId,
    timestamp: generatedAt,
    actor: 'narrator',
    text,
    sourceArtifacts: sources.sort((left, right) =>
      `${left.relativePath}:${left.label}`.localeCompare(`${right.relativePath}:${right.label}`),
    ),
    unavailable: missing.map((source) =>
      `${source.label}: ${source.missingReason ?? source.status}`,
    ),
  };
};

const evidenceStatusFor = (
  messages: readonly ControlRoomNarrationMessage[],
): ControlRoomVersionNarration['evidenceStatus'] => {
  const sources = messages.flatMap((message) => message.sourceArtifacts)
    .filter((source) => source.kind !== 'timeline_event');
  if (sources.length === 0 || sources.every((source) => source.status !== 'present')) {
    return 'missing';
  }
  return sources.some((source) => source.status !== 'present') ? 'partial' : 'available';
};

const groupByVersion = (
  messages: readonly ControlRoomNarrationMessage[],
): Map<string, ControlRoomNarrationMessage[]> => {
  const grouped = new Map<string, ControlRoomNarrationMessage[]>();
  for (const message of messages) {
    if (!message.versionId) {
      continue;
    }
    const existing = grouped.get(message.versionId) ?? [];
    existing.push(message);
    grouped.set(message.versionId, existing);
  }
  return grouped;
};

export const buildControlRoomNarration = async (
  timeline: ControlRoomTimelineArtifact,
  options: BuildControlRoomNarrationOptions,
): Promise<ControlRoomNarrationArtifact> => {
  const generatedAt = options.generatedAt ?? DEFAULT_GENERATED_AT;
  const eventMessages = await Promise.all(
    sortTimelineEvents(timeline.events).map((event) => buildEventMessage(options.repoRoot, event)),
  );
  const sessionMessages = eventMessages.filter((message) => !message.versionId);
  const grouped = groupByVersion(eventMessages);
  const versions = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([versionId, messages]) => {
      const narrator = buildNarratorMessage(versionId, generatedAt, messages);
      const allMessages = [...messages, narrator].sort((left, right) =>
        `${left.timestamp}:${left.id}`.localeCompare(`${right.timestamp}:${right.id}`),
      );
      const missingEvidence = [...new Set(allMessages.flatMap((message) => message.unavailable))]
        .sort((left, right) => left.localeCompare(right));
      return {
        versionId,
        evidenceStatus: evidenceStatusFor(allMessages),
        messages: allMessages,
        missingEvidence,
        likelyNextFocus: narrator.text.split('Likely next: ')[1] ?? 'Unavailable.',
      } satisfies ControlRoomVersionNarration;
    });

  return {
    schemaVersion: CONTROL_ROOM_NARRATION_SCHEMA_VERSION,
    sessionId: timeline.sessionId,
    generatedAt,
    activeBaseVersion: timeline.activeBaseVersion,
    timelinePath: options.timelinePath,
    summary: `Narration covers ${versions.length} version(s) from deterministic local evidence.`,
    versions,
    sessionMessages,
  };
};

export const stringifyControlRoomNarration = (
  narration: ControlRoomNarrationArtifact,
): string => stringifyDeterministicJson(narration);

const safeHref = (relativePath: string, linkBase = ''): string => {
  if (relativePath.startsWith('timeline:')) {
    return '#timeline-source';
  }
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

const linkSources = (
  sources: readonly ControlRoomNarrationSourceArtifact[],
  linkBase: string | undefined,
) => sources.map((source) => ({
  ...source,
  href: safeHref(source.relativePath, linkBase ?? ''),
}));

export const buildControlRoomNarrationRenderModel = (
  narration: ControlRoomNarrationArtifact,
  options: { linkBase?: string } = {},
): ControlRoomNarrationRenderModel => ({
  schemaVersion: 1,
  readOnly: true,
  inert: true,
  generatedAt: narration.generatedAt,
  sessionId: narration.sessionId,
  activeBaseVersion: narration.activeBaseVersion,
  summary: narration.summary,
  sessionMessages: narration.sessionMessages.map((message) => ({
    ...message,
    sourceArtifacts: linkSources(message.sourceArtifacts, options.linkBase),
  })),
  versions: narration.versions.map((version) => ({
    ...version,
    messages: version.messages.map((message) => ({
      ...message,
      sourceArtifacts: linkSources(message.sourceArtifacts, options.linkBase),
    })),
  })),
  boundary: {
    deterministicFallback: true,
    providerCallsRequired: false,
    acceptanceDecisionAuthority: false,
    preservesArtifactLinks: true,
  },
});

export const saveControlRoomNarration = async (
  repoRoot: string,
  relativePath: string,
  narration: ControlRoomNarrationArtifact,
): Promise<string> => {
  const normalized = normalizeNarrationArtifactPath(relativePath);
  const absolutePath = path.join(repoRoot, normalized);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, stringifyControlRoomNarration(narration), 'utf8');
  return normalized;
};
