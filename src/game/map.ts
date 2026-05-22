import type { FloorRuleDefinition } from './content.js';
import { createSeededRng } from './rng.js';
import type { GameMap, Position, Tile } from './types.js';

export const MAX_GENERATION_ATTEMPTS = 8;

const FLOOR_TILE: Tile = {
  type: 'floor',
  glyph: '.',
  walkable: true,
  description: 'plain stone floor',
};

const WALL_TILE: Tile = {
  type: 'wall',
  glyph: '#',
  walkable: false,
  description: 'solid dungeon wall',
};

const STAIRS_TILE: Tile = {
  type: 'stairs',
  glyph: '>',
  walkable: true,
  description: 'stairs to the next floor',
};

export interface GenerateFloorLayoutParams {
  seed: string;
  floor: number;
  rule: FloorRuleDefinition;
}

export interface FloorLayout {
  map: GameMap;
  playerSpawn: Position;
  stairs: Position;
  usedFallback: boolean;
  attempt: number;
}

export interface PlacementValidationResult {
  valid: boolean;
  reason?: string;
}

interface Room {
  x: number;
  y: number;
  width: number;
  height: number;
}

const positionKey = (position: Position): string => `${position.x},${position.y}`;

const samePosition = (a: Position, b: Position): boolean =>
  a.x === b.x && a.y === b.y;

const manhattanDistance = (a: Position, b: Position): number =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

const roomCenter = (room: Room): Position => ({
  x: Math.floor(room.x + room.width / 2),
  y: Math.floor(room.y + room.height / 2),
});

export const createMapRng = (seed: string, floor: number, attempt: number) =>
  createSeededRng(`${seed}:map:floor:${floor}:attempt:${attempt}`);

export const roomCountForFloor = (floor: number): number =>
  Math.min(4, Math.max(2, 2 + Math.floor((floor - 1) / 2)));

export const getTile = (map: GameMap, position: Position): Tile | undefined =>
  map.tiles[position.y]?.[position.x];

export const isWalkableTile = (map: GameMap, position: Position): boolean =>
  getTile(map, position)?.walkable === true;

export const isInBounds = (map: GameMap, position: Position): boolean =>
  position.x >= 0 &&
  position.y >= 0 &&
  position.x < map.width &&
  position.y < map.height;

export const collectFloorTiles = (map: GameMap): Position[] => {
  const tiles: Position[] = [];
  for (let y = 0; y < map.height; y += 1) {
    for (let x = 0; x < map.width; x += 1) {
      const tile = map.tiles[y]?.[x];
      if (tile?.type === 'floor') {
        tiles.push({ x, y });
      }
    }
  }
  return tiles;
};

export const getReachableTiles = (
  map: GameMap,
  origin: Position,
): Position[] => {
  if (!isWalkableTile(map, origin)) {
    return [];
  }

  const visited = new Set<string>();
  const queue: Position[] = [origin];
  visited.add(positionKey(origin));

  while (queue.length > 0) {
    const current = queue.shift() as Position;
    const neighbors = [
      { x: current.x + 1, y: current.y },
      { x: current.x - 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x, y: current.y - 1 },
    ];

    for (const neighbor of neighbors) {
      const key = positionKey(neighbor);
      if (visited.has(key) || !isInBounds(map, neighbor) || !isWalkableTile(map, neighbor)) {
        continue;
      }
      visited.add(key);
      queue.push(neighbor);
    }
  }

  return [...visited].map((key) => {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  });
};

export const isReachableFrom = (
  map: GameMap,
  origin: Position,
  target: Position,
): boolean => getReachableTiles(map, origin).some((tile) => samePosition(tile, target));

export const validatePlayerSpawn = (
  layout: FloorLayout,
): PlacementValidationResult => {
  if (!isInBounds(layout.map, layout.playerSpawn)) {
    return { valid: false, reason: 'player spawn is out of bounds' };
  }
  if (!isWalkableTile(layout.map, layout.playerSpawn)) {
    return { valid: false, reason: 'player spawn is not walkable' };
  }
  return { valid: true };
};

export const validateStairs = (layout: FloorLayout): PlacementValidationResult => {
  const tile = getTile(layout.map, layout.stairs);
  if (!tile || tile.type !== 'stairs') {
    return { valid: false, reason: 'stairs tile is missing' };
  }
  if (!isWalkableTile(layout.map, layout.stairs)) {
    return { valid: false, reason: 'stairs are not walkable' };
  }
  return { valid: true };
};

export const validateStairsReachable = (
  layout: FloorLayout,
): PlacementValidationResult => {
  if (!isReachableFrom(layout.map, layout.playerSpawn, layout.stairs)) {
    return { valid: false, reason: 'stairs are unreachable from player spawn' };
  }
  return { valid: true };
};

export const validatePlacementCapacity = (
  layout: FloorLayout,
  rule: FloorRuleDefinition,
): PlacementValidationResult => {
  const reachable = getReachableTiles(layout.map, layout.playerSpawn);
  const required =
    1 +
    rule.enemySpawnCount +
    rule.itemSpawnCount;
  if (reachable.length < required) {
    return {
      valid: false,
      reason: `reachable tiles (${reachable.length}) cannot fit ${required} placements`,
    };
  }
  return { valid: true };
};

export const validateFloorLayout = (
  layout: FloorLayout,
  rule: FloorRuleDefinition,
): PlacementValidationResult => {
  const checks = [
    validatePlayerSpawn(layout),
    validateStairs(layout),
    validateStairsReachable(layout),
    validatePlacementCapacity(layout, rule),
  ];

  for (const check of checks) {
    if (!check.valid) {
      return check;
    }
  }

  return { valid: true };
};

export const validateEntityPositions = (params: {
  map: GameMap;
  playerSpawn: Position;
  stairs: Position;
  positions: Position[];
  occupied?: Set<string>;
}): PlacementValidationResult => {
  const occupied = new Set(params.occupied ?? []);
  occupied.add(positionKey(params.playerSpawn));
  occupied.add(positionKey(params.stairs));

  for (const position of params.positions) {
    if (!isInBounds(params.map, position)) {
      return { valid: false, reason: 'entity position is out of bounds' };
    }
    if (!isWalkableTile(params.map, position)) {
      return { valid: false, reason: 'entity position is not walkable' };
    }
    if (!isReachableFrom(params.map, params.playerSpawn, position)) {
      return { valid: false, reason: 'entity position is unreachable from spawn' };
    }
    const key = positionKey(position);
    if (occupied.has(key)) {
      return { valid: false, reason: 'entity positions overlap' };
    }
    occupied.add(key);
  }

  return { valid: true };
};

export const validateEnemyPositions = validateEntityPositions;

export const validateItemPositions = validateEntityPositions;

const createWallMap = (rule: FloorRuleDefinition): GameMap => ({
  width: rule.width,
  height: rule.height,
  tiles: Array.from({ length: rule.height }, () =>
    Array.from({ length: rule.width }, () => ({ ...WALL_TILE })),
  ),
});

const carveFloor = (map: GameMap, x: number, y: number): void => {
  if (!isInBounds(map, { x, y })) {
    return;
  }
  map.tiles[y][x] = { ...FLOOR_TILE };
};

const carveRoom = (map: GameMap, room: Room): void => {
  for (let y = room.y; y < room.y + room.height; y += 1) {
    for (let x = room.x; x < room.x + room.width; x += 1) {
      carveFloor(map, x, y);
    }
  }
};

const carveCorridor = (
  map: GameMap,
  from: Position,
  to: Position,
  horizontalFirst: boolean,
): void => {
  if (horizontalFirst) {
    const stepX = Math.sign(to.x - from.x);
    for (let x = from.x; x !== to.x; x += stepX) {
      carveFloor(map, x, from.y);
    }
    const stepY = Math.sign(to.y - from.y);
    for (let y = from.y; y !== to.y; y += stepY) {
      carveFloor(map, to.x, y);
    }
  } else {
    const stepY = Math.sign(to.y - from.y);
    for (let y = from.y; y !== to.y; y += stepY) {
      carveFloor(map, from.x, y);
    }
    const stepX = Math.sign(to.x - from.x);
    for (let x = from.x; x !== to.x; x += stepX) {
      carveFloor(map, x, to.y);
    }
  }
  carveFloor(map, to.x, to.y);
};

const roomsOverlap = (left: Room, right: Room): boolean =>
  left.x < right.x + right.width &&
  right.x < left.x + left.width &&
  left.y < right.y + right.height &&
  right.y < left.y + left.height;

const tryPlaceRooms = (
  map: GameMap,
  roomCount: number,
  rng: ReturnType<typeof createSeededRng>,
): Room[] => {
  const margin = 1;
  const minRoom = 3;
  const maxWidth = Math.max(minRoom, map.width - margin * 2 - 1);
  const maxHeight = Math.max(minRoom, map.height - margin * 2 - 1);
  const rooms: Room[] = [];

  for (let attempt = 0; attempt < roomCount * 12; attempt += 1) {
    if (rooms.length >= roomCount) {
      break;
    }

    const width = rng.nextInt(minRoom, Math.min(maxWidth, minRoom + 2));
    const height = rng.nextInt(minRoom, Math.min(maxHeight, minRoom + 2));
    const x = rng.nextInt(margin, map.width - margin - width);
    const y = rng.nextInt(margin, map.height - margin - height);
    const candidate = { x, y, width, height };

    if (rooms.some((room) => roomsOverlap(room, candidate))) {
      continue;
    }

    rooms.push(candidate);
    carveRoom(map, candidate);
  }

  return rooms;
};

const connectRooms = (
  map: GameMap,
  rooms: Room[],
  rng: ReturnType<typeof createSeededRng>,
): void => {
  if (rooms.length < 2) {
    return;
  }

  for (let index = 1; index < rooms.length; index += 1) {
    const from = roomCenter(rooms[index - 1] as Room);
    const to = roomCenter(rooms[index] as Room);
    carveCorridor(map, from, to, rng.nextInt(0, 1) === 0);
  }
};

const pickPlayerSpawn = (
  map: GameMap,
  rooms: Room[],
  rng: ReturnType<typeof createSeededRng>,
): Position => {
  const firstRoom = rooms[0];
  const candidates = firstRoom
    ? collectFloorTiles(map).filter((position) =>
        position.x >= firstRoom.x &&
        position.x < firstRoom.x + firstRoom.width &&
        position.y >= firstRoom.y &&
        position.y < firstRoom.y + firstRoom.height,
      )
    : collectFloorTiles(map);

  const pool = candidates.length > 0 ? candidates : collectFloorTiles(map);
  return rng.shuffle(pool)[0] ?? { x: 1, y: 1 };
};

const pickStairsPosition = (
  map: GameMap,
  playerSpawn: Position,
  rng: ReturnType<typeof createSeededRng>,
): Position => {
  const reachable = getReachableTiles(map, playerSpawn);
  const sorted = [...reachable].sort((left, right) => {
    const distanceDiff =
      manhattanDistance(right, playerSpawn) - manhattanDistance(left, playerSpawn);
    if (distanceDiff !== 0) {
      return distanceDiff;
    }
    if (left.y !== right.y) {
      return left.y - right.y;
    }
    return left.x - right.x;
  });

  const farthestDistance = manhattanDistance(sorted[0] ?? playerSpawn, playerSpawn);
  const farTiles = sorted.filter(
    (position) => manhattanDistance(position, playerSpawn) === farthestDistance,
  );
  return rng.shuffle(farTiles)[0] ?? playerSpawn;
};

const applyStairs = (map: GameMap, stairs: Position): void => {
  map.tiles[stairs.y][stairs.x] = { ...STAIRS_TILE };
};

const attemptProceduralLayout = (
  params: GenerateFloorLayoutParams,
  attempt: number,
): FloorLayout | undefined => {
  const rng = createMapRng(params.seed, params.floor, attempt);
  const map = createWallMap(params.rule);
  const rooms = tryPlaceRooms(map, roomCountForFloor(params.floor), rng);

  if (rooms.length < 2) {
    return undefined;
  }

  connectRooms(map, rooms, rng);
  const playerSpawn = pickPlayerSpawn(map, rooms, rng);
  const stairs = pickStairsPosition(map, playerSpawn, rng);
  applyStairs(map, stairs);

  const layout: FloorLayout = {
    map,
    playerSpawn,
    stairs,
    usedFallback: false,
    attempt,
  };

  const validation = validateFloorLayout(layout, params.rule);
  return validation.valid ? layout : undefined;
};

export const createOpenInteriorFallback = (
  params: GenerateFloorLayoutParams,
): FloorLayout => {
  const map = createWallMap(params.rule);
  for (let y = 1; y < params.rule.height - 1; y += 1) {
    for (let x = 1; x < params.rule.width - 1; x += 1) {
      carveFloor(map, x, y);
    }
  }

  const playerSpawn = { x: 1, y: 1 };
  const stairs = {
    x: params.rule.width - 2,
    y: params.rule.height - 2,
  };
  applyStairs(map, stairs);

  return {
    map,
    playerSpawn,
    stairs,
    usedFallback: true,
    attempt: MAX_GENERATION_ATTEMPTS,
  };
};

export const generateFloorLayout = (
  params: GenerateFloorLayoutParams,
): FloorLayout => {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const layout = attemptProceduralLayout(params, attempt);
    if (layout) {
      return layout;
    }
  }

  return createOpenInteriorFallback(params);
};

export const chooseEntityPositions = (params: {
  seed: string;
  floor: number;
  layout: FloorLayout;
  count: number;
  occupied: Set<string>;
  slot: 'enemy' | 'item';
  safeFromPlayer?: boolean;
}): Position[] => {
  if (params.count <= 0) {
    return [];
  }

  const rng = createSeededRng(
    `${params.seed}:placement:${params.floor}:${params.slot}:${params.occupied.size}:${params.count}`,
  );
  const reachable = getReachableTiles(params.layout.map, params.layout.playerSpawn);
  const candidates = reachable.filter((position) => {
    const key = positionKey(position);
    if (params.occupied.has(key)) {
      return false;
    }
    if (samePosition(position, params.layout.playerSpawn)) {
      return false;
    }
    if (samePosition(position, params.layout.stairs)) {
      return false;
    }
    if (
      params.safeFromPlayer &&
      manhattanDistance(position, params.layout.playerSpawn) <= 2
    ) {
      return false;
    }
    return getTile(params.layout.map, position)?.type === 'floor';
  });

  const safeCandidates = params.safeFromPlayer
    ? candidates.filter((position) => manhattanDistance(position, params.layout.playerSpawn) > 2)
    : candidates;
  const pool = safeCandidates.length >= params.count ? safeCandidates : candidates;
  return rng.shuffle(pool).slice(0, params.count);
};
