import { Dungeon, GRID_W, GRID_H, LAYOUT_NAMES } from './.tmp-dungeon.mjs';

const DELTA = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
};
const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

const TILE = 32;
const PLAY_X = 32;
const PLAY_Y = 36;
const COLS = 18;
const ROWS = 9;

const tileOf = (value, origin) => Math.round((value - origin - TILE / 2) / TILE);

let failures = 0;
function check(condition, message) {
    if (!condition) {
        failures += 1;
        if (failures < 25) {
            console.error('FAIL:', message);
        }
    }
}

function roomReachable(room) {
    const blocked = new Set();
    for (const obstacle of room.obstacles) {
        if (obstacle.kind === 'spike') continue;
        blocked.add(`${tileOf(obstacle.x, PLAY_X)},${tileOf(obstacle.y, PLAY_Y)}`);
    }
    const start = `${Math.floor(COLS / 2)},${Math.floor(ROWS / 2)}`;
    if (blocked.has(start)) return false;

    const seen = new Set([start]);
    const stack = [start.split(',').map(Number)];
    while (stack.length > 0) {
        const [x, y] = stack.pop();
        for (const dir of Object.keys(DELTA)) {
            const [dx, dy] = DELTA[dir];
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
            const key = `${nx},${ny}`;
            if (blocked.has(key) || seen.has(key)) continue;
            seen.add(key);
            stack.push([nx, ny]);
        }
    }
    const entries = {
        up: ['8,0', '9,0'],
        down: [`8,${ROWS - 1}`, `9,${ROWS - 1}`],
        left: ['0,4'],
        right: [`${COLS - 1},4`],
    };
    return room.doors.every((dir) => entries[dir].some((key) => seen.has(key)));
}

const FLOORS = 150;
const seenLayouts = new Set();
const kindCounts = { rock: 0, pit: 0, spike: 0 };

for (let level = 1; level <= 12; level += 1) {
    const counts = [];
    for (let i = 0; i < FLOORS; i += 1) {
        const dungeon = Dungeon.generate(level);
        const rooms = dungeon.rooms;
        counts.push(rooms.length);

        check(rooms.length >= 5 && rooms.length <= 13, `L${level} room count ${rooms.length}`);
        check(dungeon.start.type === 'start', `L${level} start room type`);
        check(dungeon.start.gx === 4 && dungeon.start.gy === 3, `L${level} start cell`);

        const keys = new Set(rooms.map((room) => `${room.gx},${room.gy}`));
        check(keys.size === rooms.length, `L${level} duplicate cells`);

        for (const room of rooms) {
            const where = `L${level} ${room.gx},${room.gy} ${room.layout}`;
            check(
                room.gx >= 0 && room.gx < GRID_W && room.gy >= 0 && room.gy < GRID_H,
                `L${level} cell outside grid`
            );

            if (room.type === 'normal') {
                seenLayouts.add(room.layout);
                check(LAYOUT_NAMES.includes(room.layout), `${where}: unknown layout`);
                check(roomReachable(room), `${where}: a door is walled off`);
            } else {
                check(room.obstacles.length === 0, `${where}: special room has props`);
            }

            for (const dir of room.doors) {
                const [dx, dy] = DELTA[dir];
                const next = dungeon.at(room.gx + dx, room.gy + dy);
                check(Boolean(next), `L${level} door leads nowhere`);
                if (next) {
                    check(
                        next.doors.includes(OPPOSITE[dir]),
                        `L${level} asymmetric door ${room.gx},${room.gy} ${dir}`
                    );
                }
            }

            for (const obstacle of room.obstacles) {
                kindCounts[obstacle.kind] += 1;
                const ix = tileOf(obstacle.x, PLAY_X);
                const iy = tileOf(obstacle.y, PLAY_Y);
                check(
                    obstacle.x >= 48 && obstacle.x <= 592 && obstacle.y >= 52 && obstacle.y <= 308,
                    `${where}: obstacle outside play area`
                );
                check(
                    Math.hypot(obstacle.x - 320, obstacle.y - 180) > 40,
                    `${where}: obstacle covers the room centre`
                );
                if (room.doors.includes('up')) {
                    check(!(iy < 3 && ix >= 7 && ix <= 10), `${where}: blocks the up door`);
                }
                if (room.doors.includes('down')) {
                    check(
                        !(iy > ROWS - 4 && ix >= 7 && ix <= 10),
                        `${where}: blocks the down door`
                    );
                }
                if (room.doors.includes('left')) {
                    check(!(ix < 3 && iy >= 3 && iy <= 5), `${where}: blocks the left door`);
                }
                if (room.doors.includes('right')) {
                    check(
                        !(ix > COLS - 4 && iy >= 3 && iy <= 5),
                        `${where}: blocks the right door`
                    );
                }
            }
        }

        // connectivity from the start room
        const seen = new Set([`${dungeon.start.gx},${dungeon.start.gy}`]);
        const stack = [dungeon.start];
        while (stack.length > 0) {
            const room = stack.pop();
            for (const dir of room.doors) {
                const [dx, dy] = DELTA[dir];
                const next = dungeon.at(room.gx + dx, room.gy + dy);
                const key = `${next.gx},${next.gy}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    stack.push(next);
                }
            }
        }
        check(seen.size === rooms.length, `L${level} disconnected floor`);

        check(Boolean(dungeon.boss) && dungeon.boss.type === 'boss', `L${level} missing boss`);
        if (dungeon.boss && dungeon.boss.type === 'boss') {
            check(dungeon.boss.dist >= 2, `L${level} boss too close (${dungeon.boss.dist})`);
            check(
                dungeon.boss.doors.length === 1,
                `L${level} boss is not a dead end (${dungeon.boss.doors.length})`
            );
            check(dungeon.boss !== dungeon.start, `L${level} boss is the start room`);
        }

        check(Boolean(dungeon.treasure), `L${level} missing treasure room`);
        if (dungeon.treasure) {
            check(dungeon.treasure !== dungeon.boss, `L${level} treasure equals boss`);
            check(dungeon.treasure.type === 'treasure', `L${level} treasure type`);
        }

        if (dungeon.shop) {
            check(
                level >= 2 && rooms.length >= 7,
                `L${level} shop on a floor that should not have one`
            );
            check(
                dungeon.shop !== dungeon.boss && dungeon.shop !== dungeon.treasure,
                `L${level} shop overlaps another special room`
            );
        }
    }
    const total = counts.reduce((sum, value) => sum + value, 0);
    console.log(
        `L${level}: rooms avg ${(total / counts.length).toFixed(1)} ` +
            `min ${Math.min(...counts)} max ${Math.max(...counts)}`
    );
}

const missing = LAYOUT_NAMES.filter((name) => !seenLayouts.has(name));
check(missing.length === 0, `layouts never generated: ${missing.join(', ')}`);

console.log(`layouts seen: ${seenLayouts.size}/${LAYOUT_NAMES.length}`);
console.log(
    `props: rock ${kindCounts.rock} / pit ${kindCounts.pit} / spike ${kindCounts.spike}`
);
console.log(failures === 0 ? 'ALL OK' : `${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
