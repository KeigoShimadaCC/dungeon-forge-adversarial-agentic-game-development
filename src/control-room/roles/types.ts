export const CONTROL_ROOM_ROLE_CATALOG_SCHEMA_VERSION = 1;

export const CONTROL_ROOM_ACTOR_IDS = [
  'game_developer',
  'game_reviewer',
  'narrator',
  'human',
] as const;

export type ControlRoomActorId = (typeof CONTROL_ROOM_ACTOR_IDS)[number];

export const CONTROL_ROOM_ROLE_KINDS = [
  'developer_ai',
  'reviewer_ai',
  'narrator_ai',
  'human',
] as const;

export type ControlRoomRoleKind = (typeof CONTROL_ROOM_ROLE_KINDS)[number];

export const CONTROL_ROOM_PROMPT_VISIBILITY_LEVELS = [
  'safe_text',
  'safe_repo_reference',
  'dynamic_runtime_reference',
  'not_applicable',
] as const;

export type ControlRoomPromptVisibilityLevel =
  (typeof CONTROL_ROOM_PROMPT_VISIBILITY_LEVELS)[number];

export const CONTROL_ROOM_PROMPT_SOURCE_KINDS = [
  'repo_markdown',
  'typescript_builder',
  'human_input',
] as const;

export type ControlRoomPromptSourceKind = (typeof CONTROL_ROOM_PROMPT_SOURCE_KINDS)[number];

export interface ControlRoomPromptSourceReference {
  kind: ControlRoomPromptSourceKind;
  path?: string;
  exportName?: string;
  description: string;
}

export interface ControlRoomPromptVisibility {
  level: ControlRoomPromptVisibilityLevel;
  label: string;
  description: string;
  safeToDisplayText?: string;
  sourceReferences: ControlRoomPromptSourceReference[];
  diagnostics: string[];
}

export const CONTROL_ROOM_MODEL_PROVIDER_KINDS = [
  'local_deterministic',
  'configured_llm_provider',
  'human',
] as const;

export type ControlRoomModelProviderKind =
  (typeof CONTROL_ROOM_MODEL_PROVIDER_KINDS)[number];

export interface ControlRoomModelChoice {
  id: string;
  displayName: string;
  providerKind: ControlRoomModelProviderKind;
  modelLabel: string;
  default: boolean;
  advisoryOnly: true;
  providerCallEnabled: false;
  credentialsRequiredForRealProvider: boolean;
  configurableEnvVars: string[];
  notes: string[];
}

export interface ControlRoomPersonaChoice {
  id: string;
  displayName: string;
  description: string;
  emphasis: string[];
  playerPolicyHint?: string;
  selectable: boolean;
}

export interface ControlRoomRoleCatalogEntry {
  id: ControlRoomActorId;
  displayName: string;
  roleKind: ControlRoomRoleKind;
  shortDescription: string;
  defaultPersonaId?: string;
  defaultPromptReference?: string;
  personas: ControlRoomPersonaChoice[];
  prompts: ControlRoomPromptVisibility[];
  modelChoices: ControlRoomModelChoice[];
}

export interface ControlRoomRoleCatalog {
  schemaVersion: typeof CONTROL_ROOM_ROLE_CATALOG_SCHEMA_VERSION;
  roles: ControlRoomRoleCatalogEntry[];
}
