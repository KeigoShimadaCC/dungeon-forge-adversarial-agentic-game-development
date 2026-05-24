import {
  DEFAULT_RESTRICTED_AGENT_COMMAND_REGISTRY,
  type RestrictedAgentCommandRegistry,
  validateRestrictedAgentRequestedChecks,
} from './command-registry.js';
import {
  RESTRICTED_AGENT_SCHEMA_VERSION,
  isRestrictedAgentAction,
  isRestrictedAgentPatchKind,
  type RestrictedAgentBlocker,
  type RestrictedAgentModelResponse,
  type RestrictedAgentPatchIntent,
  type RestrictedAgentValidationDiagnostic,
  type RestrictedAgentValidationResult,
} from './schemas.js';

export interface RestrictedAgentResponseValidationOptions {
  commandRegistry?: RestrictedAgentCommandRegistry;
}

const RAW_AUTHORITY_FIELDS = new Set([
  'command',
  'commands',
  'shell',
  'shellCommand',
  'git',
  'gitCommand',
  'delete',
  'remove',
  'rename',
  'move',
  'packageInstall',
  'dependencyChange',
  'lockfileChange',
  'directWrite',
  'writeFile',
  'commit',
  'merge',
  'pullRequest',
]);

const FORBIDDEN_PATCH_PATHS: ReadonlyArray<{ pattern: RegExp; message: string }> = [
  { pattern: /(^|\/)\.env(\.|$|\/)?/, message: 'Credential environment files are forbidden.' },
  { pattern: /(^|\/)(credentials?|secrets?|private)(\/|\.|$)/i, message: 'Credential-like paths are forbidden.' },
  { pattern: /^runs\//, message: 'Generated evidence artifacts are forbidden patch targets.' },
  { pattern: /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/, message: 'Lockfile changes are forbidden in v1.' },
  { pattern: /(^|\/)package\.json$/, message: 'Dependency manifest changes are forbidden in v1.' },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const hasNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const normalizeRepoPath = (entry: string): string =>
  entry.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');

const pushDiagnostic = (
  diagnostics: RestrictedAgentValidationDiagnostic[],
  category: RestrictedAgentValidationDiagnostic['category'],
  field: string,
  message: string,
  entry?: string,
) => {
  diagnostics.push({ category, field, message, ...(entry ? { entry } : {}) });
};

const collectForbiddenAuthorityFields = (
  value: unknown,
  diagnostics: RestrictedAgentValidationDiagnostic[],
  field = '$',
) => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectForbiddenAuthorityFields(entry, diagnostics, `${field}[${index}]`),
    );
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    const nestedField = `${field}.${key}`;
    if (RAW_AUTHORITY_FIELDS.has(key)) {
      pushDiagnostic(
        diagnostics,
        'forbidden',
        nestedField,
        'Model output contains a forbidden direct-authority field.',
        key,
      );
    }
    collectForbiddenAuthorityFields(nested, diagnostics, nestedField);
  }
};

const validateBlockers = (
  value: unknown,
  diagnostics: RestrictedAgentValidationDiagnostic[],
): RestrictedAgentBlocker[] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    pushDiagnostic(diagnostics, 'schema', 'blockers', 'blockers must be an array.');
    return undefined;
  }

  const blockers: RestrictedAgentBlocker[] = [];
  value.forEach((entry, index) => {
    if (!isRecord(entry)) {
      pushDiagnostic(diagnostics, 'schema', `blockers[${index}]`, 'Blocker must be an object.');
      return;
    }
    if (!hasNonEmptyString(entry.code)) {
      pushDiagnostic(diagnostics, 'schema', `blockers[${index}].code`, 'Blocker code is required.');
    }
    if (!hasNonEmptyString(entry.message)) {
      pushDiagnostic(
        diagnostics,
        'schema',
        `blockers[${index}].message`,
        'Blocker message is required.',
      );
    }
    if (entry.evidence !== undefined && typeof entry.evidence !== 'string') {
      pushDiagnostic(
        diagnostics,
        'schema',
        `blockers[${index}].evidence`,
        'Blocker evidence must be a string when present.',
      );
    }
    if (hasNonEmptyString(entry.code) && hasNonEmptyString(entry.message)) {
      blockers.push({
        code: entry.code,
        message: entry.message,
        ...(typeof entry.evidence === 'string' ? { evidence: entry.evidence } : {}),
      });
    }
  });

  return blockers;
};

const validatePatchPath = (
  rawPath: string,
  field: string,
  diagnostics: RestrictedAgentValidationDiagnostic[],
) => {
  const normalized = normalizeRepoPath(rawPath);
  if (normalized.length === 0 || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    pushDiagnostic(diagnostics, 'patch', field, 'Patch path must be a safe repo-relative path.', rawPath);
  }

  for (const forbidden of FORBIDDEN_PATCH_PATHS) {
    if (forbidden.pattern.test(normalized)) {
      pushDiagnostic(diagnostics, 'forbidden', field, forbidden.message, rawPath);
    }
  }
};

const validatePatches = (
  value: unknown,
  diagnostics: RestrictedAgentValidationDiagnostic[],
): RestrictedAgentPatchIntent[] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    pushDiagnostic(diagnostics, 'schema', 'patches', 'patches must be an array.');
    return undefined;
  }

  const patches: RestrictedAgentPatchIntent[] = [];
  value.forEach((entry, index) => {
    const field = `patches[${index}]`;
    if (!isRecord(entry)) {
      pushDiagnostic(diagnostics, 'schema', field, 'Patch intent must be an object.');
      return;
    }

    if (!hasNonEmptyString(entry.path)) {
      pushDiagnostic(diagnostics, 'patch', `${field}.path`, 'Patch path is required.');
    } else {
      validatePatchPath(entry.path, `${field}.path`, diagnostics);
    }

    if (!isRestrictedAgentPatchKind(entry.kind)) {
      pushDiagnostic(diagnostics, 'patch', `${field}.kind`, 'Unsupported patch kind.');
    }

    if (entry.kind === 'create_file') {
      if (entry.expected !== undefined) {
        pushDiagnostic(
          diagnostics,
          'patch',
          `${field}.expected`,
          'create_file patches must not include expected text.',
        );
      }
    } else if (!hasNonEmptyString(entry.expected)) {
      pushDiagnostic(
        diagnostics,
        'patch',
        `${field}.expected`,
        'Exact-match patches require expected text.',
      );
    }

    if (typeof entry.replacement !== 'string') {
      pushDiagnostic(diagnostics, 'patch', `${field}.replacement`, 'Patch replacement is required.');
    }

    if (
      hasNonEmptyString(entry.path) &&
      isRestrictedAgentPatchKind(entry.kind) &&
      typeof entry.replacement === 'string' &&
      (entry.kind === 'create_file' || hasNonEmptyString(entry.expected))
    ) {
      patches.push({
        path: entry.path,
        kind: entry.kind,
        ...(typeof entry.expected === 'string' ? { expected: entry.expected } : {}),
        replacement: entry.replacement,
      });
    }
  });

  return patches;
};

const validateStringArray = (
  value: unknown,
  field: string,
  diagnostics: RestrictedAgentValidationDiagnostic[],
): string[] | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    pushDiagnostic(diagnostics, 'schema', field, `${field} must be an array.`);
    return undefined;
  }

  const strings: string[] = [];
  value.forEach((entry, index) => {
    if (!hasNonEmptyString(entry)) {
      pushDiagnostic(diagnostics, 'schema', `${field}[${index}]`, 'Entry must be a non-empty string.');
      return;
    }
    strings.push(entry);
  });
  return strings;
};

const validateActionShape = (
  response: Partial<RestrictedAgentModelResponse>,
  diagnostics: RestrictedAgentValidationDiagnostic[],
) => {
  const patchCount = response.patches?.length ?? 0;
  const requestedCheckCount = response.requestedChecks?.length ?? 0;
  const blockerCount = response.blockers?.length ?? 0;

  switch (response.action) {
    case 'propose_patch':
      if (patchCount === 0) {
        pushDiagnostic(diagnostics, 'action', 'patches', 'propose_patch requires at least one patch.');
      }
      if (blockerCount > 0) {
        pushDiagnostic(diagnostics, 'action', 'blockers', 'propose_patch must not include blockers.');
      }
      break;
    case 'request_check':
      if (requestedCheckCount === 0) {
        pushDiagnostic(
          diagnostics,
          'action',
          'requestedChecks',
          'request_check requires at least one requested check.',
        );
      }
      if (patchCount > 0) {
        pushDiagnostic(diagnostics, 'action', 'patches', 'request_check must not include patches.');
      }
      break;
    case 'explain_blocker':
      if (blockerCount === 0) {
        pushDiagnostic(diagnostics, 'action', 'blockers', 'explain_blocker requires blockers.');
      }
      if (patchCount > 0 || requestedCheckCount > 0) {
        pushDiagnostic(
          diagnostics,
          'action',
          'action',
          'explain_blocker must not include patches or requested checks.',
        );
      }
      break;
    case 'search_allowed':
    case 'read_file_range':
      if (patchCount > 0 || requestedCheckCount > 0 || blockerCount > 0) {
        pushDiagnostic(
          diagnostics,
          'action',
          'action',
          `${response.action} must not include patches, requested checks, or blockers.`,
        );
      }
      break;
    default:
      break;
  }
};

export const validateRestrictedAgentModelResponse = (
  value: unknown,
  options: RestrictedAgentResponseValidationOptions = {},
): RestrictedAgentValidationResult => {
  const diagnostics: RestrictedAgentValidationDiagnostic[] = [];
  const commandRegistry = options.commandRegistry ?? DEFAULT_RESTRICTED_AGENT_COMMAND_REGISTRY;

  if (!isRecord(value)) {
    return {
      ok: false,
      diagnostics: [
        {
          category: 'schema',
          field: '$',
          message: 'Restricted agent response must be a JSON object.',
        },
      ],
    };
  }

  collectForbiddenAuthorityFields(value, diagnostics);

  if (value.schemaVersion !== RESTRICTED_AGENT_SCHEMA_VERSION) {
    pushDiagnostic(
      diagnostics,
      'schema',
      'schemaVersion',
      `schemaVersion must be ${RESTRICTED_AGENT_SCHEMA_VERSION}.`,
    );
  }
  if (!hasNonEmptyString(value.phase)) {
    pushDiagnostic(diagnostics, 'schema', 'phase', 'phase is required.');
  }
  if (!hasNonEmptyString(value.taskId)) {
    pushDiagnostic(diagnostics, 'schema', 'taskId', 'taskId is required.');
  }
  if (!isRestrictedAgentAction(value.action)) {
    pushDiagnostic(diagnostics, 'action', 'action', 'Invalid restricted-agent action.');
  }
  if (!hasNonEmptyString(value.rationale)) {
    pushDiagnostic(diagnostics, 'schema', 'rationale', 'rationale is required.');
  }

  const patches = validatePatches(value.patches, diagnostics);
  const requestedChecks = validateStringArray(value.requestedChecks, 'requestedChecks', diagnostics);
  diagnostics.push(
    ...validateRestrictedAgentRequestedChecks(requestedChecks, commandRegistry),
  );
  const blockers = validateBlockers(value.blockers, diagnostics);

  const response: Partial<RestrictedAgentModelResponse> = {
    schemaVersion: RESTRICTED_AGENT_SCHEMA_VERSION,
    ...(hasNonEmptyString(value.phase) ? { phase: value.phase } : {}),
    ...(hasNonEmptyString(value.taskId) ? { taskId: value.taskId } : {}),
    ...(isRestrictedAgentAction(value.action) ? { action: value.action } : {}),
    ...(hasNonEmptyString(value.rationale) ? { rationale: value.rationale } : {}),
    ...(patches ? { patches } : {}),
    ...(requestedChecks ? { requestedChecks } : {}),
    ...(blockers ? { blockers } : {}),
  };

  validateActionShape(response, diagnostics);

  if (
    diagnostics.length > 0 ||
    !response.phase ||
    !response.taskId ||
    !response.action ||
    !response.rationale
  ) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    response: response as RestrictedAgentModelResponse,
    diagnostics: [],
  };
};
