import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import enemiesJson from '../../content/enemies.json' with { type: 'json' };
import eventsJson from '../../content/events.json' with { type: 'json' };
import extensionPacksManifestJson from '../../content/extension-packs.json' with { type: 'json' };
import floorRulesJson from '../../content/floor-rules.json' with { type: 'json' };
import itemsJson from '../../content/items.json' with { type: 'json' };
import scenarioPacksManifestJson from '../../content/scenario-packs.json' with { type: 'json' };
import trapsJson from '../../content/traps.json' with { type: 'json' };
import {
  validateContentReferences,
  validateEnemiesBundle,
  validateEventsBundle,
  validateFloorRulesBundle,
  validateItemsBundle,
  validateTrapsBundle,
  type DialogueTreeDefinition,
  type GameContent,
} from '../game/content.js';
import {
  listScenarioPackIds,
  loadScenarioPackContent,
  loadScenarioPacksManifest,
  validateScenarioPacksManifest,
} from '../game/scenario-packs.js';
import {
  listExtensionPackIds,
  loadExtensionPack,
  loadExtensionPacksManifest,
  validateExtensionPacksManifest,
  type ExtensionPack,
} from './extension-packs.js';
import { stringifyDeterministicJson } from './json.js';

export const CONTENT_GOVERNANCE_SCHEMA_VERSION = '19B' as const;
export const DEFAULT_CONTENT_GOVERNANCE_REPORT_PATH =
  'runs/content-governance/content_governance_report.json';

const MAX_GOVERNED_TURNS_PER_FLOOR = 500;
const MAX_GOVERNED_MAP_AREA = 2500;
const MIN_CLEAR_TEXT_LENGTH = 12;

export type ContentGovernanceSeverity = 'blocker' | 'warning';
export type ContentGovernanceCategory =
  | 'schema'
  | 'reference'
  | 'finite_bounds'
  | 'forbidden_scope'
  | 'text_clarity'
  | 'diff_summary';

export interface ContentGovernanceDiagnostic {
  severity: ContentGovernanceSeverity;
  category: ContentGovernanceCategory;
  ruleId: string;
  source: string;
  path: string;
  message: string;
  suggestion?: string;
}

export interface RawGameContentBundles {
  items: unknown;
  enemies: unknown;
  floors: unknown;
  traps: unknown;
  events: unknown;
}

export interface ContentGovernanceSourceResult {
  source: string;
  status: 'pass' | 'blocked' | 'warning';
  diagnostics: ContentGovernanceDiagnostic[];
}

export interface ContentDiffBucket {
  added: string[];
  removed: string[];
  changed: string[];
  unchanged: number;
}

export interface ContentDiffSummary {
  baseSource: string;
  candidateSource: string;
  buckets: {
    items: ContentDiffBucket;
    enemies: ContentDiffBucket;
    traps: ContentDiffBucket;
    floors: ContentDiffBucket;
    floorEvents: ContentDiffBucket;
    npcs: ContentDiffBucket;
    dialogueTrees: ContentDiffBucket;
  };
}

export interface ContentGovernanceReport {
  schemaVersion: typeof CONTENT_GOVERNANCE_SCHEMA_VERSION;
  ok: boolean;
  summary: {
    sourcesChecked: number;
    blockers: number;
    warnings: number;
    diffSummaries: number;
  };
  sources: ContentGovernanceSourceResult[];
  diagnostics: ContentGovernanceDiagnostic[];
  diffSummaries: ContentDiffSummary[];
}

export interface RunContentGovernanceOptions {
  rawContent?: RawGameContentBundles;
  sourceLabel?: string;
  includeScenarioPacks?: boolean;
  includeExtensionPacks?: boolean;
}

interface TextSurface {
  source: string;
  path: string;
  text: string;
  kind: 'description' | 'label' | 'narrative' | 'instruction' | 'notes';
}

const FORBIDDEN_SCOPE_RULES = [
  {
    ruleId: 'forbidden-infinite-play',
    pattern: /\binfinite\b|\bunbounded\b|\bno-?ending\b|\bnever ends\b|\bendless\b/i,
    message: 'Content must not require infinite, no-ending, or unbounded play.',
  },
  {
    ruleId: 'forbidden-unstructured-commands',
    pattern: /\bunstructured command\b|\bfree-?form command\b|\bfree text command\b|\bopen-ended text\b/i,
    message: 'Content must not require unstructured or free-form player commands.',
  },
  {
    ruleId: 'forbidden-required-media',
    pattern: /\bimage-?only\b|\baudio-?only\b|\brequires?\b.*\b(image|audio|media|voice|video|visual)\b/i,
    message: 'Content must not require images, audio, video, voice, or other media for core play.',
  },
  {
    ruleId: 'forbidden-external-service-gameplay',
    pattern: /\brequires?\b.*\b(api|internet|network|server|external service)\b|\bexternal service\b.*\brequired\b/i,
    message: 'Content must not require external services during gameplay.',
  },
  {
    ruleId: 'forbidden-real-time-play',
    pattern: /\breal-?time\b|\btiming-based\b|\breaction-based\b/i,
    message: 'Content must not require real-time, timing-based, or reaction-based play.',
  },
] as const;

export const CURRENT_CONTENT_BUNDLES: RawGameContentBundles = {
  items: itemsJson,
  enemies: enemiesJson,
  floors: floorRulesJson,
  traps: trapsJson,
  events: eventsJson,
};

const diagnostic = (
  entry: Omit<ContentGovernanceDiagnostic, 'suggestion'> & { suggestion?: string },
): ContentGovernanceDiagnostic => ({
  severity: entry.severity,
  category: entry.category,
  ruleId: entry.ruleId,
  source: entry.source,
  path: entry.path,
  message: entry.message,
  ...(entry.suggestion ? { suggestion: entry.suggestion } : {}),
});

const sourceStatus = (
  diagnostics: readonly ContentGovernanceDiagnostic[],
): ContentGovernanceSourceResult['status'] => {
  if (diagnostics.some((entry) => entry.severity === 'blocker')) {
    return 'blocked';
  }
  if (diagnostics.some((entry) => entry.severity === 'warning')) {
    return 'warning';
  }
  return 'pass';
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const validateRawGameContent = (raw: RawGameContentBundles): GameContent => {
  const content: GameContent = {
    items: validateItemsBundle(raw.items),
    enemies: validateEnemiesBundle(raw.enemies),
    floors: validateFloorRulesBundle(raw.floors),
    traps: validateTrapsBundle(raw.traps),
    events: validateEventsBundle(raw.events),
  };
  validateContentReferences(content);
  return content;
};

const collectContentTextSurfaces = (content: GameContent, source: string): TextSurface[] => {
  const surfaces: TextSurface[] = [];
  for (const item of content.items.items) {
    surfaces.push(
      { source, path: `items.${item.id}.displayName`, text: item.displayName, kind: 'label' },
      { source, path: `items.${item.id}.description`, text: item.description, kind: 'description' },
      { source, path: `items.${item.id}.validUse`, text: item.validUse, kind: 'instruction' },
    );
  }
  for (const enemy of content.enemies.enemies) {
    surfaces.push(
      { source, path: `enemies.${enemy.id}.displayName`, text: enemy.displayName, kind: 'label' },
      { source, path: `enemies.${enemy.id}.description`, text: enemy.description, kind: 'description' },
    );
  }
  for (const trap of content.traps.traps) {
    surfaces.push(
      { source, path: `traps.${trap.id}.displayName`, text: trap.displayName, kind: 'label' },
      { source, path: `traps.${trap.id}.description`, text: trap.description, kind: 'description' },
    );
  }
  surfaces.push(
    { source, path: 'events.opening.text', text: content.events.opening.text, kind: 'narrative' },
    { source, path: 'events.ending.text', text: content.events.ending.text, kind: 'narrative' },
  );
  for (const event of content.events.floorEvents) {
    surfaces.push({
      source,
      path: `events.floorEvents.${event.id}.text`,
      text: event.text,
      kind: 'narrative',
    });
  }
  for (const npc of content.events.npcs) {
    surfaces.push({
      source,
      path: `events.npcs.${npc.id}.displayName`,
      text: npc.displayName,
      kind: 'label',
    });
  }
  for (const tree of content.events.dialogueTrees) {
    collectDialogueTreeText(tree, source, surfaces);
  }
  return surfaces;
};

const collectDialogueTreeText = (
  tree: DialogueTreeDefinition,
  source: string,
  surfaces: TextSurface[],
): void => {
  for (const node of tree.nodes) {
    surfaces.push({
      source,
      path: `events.dialogueTrees.${tree.id}.nodes.${node.id}.text`,
      text: node.text,
      kind: 'narrative',
    });
    for (const choice of node.choices) {
      surfaces.push({
        source,
        path: `events.dialogueTrees.${tree.id}.nodes.${node.id}.choices.${choice.id}.label`,
        text: choice.label,
        kind: 'label',
      });
    }
  }
};

const collectExtensionTextSurfaces = (pack: ExtensionPack): TextSurface[] => {
  const source = `extension pack:${pack.id}`;
  const surfaces: TextSurface[] = [
    { source, path: 'label', text: pack.label, kind: 'label' },
    { source, path: 'description', text: pack.description, kind: 'description' },
  ];
  for (const persona of pack.components.reviewerPersonas) {
    if (persona.notes) {
      surfaces.push({
        source,
        path: `reviewerPersonas.${persona.id}.notes`,
        text: persona.notes,
        kind: 'notes',
      });
    }
  }
  for (const preset of pack.components.scenarioPresets) {
    surfaces.push(
      {
        source,
        path: `scenarioPresets.${preset.id}.label`,
        text: preset.label,
        kind: 'label',
      },
      {
        source,
        path: `scenarioPresets.${preset.id}.description`,
        text: preset.description,
        kind: 'description',
      },
    );
  }
  return surfaces;
};

const collectForbiddenScopeDiagnostics = (
  surfaces: readonly TextSurface[],
): ContentGovernanceDiagnostic[] => {
  const diagnostics: ContentGovernanceDiagnostic[] = [];
  for (const surface of surfaces) {
    for (const rule of FORBIDDEN_SCOPE_RULES) {
      if (rule.pattern.test(surface.text)) {
        diagnostics.push(
          diagnostic({
            severity: 'blocker',
            category: 'forbidden_scope',
            ruleId: rule.ruleId,
            source: surface.source,
            path: surface.path,
            message: rule.message,
            suggestion: 'Rewrite this content so core gameplay remains finite, local, turn-based, text/ASCII, and structured-action based.',
          }),
        );
      }
    }
  }
  return diagnostics;
};

const collectTextClarityDiagnostics = (
  surfaces: readonly TextSurface[],
): ContentGovernanceDiagnostic[] =>
  surfaces
    .filter(
      (surface) =>
        (surface.kind === 'description' ||
          surface.kind === 'narrative' ||
          surface.kind === 'instruction' ||
          surface.kind === 'notes') &&
        surface.text.trim().length < MIN_CLEAR_TEXT_LENGTH,
    )
    .map((surface) =>
      diagnostic({
        severity: 'warning',
        category: 'text_clarity',
        ruleId: 'short-clear-text',
        source: surface.source,
        path: surface.path,
        message: `Text is shorter than ${MIN_CLEAR_TEXT_LENGTH} characters and may be unclear to reviewers.`,
        suggestion: 'Use a short but concrete description of the gameplay role or reviewer-relevant behavior.',
      }),
    );

const collectFiniteBoundsDiagnostics = (
  content: GameContent,
  source: string,
): ContentGovernanceDiagnostic[] => {
  const diagnostics: ContentGovernanceDiagnostic[] = [];
  if (content.floors.floors.length === 0) {
    diagnostics.push(
      diagnostic({
        severity: 'blocker',
        category: 'finite_bounds',
        ruleId: 'finite-floor-list',
        source,
        path: 'floors',
        message: 'At least one finite floor is required.',
      }),
    );
  }

  const floorNumbers = content.floors.floors.map((floor) => floor.floor).sort((a, b) => a - b);
  for (let index = 0; index < floorNumbers.length; index += 1) {
    const expected = index + 1;
    if (floorNumbers[index] !== expected) {
      diagnostics.push(
        diagnostic({
          severity: 'blocker',
          category: 'finite_bounds',
          ruleId: 'contiguous-floor-progression',
          source,
          path: 'floors',
          message: `Floor progression must be contiguous from 1; expected floor ${expected} but found ${floorNumbers[index]}.`,
          suggestion: 'Use bounded consecutive floor numbers so the terminal objective can be reached predictably.',
        }),
      );
      break;
    }
  }

  for (const floor of content.floors.floors) {
    const floorPath = `floors.${floor.id}`;
    const area = floor.width * floor.height;
    if (floor.maxTurns > MAX_GOVERNED_TURNS_PER_FLOOR) {
      diagnostics.push(
        diagnostic({
          severity: 'blocker',
          category: 'finite_bounds',
          ruleId: 'bounded-floor-turns',
          source,
          path: `${floorPath}.maxTurns`,
          message: `maxTurns ${floor.maxTurns} exceeds governed bound ${MAX_GOVERNED_TURNS_PER_FLOOR}.`,
          suggestion: 'Keep authored and generated floors small enough for finite harness playthroughs.',
        }),
      );
    }
    if (area > MAX_GOVERNED_MAP_AREA) {
      diagnostics.push(
        diagnostic({
          severity: 'blocker',
          category: 'finite_bounds',
          ruleId: 'bounded-map-area',
          source,
          path: floorPath,
          message: `Map area ${area} exceeds governed bound ${MAX_GOVERNED_MAP_AREA}.`,
          suggestion: 'Keep local content compact enough for deterministic text/ASCII playthroughs.',
        }),
      );
    }
    const entityBudget =
      floor.enemySpawnCount + floor.itemSpawnCount + (floor.trapSpawnCount ?? 0);
    if (entityBudget > Math.max(0, area - 2)) {
      diagnostics.push(
        diagnostic({
          severity: 'blocker',
          category: 'finite_bounds',
          ruleId: 'spawn-budget-fits-map',
          source,
          path: floorPath,
          message: `Spawn budget ${entityBudget} does not fit map area ${area}.`,
          suggestion: 'Reduce spawn counts or increase the bounded map area.',
        }),
      );
    }
  }
  return diagnostics;
};

export const governGameContent = (
  content: GameContent,
  source: string,
): ContentGovernanceSourceResult => {
  const surfaces = collectContentTextSurfaces(content, source);
  const diagnostics = [
    ...collectFiniteBoundsDiagnostics(content, source),
    ...collectForbiddenScopeDiagnostics(surfaces),
    ...collectTextClarityDiagnostics(surfaces),
  ];
  return {
    source,
    status: sourceStatus(diagnostics),
    diagnostics,
  };
};

export const governRawGameContent = (
  raw: RawGameContentBundles,
  source = 'raw content',
): { sourceResult: ContentGovernanceSourceResult; content?: GameContent } => {
  try {
    const content = validateRawGameContent(raw);
    return {
      content,
      sourceResult: governGameContent(content, source),
    };
  } catch (error: unknown) {
    const diagnostics = [
      diagnostic({
        severity: 'blocker',
        category: 'reference',
        ruleId: 'schema-reference-validation',
        source,
        path: source,
        message: errorMessage(error),
        suggestion: 'Fix schema shape, required fields, or references before this content enters gameplay.',
      }),
    ];
    return {
      sourceResult: {
        source,
        status: 'blocked',
        diagnostics,
      },
    };
  }
};

const stableValue = (value: unknown): string => stringifyDeterministicJson(value);

const diffById = <T extends { id: string }>(
  base: readonly T[],
  candidate: readonly T[],
): ContentDiffBucket => {
  return diffByKey(base, candidate, (entry) => entry.id);
};

const diffByKey = <T>(
  base: readonly T[],
  candidate: readonly T[],
  keyFor: (entry: T) => string,
): ContentDiffBucket => {
  const baseById = new Map(base.map((entry) => [keyFor(entry), entry]));
  const candidateById = new Map(candidate.map((entry) => [keyFor(entry), entry]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];
  let unchanged = 0;

  for (const [id, candidateEntry] of candidateById) {
    const baseEntry = baseById.get(id);
    if (!baseEntry) {
      added.push(id);
    } else if (stableValue(baseEntry) !== stableValue(candidateEntry)) {
      changed.push(id);
    } else {
      unchanged += 1;
    }
  }
  for (const id of baseById.keys()) {
    if (!candidateById.has(id)) {
      removed.push(id);
    }
  }

  return {
    added: added.sort(),
    removed: removed.sort(),
    changed: changed.sort(),
    unchanged,
  };
};

export const summarizeContentDiff = (
  base: GameContent,
  candidate: GameContent,
  baseSource: string,
  candidateSource: string,
): ContentDiffSummary => ({
  baseSource,
  candidateSource,
  buckets: {
    items: diffById(base.items.items, candidate.items.items),
    enemies: diffById(base.enemies.enemies, candidate.enemies.enemies),
    traps: diffById(base.traps.traps, candidate.traps.traps),
    floors: diffByKey(base.floors.floors, candidate.floors.floors, (floor) =>
      String(floor.floor),
    ),
    floorEvents: diffById(base.events.floorEvents, candidate.events.floorEvents),
    npcs: diffById(base.events.npcs, candidate.events.npcs),
    dialogueTrees: diffById(base.events.dialogueTrees, candidate.events.dialogueTrees),
  },
});

const governExtensionPack = (pack: ExtensionPack): ContentGovernanceSourceResult => {
  const surfaces = collectExtensionTextSurfaces(pack);
  const diagnostics = [
    ...collectForbiddenScopeDiagnostics(surfaces),
    ...collectTextClarityDiagnostics(surfaces),
  ];
  return {
    source: `extension pack:${pack.id}`,
    status: sourceStatus(diagnostics),
    diagnostics,
  };
};

const sourceResultFromCaughtError = (
  source: string,
  category: ContentGovernanceCategory,
  ruleId: string,
  error: unknown,
): ContentGovernanceSourceResult => {
  const diagnostics = [
    diagnostic({
      severity: 'blocker',
      category,
      ruleId,
      source,
      path: source,
      message: errorMessage(error),
      suggestion: 'Fix this source before content governance can pass.',
    }),
  ];
  return {
    source,
    status: 'blocked',
    diagnostics,
  };
};

export const runContentGovernance = (
  options: RunContentGovernanceOptions = {},
): ContentGovernanceReport => {
  const includeScenarioPacks = options.includeScenarioPacks ?? true;
  const includeExtensionPacks = options.includeExtensionPacks ?? true;
  const sources: ContentGovernanceSourceResult[] = [];
  const diffSummaries: ContentDiffSummary[] = [];

  if (options.rawContent) {
    const result = governRawGameContent(options.rawContent, options.sourceLabel ?? 'provided content');
    sources.push(result.sourceResult);
  } else {
    const baseResult = governRawGameContent(CURRENT_CONTENT_BUNDLES, 'base content');
    sources.push(baseResult.sourceResult);
    const baseContent = baseResult.content;

    if (includeScenarioPacks && baseContent) {
      try {
        validateScenarioPacksManifest(scenarioPacksManifestJson);
        loadScenarioPacksManifest();
        for (const scenarioPackId of listScenarioPackIds()) {
          const scenarioContent = loadScenarioPackContent(scenarioPackId);
          sources.push(governGameContent(scenarioContent, `scenario pack:${scenarioPackId}`));
          diffSummaries.push(
            summarizeContentDiff(
              baseContent,
              scenarioContent,
              'base content',
              `scenario pack:${scenarioPackId}`,
            ),
          );
        }
      } catch (error: unknown) {
        sources.push(
          sourceResultFromCaughtError(
            'scenario packs',
            'schema',
            'scenario-pack-validation',
            error,
          ),
        );
      }
    }

    if (includeExtensionPacks) {
      try {
        validateExtensionPacksManifest(extensionPacksManifestJson);
        loadExtensionPacksManifest();
        for (const extensionPackId of listExtensionPackIds()) {
          const extensionPack = loadExtensionPack(extensionPackId);
          sources.push(governExtensionPack(extensionPack));
          const scenarioPackId = extensionPack.components.scenarioPack;
          if (scenarioPackId && baseContent) {
            const extensionContent = loadScenarioPackContent(scenarioPackId);
            diffSummaries.push(
              summarizeContentDiff(
                baseContent,
                extensionContent,
                'base content',
                `extension pack:${extensionPackId} default scenario`,
              ),
            );
          }
        }
      } catch (error: unknown) {
        sources.push(
          sourceResultFromCaughtError(
            'extension packs',
            'schema',
            'extension-pack-validation',
            error,
          ),
        );
      }
    }
  }

  const diagnostics = sources.flatMap((source) => source.diagnostics);
  const blockers = diagnostics.filter((entry) => entry.severity === 'blocker').length;
  const warnings = diagnostics.filter((entry) => entry.severity === 'warning').length;
  return {
    schemaVersion: CONTENT_GOVERNANCE_SCHEMA_VERSION,
    ok: blockers === 0,
    summary: {
      sourcesChecked: sources.length,
      blockers,
      warnings,
      diffSummaries: diffSummaries.length,
    },
    sources,
    diagnostics,
    diffSummaries,
  };
};

export const renderContentGovernanceMarkdown = (report: ContentGovernanceReport): string => {
  const lines = [
    '# Content Governance Report',
    '',
    `- Schema version: ${report.schemaVersion}`,
    `- Status: ${report.ok ? 'pass' : 'blocked'}`,
    `- Sources checked: ${report.summary.sourcesChecked}`,
    `- Blockers: ${report.summary.blockers}`,
    `- Warnings: ${report.summary.warnings}`,
    `- Diff summaries: ${report.summary.diffSummaries}`,
    '',
    '## Findings',
  ];

  if (report.diagnostics.length === 0) {
    lines.push('', '- No blockers or warnings.');
  } else {
    for (const finding of report.diagnostics) {
      lines.push(
        '',
        `- ${finding.severity.toUpperCase()} [${finding.ruleId}] ${finding.source} ${finding.path}`,
        `  - ${finding.message}`,
      );
      if (finding.suggestion) {
        lines.push(`  - Suggestion: ${finding.suggestion}`);
      }
    }
  }

  lines.push('', '## Diff Summaries');
  if (report.diffSummaries.length === 0) {
    lines.push('', '- No content diff summaries were generated.');
  } else {
    for (const summary of report.diffSummaries) {
      lines.push('', `### ${summary.baseSource} -> ${summary.candidateSource}`);
      for (const [name, bucket] of Object.entries(summary.buckets)) {
        const changed = [
          bucket.added.length ? `added ${bucket.added.join(', ')}` : '',
          bucket.removed.length ? `removed ${bucket.removed.join(', ')}` : '',
          bucket.changed.length ? `changed ${bucket.changed.join(', ')}` : '',
        ].filter(Boolean);
        lines.push(`- ${name}: ${changed.length > 0 ? changed.join('; ') : 'no changes'}`);
      }
    }
  }

  return `${lines.join('\n')}\n`;
};

export const writeContentGovernanceReport = async (
  report: ContentGovernanceReport,
  outputPath: string,
  format: 'json' | 'markdown' = 'json',
): Promise<void> => {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const body =
    format === 'markdown' ? renderContentGovernanceMarkdown(report) : stringifyDeterministicJson(report);
  await writeFile(outputPath, body, 'utf8');
};
