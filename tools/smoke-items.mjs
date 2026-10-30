/**
 * Item-system smoke test: loots a real treasure item, checks stats/inventory,
 * checks the onRoomClear hook heals, and checks stat stacking on a fresh run.
 * Needs the dev server on :5180 and Chrome with --remote-debugging-port=9222.
 */
import { writeFileSync } from 'node:fs';

const CDP = 'http://127.0.0.1:9222';
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

// --- real treasure item -----------------------------------------------------
const before = await readState();
await evaluate(`(() => {
    const scene = window.__sootScene;
    scene.enterRoom(scene.dungeon.treasure, null);
    for (let guard = 0; guard < 6; guard += 1) { scene.enemies.slice().forEach((enemy) => enemy.takeDamage(9999, enemy.x, enemy.y - 1)); }
    scene.player.placeAt(320, 250);
})()`);
await sleep(500);

const itemId = await evaluate('window.__sootScene.room.itemId');
check(typeof itemId === 'string' && itemId.length > 0, 'no item assigned to the treasure room');

await hold('w', 700);
await sleep(300);
const after = await readState();
check(after.items.includes(itemId), `inventory wrong: ${after.items}`);
check(after.room.itemTaken === true, 'pedestal still marked as unlooted');

const statsChanged =
    JSON.stringify(before.stats) !== JSON.stringify(after.stats) ||
    JSON.stringify(before.visuals) !== JSON.stringify(after.visuals);
check(statsChanged, `item ${itemId} changed nothing`);
if (after.stats.maxHp > before.stats.maxHp) {
    check(after.hp === after.stats.maxHp, `maxHp grew but hp stayed at ${after.hp}`);
}
check(after.hp <= after.stats.maxHp, 'hp above maxHp');

// re-entering must not duplicate the item
await evaluate(`(() => {
    const scene = window.__sootScene;
    scene.enterRoom(scene.dungeon.start, null);
    scene.enterRoom(scene.dungeon.treasure, null);
})()`);
await sleep(400);
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('docs/shots/09-item-picked.png', Buffer.from(shot.result.data, 'base64'));
const reentered = await readState();
check(reentered.items.filter((id) => id === itemId).length === 1, `item duplicated on re-entry: ${reentered.items}`);
check(reentered.stats.maxHp === after.stats.maxHp, 'stats drifted on re-entry');

// --- onRoomClear hook -------------------------------------------------------
const hookResult = await evaluate(`(() => {
    const scene = window.__sootScene;
    const room = scene.dungeon.rooms.find((r) => r.type === 'normal' && !r.cleared);
    if (!room) return JSON.stringify({ skipped: true });
    scene.enterRoom(room, null);
    scene.player.hp = 5;
    scene.player.inventory.add({
        id: 'test_charm',
        name: '测试护符',
        desc: '',
        color: 0,
        hooks: { onRoomClear: (ctx) => ctx.player.heal(1) },
    });
    const beforeKill = scene.player.hp;
    for (let guard = 0; guard < 6; guard += 1) { scene.enemies.slice().forEach((enemy) => enemy.takeDamage(9999, enemy.x, enemy.y - 1)); }
    return JSON.stringify({ beforeKill, afterKill: scene.player.hp });
})()`);
const hook = JSON.parse(hookResult);
if (!hook.skipped) {
    check(hook.afterKill === hook.beforeKill + 1, `onRoomClear hook did not heal (${hookResult})`);
}

// --- stacking on a fresh run ------------------------------------------------
await send('Page.reload', { ignoreCache: true });
await sleep(3200);
if ((await evaluate('typeof window.__sootMenu')) === 'object') {
    await evaluate('window.__sootMenu.start()');
    await sleep(1200);
}
const stacking = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        const damageBefore = scene.player.stats.damage;
        scene.player.inventory.add({ id: 't1', name: 'T1', desc: '', color: 0, apply: (s) => { s.damage += 1; } });
        scene.player.inventory.add({ id: 't2', name: 'T2', desc: '', color: 0, apply: (s) => { s.damage += 1; } });
        return JSON.stringify({
            damageBefore,
            damageAfter: scene.player.stats.damage,
            items: scene.player.inventory.items.length,
        });
    })()`)
);
check(
    Math.abs(stacking.damageAfter - (stacking.damageBefore + 2)) < 1e-6,
    `stats did not stack: ${JSON.stringify(stacking)}`
);

console.log(
    JSON.stringify(
        { itemId, before: before.stats, after: after.stats, hook, stacking },
        null,
        2
    )
);
console.log(failures.length === 0 ? 'ITEMS OK' : `ITEMS FAIL: ${failures.join(' | ')}`);
process.exit(failures.length === 0 ? 0 : 1);
