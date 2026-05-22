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
}

export interface TraceStep {
  turn: number;
  state_summary: StateSummary;
  render: string;
  available_actions: PlayerAction[];
  chosen_action: PlayerAction;
  reason?: string;
  valid: boolean;
  events: GameEvent[];
  terminalStatus: TerminalStatus;
}

export interface PlaythroughTrace {
  version: string;
  seed: string;
  persona: string;
  result: TerminalStatus;
  turns: number;
  steps: TraceStep[];
}

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
  trace_path: string;
}

export interface PolicyDecision {
  action: PlayerAction;
  reason?: string;
}

export type HarnessPlayerPolicy = (
  input: import('./baseline-players/types.js').BaselinePlayerInput,
) => PolicyDecision | PlayerAction;

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
