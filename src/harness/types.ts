import type {
  GameEvent,
  JsonObject,
  PlayerAction,
  TerminalStatus,
} from '../game/types.js';

export interface StateSummary {
  turn: number;
  floor: number;
  hp: number;
  maxHp: number;
  terminalStatus: TerminalStatus;
  playerPosition: { x: number; y: number };
  inventory: string[];
  enemyCount: number;
  itemCount: number;
  npcCount: number;
  inDialogue: boolean;
  dialogueNodeId?: string;
}

export const LLM_PLAYER_PERSONA_IDS = [
  'careful_player',
  'naive_player',
  'bug_hunter',
] as const;

export type LlmPlayerPersona = (typeof LLM_PLAYER_PERSONA_IDS)[number];

export type LlmFallbackReason =
  | 'malformed_json'
  | 'missing_action_id'
  | 'missing_action_type'
  | 'invalid_action_id'
  | 'invalid_action_type'
  | 'timeout'
  | 'client_error';

export interface TraceDecisionMetadata {
  persona?: LlmPlayerPersona;
  fallback_used?: boolean;
  fallback_reason?: LlmFallbackReason;
  invalid_action_id?: string;
  invalid_action_type?: string;
  model_reason?: string;
  error_category?: LlmFallbackReason;
}

export interface TraceStep {
  turn: number;
  state_summary: StateSummary;
  render: string;
  available_actions: PlayerAction[];
  chosen_action: PlayerAction;
  reason?: string;
  decision_metadata?: TraceDecisionMetadata;
  valid: boolean;
  events: GameEvent[];
  terminalStatus: TerminalStatus;
}

export interface MapFloorGenerationRecord {
  floor: number;
  used_fallback: boolean;
  generation_attempt: number;
  width: number;
  height: number;
}

export interface PlacementShortfall {
  floor: number;
  slot: 'enemy' | 'item' | 'npc';
  requested: number;
  placed: number;
}

export type ProblemRunCategoryKind =
  | 'aborted'
  | 'softlock'
  | 'invalid_actions'
  | 'impossible_placement'
  | 'repeated_failure';

export interface ProblemRunCategory {
  category: ProblemRunCategoryKind;
  code: string;
  message?: string;
  detail?: JsonObject;
}

export interface ProblemRunDiagnostics {
  categories: ProblemRunCategory[];
  primary_category: ProblemRunCategoryKind | 'none';
  abort_cause?: string;
}

export interface TraceMetadata {
  map_generation: {
    floors: MapFloorGenerationRecord[];
  };
  placement?: {
    shortfalls: PlacementShortfall[];
  };
  problem_run?: ProblemRunDiagnostics;
}

export interface EnemyBehaviorMetrics {
  enemy_attack: number;
  enemy_move: number;
  enemy_wait: number;
  enemy_steal: number;
  enemy_phase: number;
  enemy_defeated: number;
}

export interface ItemEvaluationMetrics {
  use_item_turns_available: number;
  items_used: number;
  tactical_items_used: number;
  item_pickup_actions: number;
}

export interface PlaythroughTrace {
  version: string;
  seed: string;
  persona: string;
  result: TerminalStatus;
  turns: number;
  steps: TraceStep[];
  metadata?: TraceMetadata;
}

export interface ReviewerScores {
  fun: number | null;
  clarity: number | null;
  fairness: number | null;
  tactical_depth: number | null;
  replay_value: number | null;
}

export interface ScorecardReviewInput {
  scores?: Partial<ReviewerScores>;
  review_path?: string;
  review_id?: string;
}

export type MockReviewScoreInput = ScorecardReviewInput;

export interface PlaythroughScorecard {
  version: string;
  seed: string;
  persona: string;
  result: TerminalStatus;
  turns: number;
  floors_reached: number;
  damage_taken: number;
  items_used: number;
  enemies_defeated: number;
  invalid_actions: number;
  softlocks: number;
  reviewer_scores: ReviewerScores;
  trace_path: string;
  review_path?: string;
  review_id?: string;
  enemy_behaviors?: EnemyBehaviorMetrics;
  item_evaluation?: ItemEvaluationMetrics;
  diagnostics?: ProblemRunDiagnostics;
}

export interface PolicyDecision {
  action: PlayerAction;
  reason?: string;
  decision_metadata?: TraceDecisionMetadata;
}

export type HarnessPlayerPolicy = (
  input: import('./baseline-players/types.js').BaselinePlayerInput,
) => PolicyDecision | PlayerAction | Promise<PolicyDecision | PlayerAction>;

export const actionSnapshot = (action: PlayerAction): PlayerAction => ({
  id: action.id,
  type: action.type,
  label: action.label,
  ...(action.payload ? { payload: action.payload as JsonObject } : {}),
});

export const eventSnapshot = (event: GameEvent): GameEvent => ({
  id: event.id,
  type: event.type,
  message: event.message,
  turn: event.turn,
  ...(event.payload ? { payload: event.payload } : {}),
});
