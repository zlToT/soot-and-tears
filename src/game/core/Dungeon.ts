import type { Dir, RoomType } from '../types';
import { DIRS, PLAY_H, PLAY_W, PLAY_X, PLAY_Y, TILE } from '../const';
import { mulberry32, shuffle } from './rng';

/** Isaac-style floor grid. */
export const GRID_W = 9;
export const GRID_H = 8;

const START_GX = 4;
const START_GY = 3;
const MIN_ROOMS = 5;
const MAX_ROOMS = 13;
const MAX_ITERATIONS = 400;
const MAX_RESTARTS = 6;
const MAX_ATTEMPTS = 240;

const COLS = Math.floor(PLAY_W / TILE);
const ROWS = Math.floor(PLAY_H / TILE);
const CENTER_IX = (COLS - 1) / 2;
const CENTER_IY = (ROWS - 1) / 2;
const MIRROR_IX = COLS - 1;

export type ObstacleKind = 'rock' | 'pit' | 'spike' | 'wall';

export interface Obstacle {
    kind: ObstacleKind;
    x: number;
    y: number;
}

export interface ShopSlot {
    kind: 'item' | 'heart';
    itemId?: string;
    price: number;
    sold: boolean;
}

export interface ChestDef {
    kind: 'wood' | 'gold';
    opened: boolean;
}

export interface RoomDef {
    readonly gx: number;
    readonly gy: number;
    /** BFS distance from the start room. */
    readonly dist: number;
    readonly seed: number;
    type: RoomType;
    doors: Dir[];
    cleared: boolean;
    seen: boolean;
    visited: boolean;
    obstacles: Obstacle[];
    /** Name of the layout template this room was built from. */
    layout: string;
    /** Treasure pedestal already looted. */
    itemTaken: boolean;
    /** Item waiting on the treasure pedestal. */
    itemId?: string;
    trapdoor: boolean;
    /** Chest sitting in the middle of a normal room. */
    chest?: ChestDef;
    /** Shop stock, rolled when the room is first visited. */
    shopStock?: ShopSlot[];
}

interface Cell {
    gx: number;
    gy: number;
    dist: number;
}

const DELTA: Readonly<Record<Dir, readonly [number, number]>> = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
};

const key = (gx: number, gy: number): string => `${gx},${gy}`;
const tileKey = (ix: number, iy: number): string => `${ix},${iy}`;

function filledNeighbours(cells: Map<string, Cell>, gx: number, gy: number): number {
    let count = 0;
    for (const dir of DIRS) {
        const [dx, dy] = DELTA[dir];
        if (cells.has(key(gx + dx, gy + dy))) {
            count += 1;
        }
    }
    return count;
}

/**
 * Tiles the level generator must leave empty: the room centre plus a straight
 * approach from every door, so every door always joins the central cross.
 */
function reservedTiles(room: RoomDef): Set<string> {
    const reserved = new Set<string>();
    const up = room.doors.includes('up');
    const down = room.doors.includes('down');
    const left = room.doors.includes('left');
    const right = room.doors.includes('right');

    for (let iy = 0; iy < ROWS; iy += 1) {
        for (let ix = 0; ix < COLS; ix += 1) {
            const centre =
                Math.abs(ix - CENTER_IX) <= 1.5 && Math.abs(iy - CENTER_IY) <= 1.5;
            const approachUp = up && iy < 3 && ix >= 7 && ix <= 10;
            const approachDown = down && iy > ROWS - 4 && ix >= 7 && ix <= 10;
            const approachLeft = left && ix < 3 && iy >= 3 && iy <= 5;
            const approachRight = right && ix > COLS - 4 && iy >= 3 && iy <= 5;
            if (centre || approachUp || approachDown || approachLeft || approachRight) {
                reserved.add(tileKey(ix, iy));
            }
        }
    }
    return reserved;
}

interface Layout {
    name: string;
    obstacles: Obstacle[];
}

type Put = (kind: ObstacleKind, ix: number, iy: number) => void;

interface LayoutTemplate {
    name: string;
    weight: number;
    build: (put: Put, rand: () => number) => void;
}

const LAYOUTS: readonly LayoutTemplate[] = [
    {
        name: 'empty',
        weight: 10,
        build: () => undefined,
    },
    {
        name: 'corners',
        weight: 8,
        build: (put) => {
            const spots: Array<[number, number]> = [
                [1, 1],
                [COLS - 2, 1],
                [1, ROWS - 2],
                [COLS - 2, ROWS - 2],
            ];
            for (const [ix, iy] of spots) put('rock', ix, iy);
        },
    },
    {
        name: 'pillars',
        weight: 8,
        build: (put) => {
            for (const ix of [4, COLS - 5]) {
                for (const iy of [1, 4, ROWS - 2]) put('rock', ix, iy);
            }
        },
    },
    {
        name: 'diamond',
        weight: 7,
        build: (put) => {
            const ring: Array<[number, number]> = [
                [5, 2],
                [COLS - 6, 2],
                [3, 4],
                [COLS - 4, 4],
                [5, 6],
                [COLS - 6, 6],
                [CENTER_IX - 0.5, 1],
                [CENTER_IX + 0.5, ROWS - 2],
            ];
            for (const [ix, iy] of ring) put('rock', Math.round(ix), iy);
        },
    },
    {
        name: 'pitCluster',
        weight: 7,
        build: (put) => {
            const spots: Array<[number, number]> = [
                [2, 1],
                [3, 1],
                [2, 2],
                [3, 2],
                [COLS - 3, 2],
                [COLS - 3, 1],
            ];
            for (const [ix, iy] of spots) put('pit', ix, iy);
        },
    },
    {
        name: 'brokenRows',
        weight: 7,
        build: (put) => {
            for (let ix = 1; ix < COLS - 1; ix += 2) put('rock', ix, 2);
            for (let ix = 2; ix < COLS - 1; ix += 2) put('rock', ix, ROWS - 3);
        },
    },
    {
        name: 'spikeRing',
        weight: 7,
        build: (put) => {
            const ring: Array<[number, number]> = [
                [5, 1],
                [COLS - 6, 1],
                [2, 3],
                [2, 5],
                [COLS - 3, 3],
                [COLS - 3, 5],
                [5, ROWS - 2],
                [COLS - 6, ROWS - 2],
                [CENTER_IX - 0.5, 2],
                [CENTER_IX + 0.5, ROWS - 3],
            ];
            for (const [ix, iy] of ring) put('spike', Math.round(ix), iy);
        },
    },
    {
        name: 'mirroredScatter',
        weight: 8,
        build: (put, rand) => {
            for (let i = 0; i < 3; i += 1) {
                const ix = 1 + Math.floor(rand() * 6);
                const iy = Math.floor(rand() * ROWS);
                put('rock', ix, iy);
                put('rock', MIRROR_IX - ix, iy);
            }
        },
    },
    {
        name: 'spikeCorridor',
        weight: 6,
        build: (put) => {
            for (let iy = 1; iy < ROWS - 1; iy += 1) {
                put('spike', 6, iy);
                put('spike', COLS - 7, iy);
            }
        },
    },
    {
        name: 'doublePit',
        weight: 7,
        build: (put) => {
            const spots: Array<[number, number]> = [
                [3, 3],
                [4, 3],
                [3, 4],
                [4, 4],
                [COLS - 5, 3],
                [COLS - 4, 3],
                [COLS - 5, 4],
                [COLS - 4, 4],
            ];
            for (const [ix, iy] of spots) put('pit', ix, iy);
        },
    },
    {
        name: 'arena',
        weight: 8,
        build: (put) => {
            for (let iy = 1; iy < ROWS - 1; iy += 2) {
                put('rock', 1, iy);
                put('rock', COLS - 2, iy);
            }
            for (let ix = 1; ix < COLS - 1; ix += 2) {
                put('rock', ix, 1);
                put('rock', ix, ROWS - 2);
            }
        },
    },
    {
        name: 'diagonalRubble',
        weight: 7,
        build: (put) => {
            for (let step = 0; step < 4; step += 1) {
                put('rock', 1 + step, 1 + step);
                put('rock', COLS - 2 - step, 1 + step);
                put('rock', 1 + step, ROWS - 2 - step);
                put('rock', COLS - 2 - step, ROWS - 2 - step);
            }
        },
    },
    {
        name: 'crossPillars',
        weight: 7,
        build: (put) => {
            for (const ix of [5, COLS - 6]) {
                for (const iy of [0, 1, 2, ROWS - 3, ROWS - 2, ROWS - 1]) {
                    put('rock', ix, iy);
                }
            }
        },
    },
    {
        name: 'octagon',
        weight: 5,
        build: (put) => {
            // Cut the four corners with a staircase of interior wall blocks.
            for (let i = 0; i < 3; i += 1) {
                for (let j = 0; j < 3 - i; j += 1) {
                    put('wall', i, j);
                    put('wall', COLS - 1 - i, j);
                    put('wall', i, ROWS - 1 - j);
                    put('wall', COLS - 1 - i, ROWS - 1 - j);
                }
            }
        },
    },
    {
        name: 'wallPillars',
        weight: 4,
        build: (put) => {
            const blocks: Array<[number, number]> = [
                [5, 2],
                [COLS - 7, 2],
                [5, ROWS - 4],
                [COLS - 7, ROWS - 4],
            ];
            for (const [bx, by] of blocks) {
                for (const [dx, dy] of [
                    [0, 0],
                    [1, 0],
                    [0, 1],
                    [1, 1],
                ]) {
                    put('wall', bx + dx, by + dy);
                }
            }
        },
    },
    {
        name: 'alcoves',
        weight: 4,
        build: (put) => {
            for (let ix = 2; ix <= 6; ix += 1) {
                put('wall', ix, 1);
                put('wall', ix, ROWS - 2);
                put('wall', COLS - 1 - ix, 1);
                put('wall', COLS - 1 - ix, ROWS - 2);
            }
        },
    },
    {
        name: 'crossWalls',
        weight: 3,
        build: (put) => {
            for (let ix = 2; ix <= 6; ix += 1) {
                for (let iy = 2; iy <= 4; iy += 1) {
                    put('wall', ix, iy);
                    put('wall', COLS - 1 - ix, iy);
                }
            }
        },
    },
];

export const LAYOUT_NAMES: readonly string[] = LAYOUTS.map((layout) => layout.name);

function pickTemplate(rand: () => number): LayoutTemplate {
    const total = LAYOUTS.reduce((sum, layout) => sum + layout.weight, 0);
    let roll = rand() * total;
    for (const layout of LAYOUTS) {
        roll -= layout.weight;
        if (roll <= 0) {
            return layout;
        }
    }
    return LAYOUTS[0];
}

const tileOf = (value: number, origin: number): number =>
    Math.round((value - origin - TILE / 2) / TILE);

function blockedTiles(obstacles: Obstacle[]): Set<string> {
    const blocked = new Set<string>();
    for (const obstacle of obstacles) {
        if (obstacle.kind === 'spike') {
            continue;
        }
        blocked.add(tileKey(tileOf(obstacle.x, PLAY_X), tileOf(obstacle.y, PLAY_Y)));
    }
    return blocked;
}

/** True when the room centre can still reach every door on foot. */
function doorsReachable(room: RoomDef, obstacles: Obstacle[]): boolean {
    const blocked = blockedTiles(obstacles);
    const startX = Math.floor(COLS / 2);
    const startY = Math.floor(ROWS / 2);
    if (blocked.has(tileKey(startX, startY))) {
        return false;
    }

    const seen = new Set([tileKey(startX, startY)]);
    const queue: Array<[number, number]> = [[startX, startY]];
    while (queue.length > 0) {
        const [x, y] = queue.pop() as [number, number];
        for (const dir of DIRS) {
            const [dx, dy] = DELTA[dir];
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
                continue;
            }
            const tile = tileKey(nx, ny);
            if (blocked.has(tile) || seen.has(tile)) {
                continue;
            }
            seen.add(tile);
            queue.push([nx, ny]);
        }
    }

    const entries: Record<Dir, readonly string[]> = {
        up: [tileKey(8, 0), tileKey(9, 0)],
        down: [tileKey(8, ROWS - 1), tileKey(9, ROWS - 1)],
        left: [tileKey(0, 4)],
        right: [tileKey(COLS - 1, 4)],
    };
    return room.doors.every((dir) => entries[dir].some((tile) => seen.has(tile)));
}

/** Drops blocking props until every door is walkable again. */
function reachableLayout(
    room: RoomDef,
    obstacles: Obstacle[],
    rand: () => number
): Obstacle[] {
    let list = obstacles;
    for (let guard = 0; guard < 48 && !doorsReachable(room, list); guard += 1) {
        const blockers = list.filter((obstacle) => obstacle.kind !== 'spike');
        if (blockers.length === 0) {
            break;
        }
        const victim = blockers[Math.floor(rand() * blockers.length)];
        list = list.filter((obstacle) => obstacle !== victim);
    }
    return list;
}

/** Builds one room's obstacles; centre and door approaches stay empty. */
function buildLayout(room: RoomDef, rand: () => number): Layout {
    const reserved = reservedTiles(room);
    const placed = new Map<string, Obstacle>();

    const put: Put = (kind, ix, iy) => {
        if (ix < 0 || iy < 0 || ix >= COLS || iy >= ROWS) {
            return;
        }
        const tile = tileKey(ix, iy);
        if (reserved.has(tile) || placed.has(tile)) {
            return;
        }
        placed.set(tile, {
            kind,
            x: PLAY_X + ix * TILE + TILE / 2,
            y: PLAY_Y + iy * TILE + TILE / 2,
        });
    };

    const template = pickTemplate(rand);
    template.build(put, rand);
    return { name: template.name, obstacles: reachableLayout(room, [...placed.values()], rand) };
}

/**
 * 9x8 room graph: BFS growth from (4,3), refuse cells with more than one
 * filled neighbour (that is what keeps the floor a tree with no loops),
 * then hand the farthest dead ends to Boss / treasure / shop.
 */
export class Dungeon {
    readonly level: number;
    readonly seed: number;
    readonly rooms: RoomDef[] = [];
    start!: RoomDef;
    boss!: RoomDef;
    treasure?: RoomDef;
    shop?: RoomDef;

    private readonly grid = new Map<string, RoomDef>();

    private constructor(level: number, seed: number) {
        this.level = level;
        this.seed = seed;
    }

    static generate(level: number): Dungeon {
        const baseSeed = (Math.random() * 0x7fffffff) >>> 0;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
            const seed = (baseSeed + attempt * 7919) >>> 0;
            const dungeon = new Dungeon(level, seed);
            if (dungeon.build(false)) {
                return dungeon;
            }
        }
        const relaxed = new Dungeon(level, baseSeed);
        relaxed.build(true);
        return relaxed;
    }

    at(gx: number, gy: number): RoomDef | undefined {
        return this.grid.get(key(gx, gy));
    }

    neighbour(room: RoomDef, dir: Dir): RoomDef | undefined {
        const [dx, dy] = DELTA[dir];
        return this.at(room.gx + dx, room.gy + dy);
    }

    visit(room: RoomDef): void {
        room.visited = true;
        room.seen = true;
        for (const dir of room.doors) {
            const next = this.neighbour(room, dir);
            if (next) {
                next.seen = true;
            }
        }
    }

    /** Progress counts only rooms the player has actually entered. */
    get clearedCount(): number {
        return this.rooms.filter((room) => room.cleared && room.visited).length;
    }

    private build(relaxed: boolean): boolean {
        const rand = mulberry32(this.seed);
        this.rooms.length = 0;
        this.grid.clear();
        this.treasure = undefined;
        this.shop = undefined;

        const target = Math.min(
            MAX_ROOMS,
            Math.max(
                MIN_ROOMS,
                4 + Math.round(this.level * 0.78) + (rand() < 0.5 ? 0 : 1)
            )
        );

        const cells = new Map<string, Cell>();
        const startCell: Cell = { gx: START_GX, gy: START_GY, dist: 0 };
        cells.set(key(START_GX, START_GY), startCell);
        const queue: Cell[] = [startCell];

        let iterations = 0;
        let restarts = 0;
        while (cells.size < target && iterations < MAX_ITERATIONS) {
            iterations += 1;
            if (queue.length === 0) {
                restarts += 1;
                if (restarts > MAX_RESTARTS) {
                    break;
                }
                queue.push(startCell);
                continue;
            }
            const current = queue.shift() as Cell;
            for (const dir of shuffle(DIRS, rand)) {
                if (cells.size >= target) {
                    break;
                }
                if (rand() < 0.5) {
                    continue;
                }
                const [dx, dy] = DELTA[dir];
                const gx = current.gx + dx;
                const gy = current.gy + dy;
                if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_H) {
                    continue;
                }
                if (cells.has(key(gx, gy))) {
                    continue;
                }
                if (filledNeighbours(cells, gx, gy) > 1) {
                    continue;
                }
                const cell: Cell = { gx, gy, dist: current.dist + 1 };
                cells.set(key(gx, gy), cell);
                queue.push(cell);
            }
        }

        if (cells.size < 2) {
            return false;
        }

        const deadEnds = [...cells.values()]
            .filter((cell) => !(cell.gx === START_GX && cell.gy === START_GY))
            .filter((cell) => filledNeighbours(cells, cell.gx, cell.gy) === 1)
            .sort((a, b) => b.dist - a.dist || a.gx - b.gx || a.gy - b.gy);

        if (!relaxed) {
            // Reject floors that died far short of the room budget.
            if (cells.size < Math.max(MIN_ROOMS, target - 1)) {
                return false;
            }
            if (deadEnds.length < 2) {
                return false;
            }
            if (deadEnds[0].dist < 2) {
                return false;
            }
        }

        const roomRand = mulberry32((this.seed ^ 0x9e3779b9) >>> 0);
        for (const cell of cells.values()) {
            const room: RoomDef = {
                gx: cell.gx,
                gy: cell.gy,
                dist: cell.dist,
                seed: Math.floor(roomRand() * 0x7fffffff),
                type: 'normal',
                doors: [],
                cleared: false,
                seen: false,
                visited: false,
                obstacles: [],
                layout: 'empty',
                itemTaken: false,
                trapdoor: false,
            };
            this.rooms.push(room);
            this.grid.set(key(room.gx, room.gy), room);
        }

        this.start = this.grid.get(key(START_GX, START_GY)) as RoomDef;
        this.start.type = 'start';
        this.start.cleared = true;
        this.start.seen = true;
        this.start.visited = true;

        const byDistance = [...cells.values()]
            .filter((cell) => !(cell.gx === START_GX && cell.gy === START_GY))
            .sort((a, b) => b.dist - a.dist);

        const bossCell = deadEnds[0] ?? byDistance[0];
        if (bossCell) {
            this.boss = this.grid.get(key(bossCell.gx, bossCell.gy)) as RoomDef;
            this.boss.type = 'boss';
        } else {
            this.boss = this.start;
        }

        const treasureCell = deadEnds[1] ?? byDistance.find((cell) => cell !== bossCell);
        if (treasureCell) {
            this.treasure = this.grid.get(key(treasureCell.gx, treasureCell.gy)) as RoomDef;
            this.treasure.type = 'treasure';
            this.treasure.cleared = true;
        }

        // The shop is always the third dead end — never borrow a normal room.
        const shopCell = deadEnds[2];
        if (shopCell && this.level >= 2 && cells.size >= 7) {
            this.shop = this.grid.get(key(shopCell.gx, shopCell.gy)) as RoomDef;
            this.shop.type = 'shop';
            this.shop.cleared = true;
        }

        for (const room of this.rooms) {
            for (const dir of DIRS) {
                const [dx, dy] = DELTA[dir];
                if (this.grid.has(key(room.gx + dx, room.gy + dy))) {
                    room.doors.push(dir);
                }
            }
        }

        for (const room of this.rooms) {
            if (room.type !== 'normal') {
                continue;
            }
            const layout = buildLayout(room, mulberry32((room.seed ^ 0x5bf03635) >>> 0));
            room.layout = layout.name;
            room.obstacles = layout.obstacles;

            const roll = mulberry32((room.seed ^ 0x51ed270b) >>> 0)();
            if (roll < 0.32) {
                room.chest = { kind: roll < 0.06 ? 'gold' : 'wood', opened: false };
            }
        }
        return true;
    }
}
