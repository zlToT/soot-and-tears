/**
 * Headless smoke test: boots the game in Chrome via CDP, walks through the
 * first available door and asserts the room really changed.
 * Needs the dev server on :5180 and Chrome started with --remote-debugging-port=9222.
 */
import { writeFileSync } from 'node:fs';

const CDP = 'http://127.0.0.1:9222';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const targets = await (await fetch(`${CDP}/json/list`)).json();
const page = targets.find((target) => target.type === 'page' && target.url.includes('5180'));
if (!page) {
    console.error('no game page found', targets.map((target) => target.url));
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
    return reply.result?.result?.value;
}

const KEY = { w: 87, a: 65, s: 83, d: 68 };
const KEY_FOR = { up: 'w', down: 's', left: 'a', right: 'd' };

async function keyEvent(type, letter) {
    await send('Input.dispatchKeyEvent', {
        type,
        key: letter,
        code: `Key${letter.toUpperCase()}`,
        windowsVirtualKeyCode: KEY[letter],
        nativeVirtualKeyCode: KEY[letter],
    });
}

async function readState() {
    return JSON.parse(await evaluate('JSON.stringify(window.__soot())'));
}

/** Holds a key and releases it as soon as the room actually changes. */
async function walkThrough(letter, from, maxMs = 4000) {
    await keyEvent('keyDown', letter);
    const started = Date.now();
    let moved = false;
    while (Date.now() - started < maxMs) {
        await sleep(120);
        const state = await readState();
        if (
            state.transitioning === false &&
            (state.room.gx !== from.room.gx || state.room.gy !== from.room.gy)
        ) {
            moved = true;
            break;
        }
    }
    await keyEvent('keyUp', letter);
    await sleep(450);
    return moved;
}

const failures = [];
function check(condition, message) {
    if (!condition) {
        failures.push(message);
    }
}

await send('Page.reload', { ignoreCache: true });
await sleep(3200);
if ((await evaluate('typeof window.__sootMenu')) === 'object') {
    await evaluate('window.__sootMenu.start()');
    await sleep(1200);
}

const start = await readState();
const travel = start.room.doors[0];

// Stand just inside the chosen door, then walk out: props can block long paths
// but the tiles right in front of a door are always kept clear.
const spawn = {
    up: [320, 100],
    down: [320, 260],
    left: [120, 180],
    right: [520, 180],
}[travel];
await evaluate(`window.__sootScene.player.placeAt(${spawn[0]}, ${spawn[1]})`);
await sleep(120);

let moved = false;
for (let attempt = 0; attempt < 3 && !moved; attempt += 1) {
    moved = await walkThrough(KEY_FOR[travel], start);
}

const after = await readState();
check(moved, `walking ${travel} did not change the room`);
check(after.transitioning === false, 'still transitioning after the door');
check(after.rooms.filter((room) => room.seen).length >= 2, 'minimap did not reveal the new room');

if (moved) {
    const entry = {
        up: after.player.y > 240,
        down: after.player.y < 120,
        left: after.player.x > 500,
        right: after.player.x < 140,
    }[travel];
    check(entry, `player not placed at the opposite door (${after.player.x},${after.player.y})`);
    if (!after.room.cleared && after.room.type === 'normal') {
        check(after.enemies.length > 0, 'no enemies spawned in an uncleared room');
    }
    if (!after.room.cleared && after.room.type === 'boss') {
        check(after.boss !== null, 'no boss spawned in an uncleared boss room');
    }
}

const screenshot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(process.env.SHOT_PATH ?? 'smoke.png', Buffer.from(screenshot.result.data, 'base64'));

console.log(
    JSON.stringify(
        {
            travel,
            start: start.room,
            after: after.room,
            player: after.player,
            enemies: after.enemies.length,
            hp: after.hp,
        },
        null,
        2
    )
);
console.log(failures.length === 0 ? 'SMOKE OK' : `SMOKE FAIL: ${failures.join(' | ')}`);
process.exit(failures.length === 0 ? 0 : 1);
