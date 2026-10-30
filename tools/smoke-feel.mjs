/**
 * Game-feel smoke test: SFX caching, room spawn grace, hit-stop and hit particles.
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

const failures = [];
const check = (condition, message) => {
    if (!condition) failures.push(message);
};

await send('Page.enable');
await send('Page.bringToFront');
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Page.reload', { ignoreCache: true });
let booted = false;
for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    if ((await evaluate('typeof window.__sootMenu')) === 'object') {
        await evaluate('window.__sootMenu.start()');
        await sleep(1200);
    }
    if ((await evaluate('typeof window.__soot')) === 'function') {
        booted = true;
        break;
    }
}
if (!booted) {
    console.error('game did not boot');
    process.exit(1);
}
await sleep(400);

// --- audio cache -------------------------------------------------------------
const audio = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        const keys = ['shoot', 'hit', 'kill', 'hurt', 'coin', 'heart', 'item', 'boss', 'explode', 'beam', 'chest', 'clear', 'shop', 'door'];
        return JSON.stringify({
            cached: keys.filter((name) => scene.cache.audio.exists('sfx_' + name)),
            total: keys.length,
        });
    })()`)
);
check(audio.cached.length === audio.total, `missing SFX: ${audio.total - audio.cached.length}`);

// playing must not throw
const playOk = await evaluate(`(() => {
    try {
        window.__sootScene.sfx.play('shoot', 0.1);
        window.__sootScene.sfx.play('coin', 0.1);
        return true;
    } catch (error) {
        return String(error);
    }
})()`);
check(playOk === true, `sfx.play threw: ${playOk}`);

// --- spawn grace -------------------------------------------------------------
const grace = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        const room = scene.dungeon.rooms.find((r) => r.type === 'normal' && !r.cleared);
        if (!room) return JSON.stringify({ skipped: true });
        scene.enterRoom(room, null);
        const enemy = scene.enemies[0];
        return JSON.stringify({
            grace: scene.spawnGrace,
            alpha: enemy ? enemy.sprite.alpha : null,
            scale: enemy ? enemy.sprite.scaleX : null,
            enemies: scene.enemies.length,
        });
    })()`)
);
if (!grace.skipped) {
    check(grace.grace > 0.4, `spawn grace not armed (${grace.grace})`);
    check(grace.scale !== null && grace.scale < 0.9, `enemy did not scale in (${grace.scale})`);
    check(grace.alpha !== null && grace.alpha > 0.9, `enemy spawn should stay visible (${grace.alpha})`);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}29-spawn-grace.png`, Buffer.from(shot.result.data, 'base64'));
    await sleep(800);
    const afterGrace = JSON.parse(
        await evaluate(`JSON.stringify({
            grace: window.__sootScene.spawnGrace,
            alpha: window.__sootScene.enemies[0] ? window.__sootScene.enemies[0].sprite.alpha : 1,
            scale: window.__sootScene.enemies[0] ? window.__sootScene.enemies[0].sprite.scaleX : 1,
        })`)
    );
    check(afterGrace.grace === 0, 'spawn grace did not expire');
    check(afterGrace.alpha > 0.95, `enemy stayed transparent (${afterGrace.alpha})`);
    check(afterGrace.scale > 0.95, `enemy did not finish scaling in (${afterGrace.scale})`);
}

// --- hit-stop + particles ----------------------------------------------------
const hit = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        const enemy = scene.enemies[0];
        if (!enemy) return JSON.stringify({ skipped: true });
        const tear = scene.playerTears.spawn(enemy.x, enemy.y, 'right', {
            damage: 1, range: 40, speed: 10,
        });
        const sparksBefore = scene.children.list.filter((o) => o.depth === 43).length;
        scene.onPlayerTearEnemy(tear, enemy.sprite);
        return JSON.stringify({
            hitStop: scene.hitStop,
            sparks: scene.children.list.filter((o) => o.depth === 43).length - sparksBefore,
        });
    })()`)
);
if (!hit.skipped) {
    check(hit.hitStop > 0, 'hit did not trigger hit-stop');
    check(hit.sparks > 0, 'hit spawned no particles');
}

// --- kill burst --------------------------------------------------------------
const kill = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        const enemy = scene.enemies[0];
        if (!enemy) return JSON.stringify({ skipped: true });
        const before = scene.children.list.filter((o) => o.depth === 43).length;
        enemy.takeDamage(9999, enemy.x, enemy.y);
        return JSON.stringify({
            burst: scene.children.list.filter((o) => o.depth === 43).length - before,
            hitStop: scene.hitStop,
        });
    })()`)
);
if (!kill.skipped) {
    check(kill.burst > 0, 'kill spawned no burst');
    check(kill.hitStop >= 0.05, `kill hit-stop too short (${kill.hitStop})`);
    await evaluate('window.__sootScene.burst(320, 150, 0xffa060, 18, 48, 0.6)');
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}30-hit-burst.png`, Buffer.from(shot.result.data, 'base64'));
}

console.log(JSON.stringify({ audio, grace, hit, kill }, null, 2));
console.log(failures.length === 0 ? 'FEEL OK' : `FEEL FAIL: ${failures.join(' | ')}`);
process.exit(failures.length === 0 ? 0 : 1);
