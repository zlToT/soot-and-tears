/**
 * Layout smoke test: finds a floor with pitfalls, checks they block walking,
 * then finds one with spikes and checks they cost half a heart.
 * Needs the dev server on :5180 and Chrome with --remote-debugging-port=9222.
 */
import { writeFileSync } from 'node:fs';

const CDP = 'http://127.0.0.1:9222';
const SHOTS = 'docs/shots/';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const targets = await (await fetch(`${CDP}/json/list`)).json();
const page = targets.find((target) => target.type === 'page' && target.url.includes('5180'));
if (!page) {
    console.error('no game page found');
    process.exit(1);
}

const socket = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 0;
socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const resolve = pending.get(message.id);
    if (resolve) {
        pending.delete(message.id);
        resolve(message);
    }
});
await new Promise((resolve) => socket.addEventListener('open', resolve));
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Page.bringToFront');

function send(method, params = {}) {
    return new Promise((resolve) => {
        const id = ++nextId;
        pending.set(id, resolve);
        socket.send(JSON.stringify({ id, method, params }));
    });
}
async function evaluate(expression) {
    const reply = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
    });
    if (reply.result?.exceptionDetails) {
        console.error('eval error', JSON.stringify(reply.result.exceptionDetails).slice(0, 400));
    }
    return reply.result?.result?.value;
}
const readState = async () => JSON.parse(await evaluate('JSON.stringify(window.__soot())'));

const KEY = { w: 87, a: 65, s: 83, d: 68 };
async function hold(letter, ms) {
    await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: letter,
        code: `Key${letter.toUpperCase()}`,
        windowsVirtualKeyCode: KEY[letter],
        nativeVirtualKeyCode: KEY[letter],
    });
    await sleep(ms);
    await send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: letter,
        code: `Key${letter.toUpperCase()}`,
        windowsVirtualKeyCode: KEY[letter],
        nativeVirtualKeyCode: KEY[letter],
    });
    await sleep(150);
}

const failures = [];
const check = (condition, message) => {
    if (!condition) failures.push(message);
};

/** Reloads until a floor has a normal room with the requested prop type. */
async function findRoom(kind, attempts = 15) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        await send('Page.reload', { ignoreCache: true });
        await sleep(3000);
        if ((await evaluate('typeof window.__sootMenu')) === 'object') {
            await evaluate('window.__sootMenu.start()');
            await sleep(1200);
        }
        const found = await evaluate(`(() => {
            const scene = window.__sootScene;
            if (!scene) return null;
            const usable = (o) =>
                o.kind === '${kind}' && o.x > 120 && o.x < 500 && o.y > 100 && o.y < 260;
            const room = scene.dungeon.rooms.find(
                (candidate) => candidate.type === 'normal' && candidate.obstacles.some(usable)
            );
            if (!room) return null;
            return JSON.stringify({
                gx: room.gx,
                gy: room.gy,
                layout: room.layout,
                obstacle: room.obstacles.find(usable),
            });
        })()`);
        console.log('  ', kind, attempt, found ? JSON.parse(found).layout : 'none');
        if (found) {
            return JSON.parse(found);
        }
    }
    return null;
}

// --- pitfalls block walking -------------------------------------------------
const pitRoom = await findRoom('pit');
if (!pitRoom) {
    console.error('no pit room found');
    process.exit(1);
}

await evaluate(`(() => {
    const scene = window.__sootScene;
    const room = scene.dungeon.rooms.find((r) => r.gx === ${pitRoom.gx} && r.gy === ${pitRoom.gy});
    scene.enterRoom(room, null);
    for (let guard = 0; guard < 6; guard += 1) { scene.enemies.slice().forEach((enemy) => enemy.takeDamage(9999, enemy.x, enemy.y - 1)); }
    scene.player.placeAt(${pitRoom.obstacle.x - 48}, ${pitRoom.obstacle.y});
})()`);
await sleep(400);
const pitShot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${SHOTS}05-layout-pit.png`, Buffer.from(pitShot.result.data, 'base64'));

await hold('d', 800);
const afterPit = await readState();
check(
    afterPit.player.x < pitRoom.obstacle.x - 10,
    `walked into the pit (x=${afterPit.player.x}, pit=${pitRoom.obstacle.x})`
);

// --- spikes cost half a heart -----------------------------------------------
const spikeRoom = await findRoom('spike');
if (!spikeRoom) {
    console.error('no spike room found');
    process.exit(1);
}

await evaluate(`(() => {
    const scene = window.__sootScene;
    const room = scene.dungeon.rooms.find((r) => r.gx === ${spikeRoom.gx} && r.gy === ${spikeRoom.gy});
    scene.enterRoom(room, null);
    for (let guard = 0; guard < 6; guard += 1) { scene.enemies.slice().forEach((enemy) => enemy.takeDamage(9999, enemy.x, enemy.y - 1)); }
    scene.player.placeAt(${spikeRoom.obstacle.x - 48}, ${spikeRoom.obstacle.y});
})()`);
await sleep(400);
const hpBefore = (await readState()).hp;
const spikeShot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${SHOTS}06-layout-spike.png`, Buffer.from(spikeShot.result.data, 'base64'));

await hold('d', 700);
const afterSpike = await readState();
check(afterSpike.hp < hpBefore, `spikes did not hurt (hp ${hpBefore} -> ${afterSpike.hp})`);

console.log(
    JSON.stringify(
        {
            pit: { layout: pitRoom.layout, obstacle: pitRoom.obstacle, playerX: afterPit.player.x },
            spike: {
                layout: spikeRoom.layout,
                obstacle: spikeRoom.obstacle,
                hp: `${hpBefore} -> ${afterSpike.hp}`,
            },
        },
        null,
        2
    )
);
console.log(failures.length === 0 ? 'LAYOUT OK' : `LAYOUT FAIL: ${failures.join(' | ')}`);
process.exit(failures.length === 0 ? 0 : 1);
