import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import optionalMediaJson from '../../content/optional-media.json' with { type: 'json' };
import { render, start } from '../game/engine.js';
import { listScenarioPackIds } from '../game/scenario-packs.js';
import { listExtensionPackIds, loadExtensionPack } from './extension-packs.js';
import { stringifyDeterministicJson } from './json.js';
import { validateVersionId } from './version-loop.js';

export const OPTIONAL_MEDIA_SCHEMA_VERSION = '19C' as const;
export const DEFAULT_OPTIONAL_MEDIA_REPORT_PATH =
  'runs/optional-media/optional_media_report.json';

const OPTIONAL_MEDIA_KINDS = ['image', 'audio', 'video'] as const;
const FALLBACK_MODES = ['ascii', 'text', 'silent'] as const;

export type OptionalMediaKind = (typeof OPTIONAL_MEDIA_KINDS)[number];
export type OptionalMediaFallbackMode = (typeof FALLBACK_MODES)[number];
export type OptionalMediaSeverity = 'blocker' | 'warning';
export type OptionalMediaAssetStatus = 'present' | 'missing' | 'not_checked';

export interface OptionalMediaFallback {
  mode: OptionalMediaFallbackMode;
  text?: string;
}

export interface OptionalMediaPresentation {
  id: string;
  label: string;
  description: string;
  kind: OptionalMediaKind;
  required: boolean;
  versionIds: string[];
  sceneIds: string[];
  assetPath: string;
  fallback: OptionalMediaFallback;
}

export interface OptionalMediaManifest {
  schemaVersion: typeof OPTIONAL_MEDIA_SCHEMA_VERSION;
  presentations: OptionalMediaPresentation[];
}

export interface OptionalMediaDiagnostic {
  severity: OptionalMediaSeverity;
  ruleId: string;
  path: string;
  message: string;
  suggestion?: string;
}

export interface OptionalMediaResolvedPresentation {
  id: string;
  kind: OptionalMediaKind;
  assetPath: string;
  assetStatus: OptionalMediaAssetStatus;
  fallbackMode: OptionalMediaFallbackMode;
  fallbackText?: string;
  required: boolean;
}

export interface OptionalMediaReport {
  schemaVersion: typeof OPTIONAL_MEDIA_SCHEMA_VERSION;
  ok: boolean;
  summary: {
    presentations: number;
    blockers: number;
    warnings: number;
    missingAssets: number;
  };
  diagnostics: OptionalMediaDiagnostic[];
  presentations: OptionalMediaResolvedPresentation[];
  knownSceneIds: string[];
}

export interface OptionalMediaHeadlessCheck {
  ok: boolean;
  renderNonEmpty: boolean;
  renderHasAsciiMarkers: boolean;
  fallbackPresentForEveryPresentation: boolean;
  diagnostics: OptionalMediaDiagnostic[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const requiredString = (
  record: Record<string, unknown>,
  key: string,
  basePath: string,
): string => {
  const value = record[key];
  if (!isNonEmptyString(value)) {
    throw new Error(`${basePath}.${key} must be a non-empty string`);
  }
  return value;
};

const requiredStringArray = (
  record: Record<string, unknown>,
  key: string,
  basePath: string,
): string[] => {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new Error(`${basePath}.${key} must be an array`);
  }
  return value.map((entry, index) => {
    if (!isNonEmptyString(entry)) {
      throw new Error(`${basePath}.${key}[${index}] must be a non-empty string`);
    }
    return entry;
  });
};

const parseFallback = (raw: unknown, basePath: string): OptionalMediaFallback => {
  if (!isRecord(raw)) {
    throw new Error(`${basePath}.fallback must be an object`);
  }
  const mode = raw.mode;
  if (typeof mode !== 'string' || !FALLBACK_MODES.includes(mode as OptionalMediaFallbackMode)) {
    throw new Error(`${basePath}.fallback.mode must be one of: ${FALLBACK_MODES.join(', ')}`);
  }
  const text = raw.text;
  if (text !== undefined && typeof text !== 'string') {
    throw new Error(`${basePath}.fallback.text must be a string when present`);
  }
  if ((mode === 'ascii' || mode === 'text') && !isNonEmptyString(text)) {
    throw new Error(`${basePath}.fallback.text is required for ${mode} fallback`);
  }
  return {
    mode: mode as OptionalMediaFallbackMode,
    ...(text !== undefined ? { text } : {}),
  };
};

const parsePresentation = (raw: unknown, index: number): OptionalMediaPresentation => {
  const basePath = `optional-media.json.presentations[${index}]`;
  if (!isRecord(raw)) {
    throw new Error(`${basePath} must be an object`);
  }
  const kind = raw.kind;
  if (typeof kind !== 'string' || !OPTIONAL_MEDIA_KINDS.includes(kind as OptionalMediaKind)) {
    throw new Error(`${basePath}.kind must be one of: ${OPTIONAL_MEDIA_KINDS.join(', ')}`);
  }
  if (typeof raw.required !== 'boolean') {
    throw new Error(`${basePath}.required must be a boolean`);
  }
  return {
    id: requiredString(raw, 'id', basePath),
    label: requiredString(raw, 'label', basePath),
    description: requiredString(raw, 'description', basePath),
    kind: kind as OptionalMediaKind,
    required: raw.required,
    versionIds: requiredStringArray(raw, 'versionIds', basePath),
    sceneIds: requiredStringArray(raw, 'sceneIds', basePath),
    assetPath: requiredString(raw, 'assetPath', basePath),
    fallback: parseFallback(raw.fallback, basePath),
  };
};

export const parseOptionalMediaManifest = (raw: unknown): OptionalMediaManifest => {
  if (!isRecord(raw)) {
    throw new Error('optional-media.json must be an object');
  }
  if (raw.schemaVersion !== OPTIONAL_MEDIA_SCHEMA_VERSION) {
    throw new Error(
      `optional-media.json.schemaVersion must be "${OPTIONAL_MEDIA_SCHEMA_VERSION}"`,
    );
  }
  if (!Array.isArray(raw.presentations)) {
    throw new Error('optional-media.json.presentations must be an array');
  }
  const presentations = raw.presentations.map((entry, index) =>
    parsePresentation(entry, index),
  );
  const seen = new Set<string>();
  for (const [index, presentation] of presentations.entries()) {
    if (seen.has(presentation.id)) {
      throw new Error(`optional-media.json.presentations[${index}].id duplicates "${presentation.id}"`);
    }
    seen.add(presentation.id);
    if (presentation.versionIds.length === 0 && presentation.sceneIds.length === 0) {
      throw new Error(
        `optional-media.json.presentations[${index}] must reference at least one versionId or sceneId`,
      );
    }
  }
  return {
    schemaVersion: OPTIONAL_MEDIA_SCHEMA_VERSION,
    presentations,
  };
};

export const loadOptionalMediaManifest = (): OptionalMediaManifest =>
  parseOptionalMediaManifest(optionalMediaJson);

export const listKnownOptionalMediaSceneIds = (): string[] => {
  const sceneIds = [
    'opening',
    'ending',
    'run-summary',
    'trace-replay',
    'dashboard',
  ];
  for (const scenarioPackId of listScenarioPackIds()) {
    sceneIds.push(`scenario:${scenarioPackId}`);
  }
  for (const extensionPackId of listExtensionPackIds()) {
    const pack = loadExtensionPack(extensionPackId);
    for (const preset of pack.components.scenarioPresets) {
      sceneIds.push(`preset:${extensionPackId}:${preset.id}`);
    }
  }
  return [...new Set(sceneIds)].sort();
};

const diagnostic = (
  entry: Omit<OptionalMediaDiagnostic, 'suggestion'> & { suggestion?: string },
): OptionalMediaDiagnostic => ({
  severity: entry.severity,
  ruleId: entry.ruleId,
  path: entry.path,
  message: entry.message,
  ...(entry.suggestion ? { suggestion: entry.suggestion } : {}),
});

const isUnsafeAssetPath = (assetPath: string): boolean =>
  path.isAbsolute(assetPath) ||
  assetPath.includes('..') ||
  /^https?:\/\//i.test(assetPath) ||
  !assetPath.startsWith('media/');

export const collectOptionalMediaDiagnostics = (
  manifest: OptionalMediaManifest,
): OptionalMediaDiagnostic[] => {
  const diagnostics: OptionalMediaDiagnostic[] = [];
  const knownScenes = new Set(listKnownOptionalMediaSceneIds());

  for (const [index, presentation] of manifest.presentations.entries()) {
    const basePath = `optional-media.json.presentations[${index}]`;
    if (presentation.required) {
      diagnostics.push(
        diagnostic({
          severity: 'blocker',
          ruleId: 'optional-media-required-forbidden',
          path: `${basePath}.required`,
          message: `Presentation "${presentation.id}" marks media as required; required media is forbidden.`,
          suggestion: 'Set required=false and provide fallback text/ASCII behavior.',
        }),
      );
    }
    for (const versionId of presentation.versionIds) {
      try {
        validateVersionId(versionId);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        diagnostics.push(
          diagnostic({
            severity: 'blocker',
            ruleId: 'optional-media-invalid-version',
            path: `${basePath}.versionIds`,
            message,
          }),
        );
      }
    }
    for (const sceneId of presentation.sceneIds) {
      if (!knownScenes.has(sceneId)) {
        diagnostics.push(
          diagnostic({
            severity: 'blocker',
            ruleId: 'optional-media-invalid-scene',
            path: `${basePath}.sceneIds`,
            message: `Scene id "${sceneId}" is not registered. Known scenes: ${[...knownScenes].join(', ')}.`,
          }),
        );
      }
    }
    if (isUnsafeAssetPath(presentation.assetPath)) {
      diagnostics.push(
        diagnostic({
          severity: 'blocker',
          ruleId: 'optional-media-local-asset-only',
          path: `${basePath}.assetPath`,
          message: 'Optional media assetPath must be a repo-relative media/ path, not absolute, remote, or parent-relative.',
        }),
      );
    }
    if (
      (presentation.fallback.mode === 'ascii' || presentation.fallback.mode === 'text') &&
      !isNonEmptyString(presentation.fallback.text)
    ) {
      diagnostics.push(
        diagnostic({
          severity: 'blocker',
          ruleId: 'optional-media-fallback-required',
          path: `${basePath}.fallback.text`,
          message: 'ASCII/text fallback media entries must provide fallback text.',
        }),
      );
    }
  }

  return diagnostics;
};

const assetExists = async (repoRoot: string, assetPath: string): Promise<boolean> => {
  try {
    await access(path.resolve(repoRoot, assetPath));
    return true;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
};

export const buildOptionalMediaReport = async (
  options: {
    manifest?: OptionalMediaManifest;
    repoRoot?: string;
    checkFiles?: boolean;
  } = {},
): Promise<OptionalMediaReport> => {
  const manifest = options.manifest ?? loadOptionalMediaManifest();
  const repoRoot = options.repoRoot ?? process.cwd();
  const diagnostics = collectOptionalMediaDiagnostics(manifest);
  const presentations: OptionalMediaResolvedPresentation[] = [];

  for (const presentation of manifest.presentations) {
    const assetStatus = options.checkFiles
      ? (await assetExists(repoRoot, presentation.assetPath) ? 'present' : 'missing')
      : 'not_checked';
    presentations.push({
      id: presentation.id,
      kind: presentation.kind,
      assetPath: presentation.assetPath,
      assetStatus,
      fallbackMode: presentation.fallback.mode,
      ...(presentation.fallback.text ? { fallbackText: presentation.fallback.text } : {}),
      required: presentation.required,
    });
  }

  const blockers = diagnostics.filter((entry) => entry.severity === 'blocker').length;
  const warnings = diagnostics.filter((entry) => entry.severity === 'warning').length;
  return {
    schemaVersion: OPTIONAL_MEDIA_SCHEMA_VERSION,
    ok: blockers === 0,
    summary: {
      presentations: presentations.length,
      blockers,
      warnings,
      missingAssets: presentations.filter((entry) => entry.assetStatus === 'missing').length,
    },
    diagnostics,
    presentations,
    knownSceneIds: listKnownOptionalMediaSceneIds(),
  };
};

export const runOptionalMediaHeadlessCheck = (
  manifest: OptionalMediaManifest = loadOptionalMediaManifest(),
): OptionalMediaHeadlessCheck => {
  const diagnostics = collectOptionalMediaDiagnostics(manifest);
  const output = render(start('optional-media-headless'));
  const fallbackPresentForEveryPresentation = manifest.presentations.every(
    (presentation) =>
      presentation.fallback.mode === 'silent' || isNonEmptyString(presentation.fallback.text),
  );
  return {
    ok:
      diagnostics.every((entry) => entry.severity !== 'blocker') &&
      output.trim().length > 0 &&
      output.includes('@') &&
      fallbackPresentForEveryPresentation,
    renderNonEmpty: output.trim().length > 0,
    renderHasAsciiMarkers: output.includes('@') && output.includes('Floor:') && output.includes('Turn:'),
    fallbackPresentForEveryPresentation,
    diagnostics,
  };
};

export const buildOptionalMediaAcceptanceCheck = (
  manifest: OptionalMediaManifest = loadOptionalMediaManifest(),
): {
  id: string;
  name: string;
  status: 'pass' | 'fail';
  summary: string;
  details?: string[];
} => {
  const diagnostics = collectOptionalMediaDiagnostics(manifest);
  const blockers = diagnostics.filter((entry) => entry.severity === 'blocker');
  return {
    id: 'optional_media_not_required',
    name: 'Optional media dependency',
    status: blockers.length === 0 ? 'pass' : 'fail',
    summary:
      blockers.length === 0
        ? 'Optional media metadata is additive; no media is required for play or review.'
        : `${blockers.length} optional-media blocker(s) would make media required or invalid.`,
    ...(blockers.length > 0
      ? {
          details: blockers.map(
            (entry) => `${entry.ruleId}: ${entry.path}: ${entry.message}`,
          ),
        }
      : {}),
  };
};

export const renderOptionalMediaMarkdown = (report: OptionalMediaReport): string => {
  const lines = [
    '# Optional Media Report',
    '',
    `- Schema version: ${report.schemaVersion}`,
    `- Status: ${report.ok ? 'pass' : 'blocked'}`,
    `- Presentations: ${report.summary.presentations}`,
    `- Missing assets: ${report.summary.missingAssets}`,
    `- Blockers: ${report.summary.blockers}`,
    `- Warnings: ${report.summary.warnings}`,
    '',
    '## Presentations',
  ];
  for (const presentation of report.presentations) {
    lines.push(
      '',
      `- ${presentation.id} (${presentation.kind})`,
      `  - Asset: ${presentation.assetPath} [${presentation.assetStatus}]`,
      `  - Required: ${presentation.required ? 'yes' : 'no'}`,
      `  - Fallback: ${presentation.fallbackMode}${
        presentation.fallbackText ? ` - ${presentation.fallbackText}` : ''
      }`,
    );
  }

  lines.push('', '## Findings');
  if (report.diagnostics.length === 0) {
    lines.push('', '- No blockers or warnings.');
  } else {
    for (const finding of report.diagnostics) {
      lines.push('', `- ${finding.severity.toUpperCase()} [${finding.ruleId}] ${finding.path}`);
      lines.push(`  - ${finding.message}`);
      if (finding.suggestion) {
        lines.push(`  - Suggestion: ${finding.suggestion}`);
      }
    }
  }
  return `${lines.join('\n')}\n`;
};

export const writeOptionalMediaReport = async (
  report: OptionalMediaReport,
  outputPath: string,
  format: 'json' | 'markdown' = 'json',
): Promise<void> => {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    format === 'markdown' ? renderOptionalMediaMarkdown(report) : stringifyDeterministicJson(report),
    'utf8',
  );
};
