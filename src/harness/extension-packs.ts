import extensionPacksManifestJson from '../../content/extension-packs.json' with { type: 'json' };
import rejectedForbiddenCapabilityJson from '../../content/extensions/examples/rejected-forbidden-capability.json' with { type: 'json' };
import reviewerLabsPackJson from '../../content/extensions/reviewer-labs.json' with { type: 'json' };
import {
  ARTIFACT_SCHEMA_VERSION,
  ENGINE_PROTOCOL_VERSION,
} from '../game/protocol-versions.js';
import {
  assertChallengeModeId,
  normalizeChallengeModeId,
} from '../game/challenge-modes.js';
import {
  assertScenarioPackId,
  normalizeScenarioPackId,
} from '../game/scenario-packs.js';
import {
  isBaselinePolicyId,
  type BaselinePolicyId,
} from './policy-registry.js';
import {
  isReviewerPersona,
  type ReviewerPersona,
} from './reviewer-client.js';

export const EXTENSION_PACKS_SCHEMA_VERSION = '19A' as const;
export const DEFAULT_EXTENSION_PACK_ID = 'default' as const;

const EXTENSION_PACK_BY_FILE: Record<string, unknown> = {
  'extensions/reviewer-labs.json': reviewerLabsPackJson,
};

const ALLOWED_EXTENSION_CAPABILITIES = [
  'local_content',
  'baseline_policies',
  'reviewer_personas',
  'scenario_presets',
] as const;

export type ExtensionPackCapability = (typeof ALLOWED_EXTENSION_CAPABILITIES)[number];

export interface ExtensionPacksManifestEntry {
  id: string;
  label: string;
  description: string;
  packFile: string;
}

export interface ExtensionPacksManifest {
  schemaVersion: typeof EXTENSION_PACKS_SCHEMA_VERSION;
  packs: ExtensionPacksManifestEntry[];
}

export interface ExtensionPackCompatibility {
  engineProtocolVersion: typeof ENGINE_PROTOCOL_VERSION;
  artifactSchemaVersion: typeof ARTIFACT_SCHEMA_VERSION;
}

export interface ExtensionReviewerPersonaRef {
  id: ReviewerPersona;
  notes?: string;
}

export interface ExtensionScenarioPreset {
  id: string;
  label: string;
  description: string;
  seed: string;
  policy: BaselinePolicyId;
  challengeMode?: string;
  scenarioPack?: string;
}

export interface ExtensionPackComponents {
  scenarioPack?: string;
  baselinePolicies: BaselinePolicyId[];
  reviewerPersonas: ExtensionReviewerPersonaRef[];
  scenarioPresets: ExtensionScenarioPreset[];
}

export interface ExtensionPack {
  schemaVersion: typeof EXTENSION_PACKS_SCHEMA_VERSION;
  id: string;
  label: string;
  description: string;
  compatibility: ExtensionPackCompatibility;
  capabilities: ExtensionPackCapability[];
  components: ExtensionPackComponents;
}

export interface ExtensionRunSelection {
  extensionPack?: ExtensionPack;
  extensionPackId?: string;
  extensionPackLabel?: string;
  scenarioPackId?: string;
}

export class ExtensionPackValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtensionPackValidationError';
  }
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const requiredString = (record: Record<string, unknown>, key: string, path: string): string => {
  const value = record[key];
  if (!isNonEmptyString(value)) {
    throw new ExtensionPackValidationError(`${path}.${key} must be a non-empty string`);
  }
  return value;
};

const optionalString = (
  record: Record<string, unknown>,
  key: string,
  path: string,
): string | undefined => {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!isNonEmptyString(value)) {
    throw new ExtensionPackValidationError(`${path}.${key} must be a non-empty string when present`);
  }
  return value;
};

const validateCompatibility = (raw: unknown, path: string): ExtensionPackCompatibility => {
  if (!isRecord(raw)) {
    throw new ExtensionPackValidationError(`${path} must be an object`);
  }
  if (raw.engineProtocolVersion !== ENGINE_PROTOCOL_VERSION) {
    throw new ExtensionPackValidationError(
      `${path}.engineProtocolVersion must be "${ENGINE_PROTOCOL_VERSION}"`,
    );
  }
  if (raw.artifactSchemaVersion !== ARTIFACT_SCHEMA_VERSION) {
    throw new ExtensionPackValidationError(
      `${path}.artifactSchemaVersion must be "${ARTIFACT_SCHEMA_VERSION}"`,
    );
  }
  return {
    engineProtocolVersion: ENGINE_PROTOCOL_VERSION,
    artifactSchemaVersion: ARTIFACT_SCHEMA_VERSION,
  };
};

const validateCapabilities = (raw: unknown, path: string): ExtensionPackCapability[] => {
  if (!Array.isArray(raw)) {
    throw new ExtensionPackValidationError(`${path} must be an array`);
  }
  const allowed = new Set<string>(ALLOWED_EXTENSION_CAPABILITIES);
  const capabilities: ExtensionPackCapability[] = [];
  const seen = new Set<string>();
  for (const [index, capability] of raw.entries()) {
    if (!isNonEmptyString(capability)) {
      throw new ExtensionPackValidationError(`${path}[${index}] must be a non-empty string`);
    }
    if (!allowed.has(capability)) {
      throw new ExtensionPackValidationError(
        `${path}[${index}] requests forbidden capability "${capability}"`,
      );
    }
    if (!seen.has(capability)) {
      capabilities.push(capability as ExtensionPackCapability);
      seen.add(capability);
    }
  }
  return capabilities;
};

const validateBaselinePolicies = (raw: unknown, path: string): BaselinePolicyId[] => {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new ExtensionPackValidationError(`${path} must be an array`);
  }
  const policies: BaselinePolicyId[] = [];
  const seen = new Set<string>();
  for (const [index, policy] of raw.entries()) {
    if (!isNonEmptyString(policy)) {
      throw new ExtensionPackValidationError(`${path}[${index}] must be a non-empty string`);
    }
    if (!isBaselinePolicyId(policy)) {
      throw new ExtensionPackValidationError(`${path}[${index}] references unknown baseline policy "${policy}"`);
    }
    if (!seen.has(policy)) {
      policies.push(policy);
      seen.add(policy);
    }
  }
  return policies;
};

const validateReviewerPersonas = (raw: unknown, path: string): ExtensionReviewerPersonaRef[] => {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new ExtensionPackValidationError(`${path} must be an array`);
  }
  const personas: ExtensionReviewerPersonaRef[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of raw.entries()) {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      throw new ExtensionPackValidationError(`${entryPath} must be an object`);
    }
    const id = requiredString(entry, 'id', entryPath);
    if (!isReviewerPersona(id)) {
      throw new ExtensionPackValidationError(`${entryPath}.id references unknown reviewer persona "${id}"`);
    }
    if (seen.has(id)) {
      throw new ExtensionPackValidationError(`${entryPath}.id duplicates reviewer persona "${id}"`);
    }
    seen.add(id);
    const notes = optionalString(entry, 'notes', entryPath);
    personas.push({ id, ...(notes ? { notes } : {}) });
  }
  return personas;
};

const validateScenarioPackId = (value: string, path: string): string => {
  try {
    assertScenarioPackId(value);
    return value;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ExtensionPackValidationError(`${path} references invalid scenario pack: ${message}`);
  }
};

const validateChallengeModeId = (value: string, path: string): string => {
  const normalized = normalizeChallengeModeId(value);
  if (!normalized) {
    return value;
  }
  try {
    assertChallengeModeId(normalized);
    return normalized;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ExtensionPackValidationError(`${path} references invalid challenge mode: ${message}`);
  }
};

const validateScenarioPresets = (raw: unknown, path: string): ExtensionScenarioPreset[] => {
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new ExtensionPackValidationError(`${path} must be an array`);
  }
  const presets: ExtensionScenarioPreset[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of raw.entries()) {
    const entryPath = `${path}[${index}]`;
    if (!isRecord(entry)) {
      throw new ExtensionPackValidationError(`${entryPath} must be an object`);
    }
    const id = requiredString(entry, 'id', entryPath);
    if (seen.has(id)) {
      throw new ExtensionPackValidationError(`${entryPath}.id duplicates scenario preset "${id}"`);
    }
    seen.add(id);
    const policy = requiredString(entry, 'policy', entryPath);
    if (!isBaselinePolicyId(policy)) {
      throw new ExtensionPackValidationError(`${entryPath}.policy references unknown baseline policy "${policy}"`);
    }
    const scenarioPack = optionalString(entry, 'scenarioPack', entryPath);
    const challengeMode = optionalString(entry, 'challengeMode', entryPath);
    presets.push({
      id,
      label: requiredString(entry, 'label', entryPath),
      description: requiredString(entry, 'description', entryPath),
      seed: requiredString(entry, 'seed', entryPath),
      policy,
      ...(challengeMode
        ? { challengeMode: validateChallengeModeId(challengeMode, `${entryPath}.challengeMode`) }
        : {}),
      ...(scenarioPack
        ? { scenarioPack: validateScenarioPackId(scenarioPack, `${entryPath}.scenarioPack`) }
        : {}),
    });
  }
  return presets;
};

const validateComponents = (raw: unknown, path: string): ExtensionPackComponents => {
  if (!isRecord(raw)) {
    throw new ExtensionPackValidationError(`${path} must be an object`);
  }
  const scenarioPack = optionalString(raw, 'scenarioPack', path);
  return {
    ...(scenarioPack
      ? { scenarioPack: validateScenarioPackId(scenarioPack, `${path}.scenarioPack`) }
      : {}),
    baselinePolicies: validateBaselinePolicies(raw.baselinePolicies, `${path}.baselinePolicies`),
    reviewerPersonas: validateReviewerPersonas(raw.reviewerPersonas, `${path}.reviewerPersonas`),
    scenarioPresets: validateScenarioPresets(raw.scenarioPresets, `${path}.scenarioPresets`),
  };
};

export const validateExtensionPacksManifest = (raw: unknown): ExtensionPacksManifest => {
  if (!isRecord(raw)) {
    throw new ExtensionPackValidationError('extension-packs.json must be an object');
  }
  if (raw.schemaVersion !== EXTENSION_PACKS_SCHEMA_VERSION) {
    throw new ExtensionPackValidationError(
      `extension-packs.json schemaVersion must be "${EXTENSION_PACKS_SCHEMA_VERSION}"`,
    );
  }
  if (!Array.isArray(raw.packs) || raw.packs.length === 0) {
    throw new ExtensionPackValidationError('extension-packs.json packs must be a non-empty array');
  }

  const packs: ExtensionPacksManifestEntry[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of raw.packs.entries()) {
    const path = `extension-packs.json.packs[${index}]`;
    if (!isRecord(entry)) {
      throw new ExtensionPackValidationError(`${path} must be an object`);
    }
    const id = requiredString(entry, 'id', path);
    if (seen.has(id)) {
      throw new ExtensionPackValidationError(`${path}.id duplicates extension pack "${id}"`);
    }
    seen.add(id);
    const packFile = requiredString(entry, 'packFile', path);
    if (!EXTENSION_PACK_BY_FILE[packFile]) {
      throw new ExtensionPackValidationError(`${path}.packFile "${packFile}" is not registered`);
    }
    packs.push({
      id,
      label: requiredString(entry, 'label', path),
      description: requiredString(entry, 'description', path),
      packFile,
    });
  }
  return {
    schemaVersion: EXTENSION_PACKS_SCHEMA_VERSION,
    packs,
  };
};

export const validateExtensionPack = (raw: unknown, path = 'extension pack'): ExtensionPack => {
  if (!isRecord(raw)) {
    throw new ExtensionPackValidationError(`${path} must be an object`);
  }
  if (raw.schemaVersion !== EXTENSION_PACKS_SCHEMA_VERSION) {
    throw new ExtensionPackValidationError(
      `${path}.schemaVersion must be "${EXTENSION_PACKS_SCHEMA_VERSION}"`,
    );
  }
  return {
    schemaVersion: EXTENSION_PACKS_SCHEMA_VERSION,
    id: requiredString(raw, 'id', path),
    label: requiredString(raw, 'label', path),
    description: requiredString(raw, 'description', path),
    compatibility: validateCompatibility(raw.compatibility, `${path}.compatibility`),
    capabilities: validateCapabilities(raw.capabilities, `${path}.capabilities`),
    components: validateComponents(raw.components, `${path}.components`),
  };
};

let cachedManifest: ExtensionPacksManifest | undefined;
const loadedPackCache = new Map<string, ExtensionPack>();

export const loadExtensionPacksManifest = (): ExtensionPacksManifest => {
  if (!cachedManifest) {
    cachedManifest = validateExtensionPacksManifest(extensionPacksManifestJson);
  }
  return cachedManifest;
};

export const listExtensionPackIds = (): readonly string[] =>
  loadExtensionPacksManifest().packs.map((pack) => pack.id);

export const getExtensionPackManifestEntry = (
  extensionPackId: string,
): ExtensionPacksManifestEntry | undefined => {
  if (extensionPackId === DEFAULT_EXTENSION_PACK_ID) {
    return undefined;
  }
  return loadExtensionPacksManifest().packs.find((pack) => pack.id === extensionPackId);
};

export const assertExtensionPackId = (extensionPackId: string): ExtensionPacksManifestEntry => {
  const entry = getExtensionPackManifestEntry(extensionPackId);
  if (!entry) {
    const known = listExtensionPackIds().join(', ');
    throw new ExtensionPackValidationError(
      `Unknown extension pack "${extensionPackId}". Expected one of: ${known} (or omit for default).`,
    );
  }
  return entry;
};

export const normalizeExtensionPackId = (
  extensionPackId: string | undefined,
): string | undefined => {
  if (!extensionPackId || extensionPackId === DEFAULT_EXTENSION_PACK_ID) {
    return undefined;
  }
  return extensionPackId;
};

export const loadExtensionPack = (extensionPackId: string): ExtensionPack => {
  const entry = assertExtensionPackId(extensionPackId);
  const cached = loadedPackCache.get(entry.id);
  if (cached) {
    return cached;
  }
  const rawPack = EXTENSION_PACK_BY_FILE[entry.packFile];
  if (!rawPack) {
    throw new ExtensionPackValidationError(`Missing registered extension pack file "${entry.packFile}"`);
  }
  const pack = validateExtensionPack(rawPack, entry.packFile);
  if (pack.id !== entry.id) {
    throw new ExtensionPackValidationError(
      `${entry.packFile}.id "${pack.id}" does not match manifest id "${entry.id}"`,
    );
  }
  loadedPackCache.set(entry.id, pack);
  return pack;
};

export const getExtensionPackLabel = (extensionPackId: string): string | undefined =>
  getExtensionPackManifestEntry(extensionPackId)?.label;

export const resolveExtensionRunSelection = (
  extensionPackId?: string,
  explicitScenarioPackId?: string,
): ExtensionRunSelection => {
  const normalizedExtension = normalizeExtensionPackId(extensionPackId);
  const explicitScenario = normalizeScenarioPackId(explicitScenarioPackId);
  if (!normalizedExtension) {
    return {
      ...(explicitScenario ? { scenarioPackId: explicitScenario } : {}),
    };
  }
  const extensionPack = loadExtensionPack(normalizedExtension);
  const scenarioPackId = explicitScenario ?? extensionPack.components.scenarioPack;
  return {
    extensionPack,
    extensionPackId: extensionPack.id,
    extensionPackLabel: extensionPack.label,
    ...(scenarioPackId ? { scenarioPackId } : {}),
  };
};

export const REJECTED_FORBIDDEN_CAPABILITY_EXTENSION_PACK = rejectedForbiddenCapabilityJson;
