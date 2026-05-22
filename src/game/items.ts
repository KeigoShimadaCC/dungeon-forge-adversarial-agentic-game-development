import {
  type GameContent,
  type ItemDefinition,
  loadGameContent,
  POTION_ITEM_ID,
} from './content.js';

export { POTION_ITEM_ID } from './content.js';
export type { ItemDefinition } from './content.js';

let cachedContent: GameContent | undefined;

function getContent(): GameContent {
  cachedContent ??= loadGameContent();
  return cachedContent;
}

export function getAllItems(): readonly ItemDefinition[] {
  return getContent().items.items;
}

export function getItemById(id: string): ItemDefinition | undefined {
  return getAllItems().find((item) => item.id === id);
}

export function getPotion(): ItemDefinition {
  const potion = getItemById(POTION_ITEM_ID);
  if (!potion) {
    throw new Error(`Missing required item content: ${POTION_ITEM_ID}`);
  }
  return potion;
}
