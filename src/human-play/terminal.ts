import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import type { PlayerAction } from '../game/types.js';

import { formatActionMenu, formatHumanPlayScreen } from './display.js';
import { runHumanPlaySession } from './session.js';
import type { HumanPlayChooseInput, HumanPlaySessionOptions, HumanPlaySessionResult } from './types.js';

import { HumanPlayAbortError } from './abort.js';

export { HumanPlayAbortError };

const parseTerminalChoice = (
  raw: string,
  actions: readonly PlayerAction[],
): PlayerAction | 'abort' | undefined => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (trimmed === 'q' || trimmed === 'quit' || trimmed === 'abort') {
    return 'abort';
  }

  const asNumber = Number.parseInt(trimmed, 10);
  if (!Number.isNaN(asNumber) && asNumber >= 1 && asNumber <= actions.length) {
    return actions[asNumber - 1];
  }

  return actions.find(
    (action) => action.id === trimmed || action.id.toLowerCase() === trimmed.toLowerCase(),
  );
};

export const createTerminalChooser = (
  rl: readline.Interface,
): ((chooseInput: HumanPlayChooseInput) => Promise<PlayerAction>) => {
  return async (chooseInput) => {
    process.stdout.write(
      [
        formatHumanPlayScreen(chooseInput.state, chooseInput.render),
        '',
        formatActionMenu(chooseInput.actions),
        '',
        'Enter action number, action id, or "q" to abort: ',
      ].join('\n'),
    );

    const answer = await rl.question('');
    const parsed = parseTerminalChoice(answer, chooseInput.actions);
    if (parsed === 'abort') {
      throw new HumanPlayAbortError();
    }
    if (!parsed) {
      throw new Error('Invalid choice. Enter a listed action number or id.');
    }
    return parsed;
  };
};

export const runTerminalHumanPlay = async (
  options: HumanPlaySessionOptions,
): Promise<HumanPlaySessionResult> => {
  const rl = readline.createInterface({ input, output });
  try {
    return await runHumanPlaySession({
      ...options,
      mode: 'terminal',
      chooseAction: createTerminalChooser(rl),
    });
  } finally {
    rl.close();
  }
};
