import { DEFAULT_LLM_MODEL, LLM_MODEL_ENV } from '../../harness/llm-provider-config.js';
import { stringifyDeterministicJson } from '../../harness/json.js';
import { listControlRoomReviewerPersonas } from './personas.js';
import {
  CONTROL_ROOM_ACTOR_IDS,
  CONTROL_ROOM_ROLE_CATALOG_SCHEMA_VERSION,
  type ControlRoomActorId,
  type ControlRoomModelChoice,
  type ControlRoomPromptVisibility,
  type ControlRoomRoleCatalog,
  type ControlRoomRoleCatalogEntry,
} from './types.js';

const configuredLlmChoice = (id: string, displayName: string): ControlRoomModelChoice => ({
  id,
  displayName,
  providerKind: 'configured_llm_provider',
  modelLabel: DEFAULT_LLM_MODEL,
  default: true,
  advisoryOnly: true,
  providerCallEnabled: false,
  credentialsRequiredForRealProvider: true,
  configurableEnvVars: [LLM_MODEL_ENV],
  notes: [
    'Metadata only: this catalog does not resolve provider configuration.',
    'Later handoff phases may use this label to preselect an optional provider-backed run.',
  ],
});

const localDeterministicChoice: ControlRoomModelChoice = {
  id: 'local_deterministic',
  displayName: 'Local deterministic harness',
  providerKind: 'local_deterministic',
  modelLabel: 'deterministic local logic',
  default: true,
  advisoryOnly: true,
  providerCallEnabled: false,
  credentialsRequiredForRealProvider: false,
  configurableEnvVars: [],
  notes: [
    'Credential-free default behavior for gameplay, tests, scorecards, and deterministic reviews.',
  ],
};

const humanChoice: ControlRoomModelChoice = {
  id: 'human_input',
  displayName: 'Human input',
  providerKind: 'human',
  modelLabel: 'human-authored',
  default: true,
  advisoryOnly: true,
  providerCallEnabled: false,
  credentialsRequiredForRealProvider: false,
  configurableEnvVars: [],
  notes: ['Represents a person speaking or choosing; no model is selected.'],
};

const staticPromptReference = (
  label: string,
  path: string,
  description: string,
): ControlRoomPromptVisibility => ({
  level: 'safe_repo_reference',
  label,
  description,
  sourceReferences: [{ kind: 'repo_markdown', path, description }],
  diagnostics: ['Safe repo reference only; consumers should load text deliberately before display.'],
});

const dynamicPromptReference = (
  label: string,
  path: string,
  exportName: string,
  description: string,
): ControlRoomPromptVisibility => ({
  level: 'dynamic_runtime_reference',
  label,
  description,
  sourceReferences: [{ kind: 'typescript_builder', path, exportName, description }],
  diagnostics: [
    'Prompt text is assembled from runtime state and artifact evidence; catalog exposes source references instead of copied prompt text.',
  ],
});

const humanPromptReference: ControlRoomPromptVisibility = {
  level: 'not_applicable',
  label: 'Human-authored text',
  description:
    'Human comments, ideas, and decisions are captured as explicit local artifacts by later control-room phases.',
  sourceReferences: [
    {
      kind: 'human_input',
      description: 'No system prompt applies to the human actor.',
    },
  ],
  diagnostics: [],
};

export { listControlRoomReviewerPersonas } from './personas.js';

export const buildControlRoomRoleCatalog = (): ControlRoomRoleCatalog => {
  const reviewerPersonas = listControlRoomReviewerPersonas();

  return {
    schemaVersion: CONTROL_ROOM_ROLE_CATALOG_SCHEMA_VERSION,
    roles: [
      {
        id: 'game_developer',
        displayName: 'Game Developer',
        roleKind: 'developer_ai',
        shortDescription:
          'Implements bounded game improvements from trace-backed tasks after human approval.',
        defaultPromptReference: 'src/agents/prompts/developer.md',
        personas: [],
        prompts: [
          staticPromptReference(
            'Developer workflow prompt',
            'src/agents/prompts/developer.md',
            'Repo-stored instructions for bounded developer-agent tasks.',
          ),
        ],
        modelChoices: [configuredLlmChoice('configured_developer_model', 'Configured developer model')],
      },
      {
        id: 'game_reviewer',
        displayName: 'Game Reviewer',
        roleKind: 'reviewer_ai',
        shortDescription:
          'Reviews playthrough traces and scorecards through selectable evidence-grounded personas.',
        defaultPersonaId: 'careful_player',
        defaultPromptReference: 'src/agents/prompts/reviewer.md',
        personas: reviewerPersonas,
        prompts: [
          staticPromptReference(
            'Reviewer artifact prompt',
            'src/agents/prompts/reviewer.md',
            'Repo-stored structured review instructions for trace-backed critique.',
          ),
          dynamicPromptReference(
            'LLM reviewer runtime prompt',
            'src/agents/prompts/llm-reviewer.ts',
            'buildLlmReviewerPrompt',
            'Runtime prompt builder that includes selected persona, trace, scorecard, and rendered-state evidence.',
          ),
        ],
        modelChoices: [
          localDeterministicChoice,
          configuredLlmChoice('configured_reviewer_model', 'Configured reviewer model'),
        ],
      },
      {
        id: 'narrator',
        displayName: 'Narrator',
        roleKind: 'narrator_ai',
        shortDescription:
          'Summarizes versions and control-room context for humans without changing game state.',
        personas: [],
        prompts: [
          {
            level: 'safe_repo_reference',
            label: 'Narration role description',
            description:
              'No runnable narrator prompt exists yet; later phases should derive narration from version summaries and trace-backed artifacts.',
            sourceReferences: [
              {
                kind: 'repo_markdown',
                path: 'phase-plans/PHASE-27B-NARRATED-VERSION-SUMMARIES.md',
                description: 'Future narrator behavior plan and credential-free fallback boundary.',
              },
            ],
            diagnostics: [
              'Narrator is display metadata in this phase, not an executable agent.',
            ],
          },
        ],
        modelChoices: [configuredLlmChoice('configured_narrator_model', 'Configured narrator model')],
      },
      {
        id: 'human',
        displayName: 'Human',
        roleKind: 'human',
        shortDescription:
          'Represents human ideas, comments, approvals, and base-version choices in control-room history.',
        personas: [],
        prompts: [humanPromptReference],
        modelChoices: [humanChoice],
      },
    ],
  };
};

export const listControlRoomRoles = (): ControlRoomRoleCatalogEntry[] =>
  buildControlRoomRoleCatalog().roles.map((role) => ({
    ...role,
    personas: role.personas.map((persona) => ({
      ...persona,
      emphasis: [...persona.emphasis],
    })),
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

export const getControlRoomRole = (
  id: ControlRoomActorId,
): ControlRoomRoleCatalogEntry | undefined =>
  listControlRoomRoles().find((role) => role.id === id);

export const assertCompleteControlRoomRoleCatalog = (
  catalog: ControlRoomRoleCatalog,
): void => {
  const ids = new Set(catalog.roles.map((role) => role.id));
  for (const requiredId of CONTROL_ROOM_ACTOR_IDS) {
    if (!ids.has(requiredId)) {
      throw new Error(`Control-room role catalog is missing required actor: ${requiredId}`);
    }
  }
};

export const stringifyControlRoomRoleCatalog = (
  catalog: ControlRoomRoleCatalog = buildControlRoomRoleCatalog(),
): string => stringifyDeterministicJson(catalog);
