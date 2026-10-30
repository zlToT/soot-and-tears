/**
 * Enemy smoke test: screenshots all 14 kinds and checks the tricky ones
 * (mask front armour, doll revive, boom moth blast, bloodwire laser).
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
        console.error('eval error', JSON.stringify(reply.result.exceptionDetails).slice(0, 500));
        return null;
    }
    return reply.result?.result?.value;
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

// --- all kinds on screen ----------------------------------------------------
await evaluate(`(() => {
    const scene = window.__sootScene;
    for (let guard = 0; guard < 6; guard += 1) { scene.enemies.slice().forEach((enemy) => enemy.takeDamage(9999, enemy.x, enemy.y - 1)); }
    scene.player.placeAt(320, 320);
    const kinds = ['grub','moth','spitter','rat','hop','boomMoth','toad','maw','doll','mask','vis','shadeMoth','splitGrub','thornRoll'];
    kinds.forEach((kind, index) => {
        scene.debugSpawn(kind, 90 + (index % 7) * 82, 90 + Math.floor(index / 7) * 80);
    });
})()`);
await sleep(120);
const kindsOnScreen = await evaluate('window.__sootScene.enemies.length');
check(kindsOnScreen === 14, `expected 14 spawned enemies, got ${kindsOnScreen}`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${SHOTS}12-enemies-all.png`, Buffer.from(shot.result.data, 'base64'));

// --- new kinds: teleport, split, roll ---------------------------------------
const fresh = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        const clear = () => { for (let guard = 0; guard < 6; guard += 1) { scene.enemies.slice().forEach((e) => e.takeDamage(9999, e.x, e.y - 1)); } };
        scene.player.placeAt(320, 300);

        clear();
        scene.debugSpawn('shadeMoth', 150, 120);
        const moth = scene.enemies[scene.enemies.length - 1];
        const start = { x: moth.x, y: moth.y };
        for (let i = 0; i < 12; i += 1) moth.update(0.5);
        const mothNear = Math.hypot(moth.x - 320, moth.y - 300) < 150;
        const mothMoved = Math.hypot(moth.x - start.x, moth.y - start.y) > 20;

        clear();
        scene.debugSpawn('splitGrub', 320, 160);
        const before = scene.enemies.length;
        scene.enemies[scene.enemies.length - 1].takeDamage(9999, 0, 0);
        const afterSplit = scene.enemies.length;

        clear();
        scene.debugSpawn('thornRoll', 320, 160);
        const thorn = scene.enemies[scene.enemies.length - 1];
        thorn.update(0.2);
        const rolled =
            Math.abs(thorn.body.velocity.x) + Math.abs(thorn.body.velocity.y) > 1;

        clear();
        return JSON.stringify({ mothNear, mothMoved, before, afterSplit, rolled });
    })()`)
);
check(fresh.mothNear === true, 'shade moth did not teleport near the player');
check(fresh.mothMoved === true, 'shade moth never moved');
check(fresh.afterSplit === fresh.before + 1, `split grub did not split (${fresh.before} -> ${fresh.afterSplit})`);
check(fresh.rolled === true, 'thorn roller did not move');

// --- iron mask: frontal damage is heavily reduced ---------------------
const mask = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        for (let guard = 0; guard < 6; guard += 1) { scene.enemies.slice().forEach((enemy) => enemy.takeDamage(9999, enemy.x, enemy.y - 1)); }
        scene.debugSpawn('mask', 320, 140);
        const target = scene.enemies[scene.enemies.length - 1];
        target.aim = 0;
        const hp0 = target.hp;
        target.takeDamage(10, target.x + 50, target.y);
        const front = target.hp;
        target.takeDamage(10, target.x - 50, target.y);
        return JSON.stringify({ hp0, front, back: target.hp });
    })()`)
);
check(mask.hp0 - mask.front < 5, `front hit was not absorbed enough (${JSON.stringify(mask)})`);
check(mask.front - mask.back > 9, `back hit was absorbed too (${JSON.stringify(mask)})`);

// --- mud doll revives once --------------------------------------------------
const doll = JSON.parse(
    await evaluate(`(async () => {
        const scene = window.__sootScene;
        for (let guard = 0; guard < 6; guard += 1) { scene.enemies.slice().forEach((enemy) => enemy.takeDamage(9999, enemy.x, enemy.y - 1)); }
        scene.player.placeAt(320, 320);
        scene.debugSpawn('doll', 320, 140);
        const target = scene.enemies[scene.enemies.length - 1];
        target.takeDamage(9999, target.x + 5, target.y);
        const down = { dead: target.dead, hp: target.hp, enabled: target.body.enable };
        await new Promise((resolve) => setTimeout(resolve, 2700));
        return JSON.stringify({
            down,
            up: { dead: target.dead, hp: target.hp, enabled: target.body.enable },
        });
    })()`)
);
check(doll.down.dead === false && doll.down.enabled === false, 'doll did not turn to goo');
check(doll.up.dead === false && doll.up.enabled === true && doll.up.hp > 0, 'doll did not revive');

// --- boom moth: death blast -------------------------------------------------
const boom = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        for (let guard = 0; guard < 6; guard += 1) { scene.enemies.slice().forEach((enemy) => enemy.takeDamage(9999, enemy.x, enemy.y - 1)); }
        scene.enemyTears.clear();
        scene.player.placeAt(320, 320);
        scene.debugSpawn('boomMoth', 320, 140);
        const target = scene.enemies[scene.enemies.length - 1];
        target.takeDamage(9999, target.x + 5, target.y);
        return JSON.stringify({
            tears: scene.enemyTears.group.getLength(),
            dead: target.dead,
        });
    })()`)
);
check(boom.tears >= 8, `boom moth fired ${boom.tears} tears on death`);

// --- bloodwire laser --------------------------------------------------------
const vis = JSON.parse(
    await evaluate(`(async () => {
        const scene = window.__sootScene;
        for (let guard = 0; guard < 6; guard += 1) { scene.enemies.slice().forEach((enemy) => enemy.takeDamage(9999, enemy.x, enemy.y - 1)); }
        scene.enemyTears.clear();
        scene.player.hp = 8;
        scene.player.placeAt(180, 300);
        scene.debugSpawn('vis', 500, 300);
        const hpBefore = scene.player.hp;
        await new Promise((resolve) => setTimeout(resolve, 6000));
        return JSON.stringify({ hpBefore, hpAfter: scene.player.hp });
    })()`)
);
check(vis.hpAfter < vis.hpBefore, `bloodwire laser missed (${vis.hpBefore} -> ${vis.hpAfter})`);

// --- hop volley + rat movement ---------------------------------------------
const misc = JSON.parse(
    await evaluate(`(async () => {
        const scene = window.__sootScene;
        for (let guard = 0; guard < 6; guard += 1) { scene.enemies.slice().forEach((enemy) => enemy.takeDamage(9999, enemy.x, enemy.y - 1)); }
        scene.enemyTears.clear();
        scene.player.placeAt(320, 300);
        scene.debugSpawn('hop', 460, 160);
        scene.debugSpawn('rat', 200, 120);
        const rat = scene.enemies.find((enemy) => enemy.kind === 'rat');
        const startX = rat.x;
        const startY = rat.y;
        let maxTears = 0;
        for (let i = 0; i < 32; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            maxTears = Math.max(maxTears, scene.enemyTears.group.getLength());
        }
        return JSON.stringify({
            maxTears,
            ratMoved: Math.hypot(rat.x - startX, rat.y - startY) > 10,
        });
    })()`)
);
check(misc.maxTears > 0, 'hop never fired its volley');
check(misc.ratMoved, 'rat did not move');

console.log(JSON.stringify({ mask, doll, boom, vis, misc }, null, 2));
console.log(failures.length === 0 ? 'ENEMIES OK' : `ENEMIES FAIL: ${failures.join(' | ')}`);
process.exit(failures.length === 0 ? 0 : 1);
