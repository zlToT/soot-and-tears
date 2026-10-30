/**
 * Floor-loop smoke test: reload, jump into the boss room, kill it, check the
 * trapdoor, step on it, and confirm the next floor starts fresh. Also checks
 * that a cleared normal room stays cleared when re-entered.
 * Needs dev server on :5180 and Chrome with --remote-debugging-port=9222.
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
        console.error('eval error', JSON.stringify(reply.result.exceptionDetails).slice(0, 500));
    }
    return reply.result?.result?.value;
}
const read = async () => JSON.parse(await evaluate('JSON.stringify(window.__soot())'));

async function keyEvent(type, letter) {
    await send('Input.dispatchKeyEvent', {
        type,
        key: letter,
        code: `Key${letter.toUpperCase()}`,
        windowsVirtualKeyCode: letter.toUpperCase().charCodeAt(0),
        nativeVirtualKeyCode: letter.toUpperCase().charCodeAt(0),
    });
}

const failures = [];
const check = (condition, message) => {
    if (!condition) failures.push(message);
};

// Fresh run every time.
await send('Page.reload', { ignoreCache: true });
await sleep(3200);
if ((await evaluate('typeof window.__sootMenu')) === 'object') {
    await evaluate('window.__sootMenu.start()');
    await sleep(1200);
}

const boot = await read();
check(boot.level === 1, `did not boot on floor 1 (${boot.level})`);

// Boss room: should lock the player in with a wave.
await evaluate('window.__sootScene.enterRoom(window.__sootScene.dungeon.boss, null)');
await sleep(600);
const bossRoom = await read();
check(bossRoom.room.type === 'boss', `not in a boss room (${bossRoom.room.type})`);
check(bossRoom.boss !== null, 'boss room spawned no boss');
check(bossRoom.room.cleared === false, 'boss room started cleared');


await evaluate(`(() => {
    const scene = window.__sootScene;
    if (scene.boss) scene.boss.takeDamage(scene.boss.hp + 10, 0, 0);
    for (let guard = 0; guard < 6; guard += 1) { scene.enemies.slice().forEach((enemy) => enemy.takeDamage(9999, enemy.x, enemy.y - 1)); }
})()`);
await sleep(900);
const cleared = await read();
check(cleared.room.cleared === true, 'boss room did not clear');
check(cleared.room.trapdoor === true, 'trapdoor did not appear');

const shotA = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${SHOTS}03-room-boss-cleared.png`, Buffer.from(shotA.result.data, 'base64'));

// Walk onto the trapdoor.
await keyEvent('keyDown', 'w');
await sleep(1400);
await keyEvent('keyUp', 'w');
await sleep(1600);

const next = await read();
check(next.level === 2, `floor did not advance (level ${next.level})`);
check(next.room.type === 'start', `new floor did not start in the start room (${next.room.type})`);
check(next.transitioning === false, 'stuck transitioning after descending');
check(next.hp === cleared.hp, `hp changed while descending (${cleared.hp} -> ${next.hp})`);

// Cleared rooms must stay cleared when walked back into.
const persist = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        const normal = scene.dungeon.rooms.find((room) => room.type === 'normal');
        if (!normal) return JSON.stringify({ skipped: true });
        scene.enterRoom(normal, null);
        const spawned = scene.enemies.length;
        for (let guard = 0; guard < 6; guard += 1) { scene.enemies.slice().forEach((enemy) => enemy.takeDamage(9999, enemy.x, enemy.y - 1)); }
        const clearedFlag = normal.cleared;
        scene.enterRoom(scene.dungeon.start, null);
        scene.enterRoom(normal, null);
        return JSON.stringify({ spawned, clearedFlag, reentered: scene.enemies.length });
    })()`)
);
if (!persist.skipped) {
    check(persist.spawned > 0, 'normal room spawned no enemies');
    check(persist.clearedFlag === true, 'normal room did not clear');
    check(persist.reentered === 0, `cleared room re-spawned ${persist.reentered} enemies`);
}

const shotB = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${SHOTS}04-floor-2.png`, Buffer.from(shotB.result.data, 'base64'));

console.log(
    JSON.stringify(
        {
            boss: bossRoom.room,
            cleared: cleared.room,
            level2: { level: next.level, rooms: next.rooms.length },
            persist,
        },
        null,
        2
    )
);
console.log(failures.length === 0 ? 'FLOOR OK' : `FLOOR FAIL: ${failures.join(' | ')}`);
process.exit(failures.length === 0 ? 0 : 1);
