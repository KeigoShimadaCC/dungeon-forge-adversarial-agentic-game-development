import type { GameState, PlayerAction } from '../game/types.js';
import type { PlaythroughTrace, TraceStep } from '../harness/types.js';

export const HUMAN_PLAYER_PERSONA = 'human_player' as const;

export type HumanPlayMode = 'terminal' | 'auto' | 'script';

export interface HumanPlayChooseInput {
  state: GameState;
  render: string;
  statusPanel: string;
  actions: readonly PlayerAction[];
}

export type HumanPlayChooser = (
  input: HumanPlayChooseInput,
) => PlayerAction | Promise<PlayerAction>;

export interface HumanPlaySessionOptions {
  seed: string;
  version?: string;
  challengeMode?: string;
  scenarioPack?: string;
  mode?: HumanPlayMode;
  /** For mode=script: pick action index (0-based) per turn, cycling last index when exhausted. */
  scriptIndices?: number[];
  maxSteps?: number;
  runsRoot?: string;
  saveTrace?: boolean;
  chooseAction?: HumanPlayChooser;
}

export interface HumanPlaySessionResult {
  trace: PlaythroughTrace;
  steps: TraceStep[];
  aborted: boolean;
  tracePath?: string;
  scorecardPath?: string;
}
