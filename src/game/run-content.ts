import { loadGameContent, type GameContent } from './content.js';
import { loadScenarioPackContent } from './scenario-packs.js';

let defaultContent: GameContent | undefined;

export const getDefaultGameContent = (): GameContent => {
  if (!defaultContent) {
    defaultContent = loadGameContent();
  }
  return defaultContent;
};

export const getContentForRun = (scenarioPackId?: string): GameContent => {
  if (scenarioPackId) {
    return loadScenarioPackContent(scenarioPackId);
  }
  return getDefaultGameContent();
};
