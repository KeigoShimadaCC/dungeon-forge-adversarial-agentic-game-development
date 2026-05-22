import type { GameState, PlayerAction } from '../../game/types.js';

/** Context passed to a baseline policy each turn; policies must not mutate these values. */
export interface BaselinePlayerInput {
  state: GameState;
  renderedState: string;
  availableActions: readonly PlayerAction[];
  turn: number;
}

/** Chooses one action from the current `availableActions` list without mutating game state. */
export type BaselinePlayerPolicy = (input: BaselinePlayerInput) => PlayerAction;
