import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { HUMAN_PLAYER_PERSONA } from '../human-play/types.js';
import type { HumanPlayMode } from '../human-play/types.js';
import { buildArtifactBasename } from './artifacts.js';
import {
  type ArtifactWriteOptions,
  type ArtifactWritePolicyContext,
  writeArtifactFile,
} from './artifact-write-policy.js';
import { stringifyDeterministicJson } from './json.js';
import { isLlmPlayerPersona } from './policy-registry.js';
import type { PlaythroughScorecard, PlaythroughTrace } from './types.js';

export const PLAYER_KIND_AGENT = 'agent' as const;
export const PLAYER_KIND_HUMAN = 'human' as const;

export const PLAYER_KINDS = [PLAYER_KIND_AGENT, PLAYER_KIND_HUMAN] as const;

export type PlayerKind = (typeof PLAYER_KINDS)[number];

export const AGENT_POLICY_CLASSES = ['baseline', 'llm_persona'] as const;

export type AgentPolicyClass = (typeof AGENT_POLICY_CLASSES)[number];

export const HUMAN_PLAYTEST_NOTES_SCHEMA_VERSION = 1 as const;

export const MAX_HUMAN_SESSION_LABEL_LENGTH = 64;
export const MAX_HUMAN_PLAYTEST_NOTES_LENGTH = 2000;

export interface PlaytestRunMetadataFields {
  player_kind: PlayerKind;
  /** Present for harness/agent runs: baseline policy vs LLM persona. */
  agent_policy_class?: AgentPolicyClass;
  /** Present for local human playtest runs. */
  human_play_mode?: HumanPlayMode;
  /** Optional local session label (no PII required). */
  session_label?: string;
}

export interface HumanPlaytestNotes {
  schema_version: typeof HUMAN_PLAYTEST_NOTES_SCHEMA_VERSION;
  version: string;
  seed: string;
  persona: string;
  player_kind: typeof PLAYER_KIND_HUMAN;
  human_play_mode: HumanPlayMode;
  trace_path: string;
  scorecard_path: string;
  session_label?: string;
  notes?: string;
}

export const isHumanPlayerPersona = (persona: string): boolean => persona === HUMAN_PLAYER_PERSONA;

export const inferPlayerKindFromPersona = (persona: string): PlayerKind =>
  isHumanPlayerPersona(persona) ? PLAYER_KIND_HUMAN : PLAYER_KIND_AGENT;

export const resolveAgentPolicyClass = (policyId: string): AgentPolicyClass =>
  isLlmPlayerPersona(policyId) ? 'llm_persona' : 'baseline';

export const buildAgentPlaytestMetadata = (policyId: string): PlaytestRunMetadataFields => ({
  player_kind: PLAYER_KIND_AGENT,
  agent_policy_class: resolveAgentPolicyClass(policyId),
});

export const buildHumanPlaytestMetadata = (
  mode: HumanPlayMode,
  sessionLabel?: string,
): PlaytestRunMetadataFields => ({
  player_kind: PLAYER_KIND_HUMAN,
  human_play_mode: mode,
  ...(sessionLabel ? { session_label: sessionLabel } : {}),
});

export const applyPlaytestMetadataToTrace = (
  trace: PlaythroughTrace,
  fields: PlaytestRunMetadataFields,
): PlaythroughTrace => ({
  ...trace,
  ...fields,
});

export const playtestMetadataFromTrace = (
  trace: PlaythroughTrace,
): PlaytestRunMetadataFields => {
  const player_kind = trace.player_kind ?? inferPlayerKindFromPersona(trace.persona);
  return {
    player_kind,
    ...(trace.agent_policy_class ? { agent_policy_class: trace.agent_policy_class } : {}),
    ...(trace.human_play_mode ? { human_play_mode: trace.human_play_mode } : {}),
    ...(trace.session_label ? { session_label: trace.session_label } : {}),
  };
};

export const normalizeSessionLabel = (label: string): string => {
  const trimmed = label.trim();
  if (trimmed.length === 0) {
    throw new Error('Session label must be non-empty when provided.');
  }
  if (trimmed.length > MAX_HUMAN_SESSION_LABEL_LENGTH) {
    throw new Error(
      `Session label exceeds ${MAX_HUMAN_SESSION_LABEL_LENGTH} characters.`,
    );
  }
  return trimmed;
};

export const normalizeHumanPlaytestNotes = (notes: string): string => {
  const trimmed = notes.trim();
  if (trimmed.length === 0) {
    throw new Error('Human playtest notes must be non-empty when provided.');
  }
  if (trimmed.length > MAX_HUMAN_PLAYTEST_NOTES_LENGTH) {
    throw new Error(
      `Human playtest notes exceed ${MAX_HUMAN_PLAYTEST_NOTES_LENGTH} characters.`,
    );
  }
  return trimmed;
};

export const readNotesFromFile = async (filePath: string): Promise<string> => {
  const contents = await readFile(filePath, 'utf8');
  return normalizeHumanPlaytestNotes(contents);
};

export const buildHumanNotesRelativePath = (
  version: string,
  seed: string,
  persona: string,
): string =>
  path.join(
    'runs',
    version,
    'human_notes',
    `${buildArtifactBasename(seed, persona)}.json`,
  );

export interface SaveHumanPlaytestNotesInput {
  version: string;
  seed: string;
  persona: string;
  humanPlayMode: HumanPlayMode;
  tracePath: string;
  scorecardPath: string;
  sessionLabel?: string;
  notes?: string;
}

export const buildHumanPlaytestNotes = (
  input: SaveHumanPlaytestNotesInput,
): HumanPlaytestNotes => ({
  schema_version: HUMAN_PLAYTEST_NOTES_SCHEMA_VERSION,
  version: input.version,
  seed: input.seed,
  persona: input.persona,
  player_kind: PLAYER_KIND_HUMAN,
  human_play_mode: input.humanPlayMode,
  trace_path: input.tracePath,
  scorecard_path: input.scorecardPath,
  ...(input.sessionLabel ? { session_label: input.sessionLabel } : {}),
  ...(input.notes ? { notes: input.notes } : {}),
});

export interface SaveHumanPlaytestNotesOptions {
  write?: ArtifactWriteOptions;
  policyContext?: ArtifactWritePolicyContext;
}

export const saveHumanPlaytestNotes = async (
  runsRoot: string,
  input: SaveHumanPlaytestNotesInput,
  options: SaveHumanPlaytestNotesOptions = {},
): Promise<{ notesPath: string; notesRelative: string }> => {
  const notesRelative = buildHumanNotesRelativePath(input.version, input.seed, input.persona);
  const notesPath = path.join(runsRoot, notesRelative);
  const artifact = buildHumanPlaytestNotes(input);

  await writeArtifactFile(
    notesPath,
    stringifyDeterministicJson(artifact),
    options.write,
    {
      runsRoot,
      policyContext: options.policyContext,
      artifactLabel: notesRelative,
    },
  );

  return { notesPath, notesRelative };
};

export const assertHumanPlaytestTraceShape = (trace: PlaythroughTrace): void => {
  if (trace.player_kind !== PLAYER_KIND_HUMAN) {
    throw new Error('Expected human playtest trace to set player_kind to "human".');
  }
  if (!trace.human_play_mode) {
    throw new Error('Expected human playtest trace to set human_play_mode.');
  }
  if (!isHumanPlayerPersona(trace.persona)) {
    throw new Error(`Expected human playtest persona "${HUMAN_PLAYER_PERSONA}".`);
  }
  if (trace.steps.length === 0) {
    throw new Error('Human playtest trace must include at least one step.');
  }
  for (const step of trace.steps) {
    if (!step.chosen_action?.id || !step.chosen_action?.type) {
      throw new Error('Human playtest trace steps must record structured chosen_action.');
    }
  }
};

export const scorecardIncludesHumanMetadata = (
  scorecard: PlaythroughScorecard,
): boolean =>
  scorecard.player_kind === PLAYER_KIND_HUMAN &&
  typeof scorecard.human_play_mode === 'string';
