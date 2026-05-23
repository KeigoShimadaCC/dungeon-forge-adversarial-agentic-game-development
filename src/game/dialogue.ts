import {
  type DialogueChoiceDefinition,
  type DialogueNodeDefinition,
  type DialogueTreeDefinition,
  type EventsContentBundle,
  type NpcDefinition,
} from './content.js';
import { getContentForRun } from './run-content.js';
import { chooseEntityPositions, isWalkableTile } from './map.js';
import type {
  GameEvent,
  GameState,
  NarrativeState,
  NpcInstance,
  PlayerAction,
  Position,
} from './types.js';

const eventsForPack = (scenarioPackId?: string): EventsContentBundle =>
  getContentForRun(scenarioPackId).events;

const eventsForState = (state: GameState): EventsContentBundle =>
  eventsForPack(state.meta.scenarioPackId);

export const defaultNarrativeState = (): NarrativeState => ({
  seenFloorEvents: [],
});

const positionKey = (position: Position): string => `${position.x},${position.y}`;

const manhattanDistance = (a: Position, b: Position): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export const getOpeningText = (scenarioPackId?: string): string =>
  eventsForPack(scenarioPackId).opening.text;

export const getEndingText = (scenarioPackId?: string): string =>
  eventsForPack(scenarioPackId).ending.text;

const getDialogueTree = (
  treeId: string,
  eventsContent: EventsContentBundle,
): DialogueTreeDefinition => {
  const tree = eventsContent.dialogueTrees.find((candidate) => candidate.id === treeId);
  if (!tree) {
    throw new Error(`Missing dialogue tree: ${treeId}`);
  }
  return tree;
};

const getDialogueNode = (
  tree: DialogueTreeDefinition,
  nodeId: string,
): DialogueNodeDefinition => {
  const node = tree.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) {
    throw new Error(`Missing dialogue node ${nodeId} in tree ${tree.id}`);
  }
  return node;
};

const npcDefinitionForFloor = (
  floor: number,
  eventsContent: EventsContentBundle,
): NpcDefinition | undefined => eventsContent.npcs.find((npc) => npc.floor === floor);

export const placeNpcsForFloor = (params: {
  seed: string;
  floor: number;
  layout: Parameters<typeof chooseEntityPositions>[0]['layout'];
  occupied: Set<string>;
  scenarioPackId?: string;
}): NpcInstance[] => {
  const definition = npcDefinitionForFloor(params.floor, eventsForPack(params.scenarioPackId));
  if (!definition) {
    return [];
  }

  const positions = chooseEntityPositions({
    seed: params.seed,
    floor: params.floor,
    layout: params.layout,
    count: 1,
    occupied: params.occupied,
    slot: 'npc',
    safeFromPlayer: true,
  });

  return positions.map((position, index) => {
    params.occupied.add(positionKey(position));
    return {
      id: `${definition.id}-${params.floor}-${index + 1}`,
      npcId: definition.id,
      label: definition.displayName,
      glyph: definition.glyph,
      ...position,
    };
  });
};

export const applyFloorEnterEvents = (
  state: GameState,
  event: (
    turn: number,
    type: string,
    message: string,
    payload?: Record<string, string | number | boolean | null>,
  ) => GameEvent,
): GameEvent[] => {
  const triggered: GameEvent[] = [];
  for (const floorEvent of eventsForState(state).floorEvents) {
    if (floorEvent.floor !== state.floor || floorEvent.trigger !== 'on_enter') {
      continue;
    }
    if (state.narrative.seenFloorEvents.includes(floorEvent.id)) {
      continue;
    }
    state.narrative.seenFloorEvents = [
      ...state.narrative.seenFloorEvents,
      floorEvent.id,
    ];
    triggered.push(
      event(state.turn, 'floor_event', floorEvent.text, {
        eventId: floorEvent.id,
        floor: floorEvent.floor,
      }),
    );
  }
  return triggered;
};

const adjacentNpc = (state: GameState): NpcInstance | undefined =>
  state.npcs.find((npc) => manhattanDistance(state.player, npc) === 1);

const buildChoiceAction = (
  state: GameState,
  choice: DialogueChoiceDefinition,
): PlayerAction => ({
  id: `talk_choice_${choice.id}`,
  type: 'talk',
  label: choice.label,
  payload: {
    mode: 'choice',
    choiceId: choice.id,
    npcId: state.dialogue?.npcId ?? '',
    nodeId: state.dialogue?.nodeId ?? '',
    treeId: state.dialogue?.treeId ?? '',
  },
});

export const buildDialogueActions = (state: GameState): PlayerAction[] => {
  if (!state.dialogue?.active) {
    return [];
  }

  const eventsContent = eventsForState(state);
  const tree = getDialogueTree(state.dialogue.treeId, eventsContent);
  const node = getDialogueNode(tree, state.dialogue.nodeId);
  const actions = node.choices.map((choice) => buildChoiceAction(state, choice));
  actions.push({
    id: 'talk_exit',
    type: 'talk',
    label: 'End conversation',
    payload: {
      mode: 'exit',
      npcId: state.dialogue.npcId,
      npcInstanceId: state.dialogue.npcInstanceId,
    },
  });
  return actions;
};

export const buildNpcTalkActions = (state: GameState): PlayerAction[] => {
  const npc = adjacentNpc(state);
  if (!npc) {
    return [];
  }

  const definition = eventsForState(state).npcs.find((candidate) => candidate.id === npc.npcId);
  if (!definition) {
    return [];
  }

  return [
    {
      id: `talk_npc_${npc.id}`,
      type: 'talk',
      label: `Talk to ${npc.label}`,
      payload: {
        mode: 'start',
        npcId: npc.npcId,
        npcInstanceId: npc.id,
        treeId: definition.dialogueTreeId,
      },
    },
  ];
};

export const isInDialogue = (state: GameState): boolean =>
  state.dialogue?.active === true;

export const clearDialogue = (state: GameState): void => {
  delete state.dialogue;
};

export const applyTalkAction = (
  state: GameState,
  action: PlayerAction,
  event: (
    turn: number,
    type: string,
    message: string,
    payload?: Record<string, string | number | boolean | null>,
  ) => GameEvent,
): GameEvent[] => {
  const mode = action.payload?.mode;
  if (mode === 'exit') {
    const npcId = typeof action.payload?.npcId === 'string' ? action.payload.npcId : '';
    clearDialogue(state);
    return [
      event(state.turn, 'dialogue_exit', 'You step away from the conversation.', {
        npcId,
      }),
    ];
  }

  if (mode === 'start') {
    const npcInstanceId =
      typeof action.payload?.npcInstanceId === 'string'
        ? action.payload.npcInstanceId
        : '';
    const npcId = typeof action.payload?.npcId === 'string' ? action.payload.npcId : '';
    const treeId = typeof action.payload?.treeId === 'string' ? action.payload.treeId : '';
    const eventsContent = eventsForState(state);
    const tree = getDialogueTree(treeId, eventsContent);
    const node = getDialogueNode(tree, tree.startNodeId);
    state.dialogue = {
      active: true,
      npcId,
      npcInstanceId,
      treeId,
      nodeId: node.id,
    };
    return [
      event(state.turn, 'dialogue_start', node.text, {
        npcId,
        treeId,
        nodeId: node.id,
      }),
    ];
  }

  if (mode !== 'choice' || !state.dialogue?.active) {
    return [];
  }

  const choiceId =
    typeof action.payload?.choiceId === 'string' ? action.payload.choiceId : '';
  const eventsContent = eventsForState(state);
  const tree = getDialogueTree(state.dialogue.treeId, eventsContent);
  const node = getDialogueNode(tree, state.dialogue.nodeId);
  const choice = node.choices.find((candidate) => candidate.id === choiceId);
  if (!choice) {
    return [];
  }

  const events: GameEvent[] = [
    event(state.turn, 'dialogue_choice', choice.label, {
      npcId: state.dialogue.npcId,
      treeId: state.dialogue.treeId,
      nodeId: state.dialogue.nodeId,
      choiceId: choice.id,
    }),
  ];

  if (choice.exit) {
    const npcId = state.dialogue.npcId;
    clearDialogue(state);
    events.push(
      event(state.turn, 'dialogue_exit', 'You step away from the conversation.', {
        npcId,
      }),
    );
    return events;
  }

  if (choice.nextNodeId) {
    const nextNode = getDialogueNode(tree, choice.nextNodeId);
    state.dialogue.nodeId = nextNode.id;
    events.push(
      event(state.turn, 'dialogue_node', nextNode.text, {
        npcId: state.dialogue.npcId,
        treeId: state.dialogue.treeId,
        nodeId: nextNode.id,
      }),
    );
  }

  return events;
};

export const getDialogueInvalidReason = (state: GameState): string | undefined => {
  if (!state.dialogue?.active) {
    return undefined;
  }

  const tree = eventsForState(state).dialogueTrees.find(
    (candidate) => candidate.id === state.dialogue?.treeId,
  );
  if (!tree) {
    return `dialogue references unknown tree ${state.dialogue.treeId}`;
  }

  if (!tree.nodes.some((node) => node.id === state.dialogue?.nodeId)) {
    return `dialogue references unknown node ${state.dialogue.nodeId}`;
  }

  return undefined;
};

export const getNpcInvalidReason = (state: GameState): string | undefined => {
  const occupied = new Set<string>([positionKey(state.player)]);
  for (const enemy of state.enemies) {
    occupied.add(positionKey(enemy));
  }
  for (const item of state.items) {
    occupied.add(positionKey(item));
  }

  for (const npc of state.npcs) {
    const key = positionKey(npc);
    if (!eventsForState(state).npcs.some((definition) => definition.id === npc.npcId)) {
      return `npc ${npc.id} references unknown npcId ${npc.npcId}`;
    }
    if (!isWalkableTile(state.map, npc)) {
      return `npc ${npc.id} is not on a walkable tile`;
    }
    if (occupied.has(key)) {
      return `npc ${npc.id} overlaps another actor`;
    }
    occupied.add(key);
  }

  return undefined;
};

export const eventsBundle = (scenarioPackId?: string): EventsContentBundle =>
  eventsForPack(scenarioPackId);
