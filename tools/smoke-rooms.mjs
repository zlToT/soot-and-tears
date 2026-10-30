/**
 * Room-content smoke test: loots the treasure pedestal, re-enters to confirm it
 * stays empty, then descends until a shop exists and checks its three shelves.
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

await send('Page.reload', { ignoreCache: true });
await sleep(3200);
if ((await evaluate('typeof window.__sootMenu')) === 'object') {
    await evaluate('window.__sootMenu.start()');
    await sleep(1200);
}

// --- treasure pedestal ------------------------------------------------------
await evaluate(`(() => {
    const scene = window.__sootScene;
    const room = scene.dungeon.treasure;
    scene.enterRoom(room, null);
    for (let guard = 0; guard < 6; guard += 1) { scene.enemies.slice().forEach((enemy) => enemy.takeDamage(9999, enemy.x, enemy.y - 1)); }
    scene.player.placeAt(320, 250);
})()`);
await sleep(500);

const before = await readState();
check(before.room.type === 'treasure', `not in a treasure room (${before.room.type})`);
const hasItem = await evaluate('window.__sootScene.roomView.itemPoint !== undefined');
check(hasItem === true, 'treasure room has no pedestal item');

const shotA = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${SHOTS}07-treasure-filled.png`, Buffer.from(shotA.result.data, 'base64'));

await hold('w', 700);
await sleep(300);

const after = await readState();
const itemLeft = await evaluate('window.__sootScene.roomView.itemPoint !== undefined');
check(after.room.itemTaken === true, 'pedestal item was not taken');
check(itemLeft === false, 'item still on the pedestal after pickup');

const shotB = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${SHOTS}08-treasure-looted.png`, Buffer.from(shotB.result.data, 'base64'));

// re-enter: the pedestal must stay empty
await evaluate(`(() => {
    const scene = window.__sootScene;
    const room = scene.dungeon.treasure;
    scene.enterRoom(scene.dungeon.start, null);
    scene.enterRoom(room, null);
})()`);
await sleep(400);
const reentry = await evaluate('window.__sootScene.roomView.itemPoint !== undefined');
check(reentry === false, 'pedestal item came back after re-entering');

// --- shop -------------------------------------------------------------------
let shop = null;
for (let step = 0; step < 5 && !shop; step += 1) {
    await evaluate('window.__sootScene.descend()');
    await sleep(1000);
    shop = await evaluate(`(() => {
        const scene = window.__sootScene;
        if (!scene.dungeon.shop) return null;
        scene.enterRoom(scene.dungeon.shop, null);
        return JSON.stringify({ gx: scene.dungeon.shop.gx, gy: scene.dungeon.shop.gy, level: scene.level });
    })()`);
}

if (!shop) {
    console.error('no shop on the first five floors');
    process.exit(1);
}

await sleep(400);
const shelves = await evaluate('window.__sootScene.roomView.shelves.length');
check(shelves === 3, `expected 3 shelves, found ${shelves}`);

// stand next to the middle shelf and expect a hint
await evaluate(`(() => {
    const scene = window.__sootScene;
    const shelf = scene.roomView.shelves[1];
    scene.player.placeAt(shelf.x, shelf.y + 20);
})()`);
await sleep(400);
const toast = await evaluate('window.__sootScene.hud.toast ? window.__sootScene.hud.toast.text : null');
check(typeof toast === 'string' && toast.includes('金币'), `no shop hint (toast=${toast})`);

const shotC = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${SHOTS}10-shop.png`, Buffer.from(shotC.result.data, 'base64'));

console.log(JSON.stringify({ treasure: after.room, shop: JSON.parse(shop), shelves, toast }, null, 2));
console.log(failures.length === 0 ? 'ROOMS OK' : `ROOMS FAIL: ${failures.join(' | ')}`);
process.exit(failures.length === 0 ? 0 : 1);
