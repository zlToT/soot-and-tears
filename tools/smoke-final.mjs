/**
 * Final-features smoke test: bombs, keys + locked gold chest, chest animation,
 * BGM / mute / volume, and the floor-15 victory screen.
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
const readState = async () => JSON.parse(await evaluate('JSON.stringify(window.__soot())'));

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
await sleep(500);

// Browsers keep audio suspended until the first gesture; unlock it for the test.
await send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: 400,
    y: 300,
    button: 'left',
    clickCount: 1,
});
await send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: 400,
    y: 300,
    button: 'left',
    clickCount: 1,
});
await sleep(400);

// --- audio -------------------------------------------------------------------
const audio = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        return JSON.stringify({
            bgmCached: scene.cache.audio.exists('bgm_loop'),
            bgmStarted: !!scene.bgm,
            volume: scene.sound.volume,
            muted: scene.sound.mute,
        });
    })()`)
);
check(audio.bgmCached === true, 'BGM not in the audio cache');
check(audio.bgmStarted === true, 'BGM did not start');

const muted = JSON.parse(await evaluate(`(() => {
    const scene = window.__sootScene;
    scene.onMuteKey();
    return JSON.stringify({ state: scene.muted });
})()`));
check(muted.state === true, 'M did not mute');
await sleep(250);
const soundMuted = await evaluate('window.__sootScene.sound.mute');
check(soundMuted === true, 'sound manager stayed unmuted');
const unmuted = JSON.parse(await evaluate(`(() => {
    const scene = window.__sootScene;
    scene.onMuteKey();
    return JSON.stringify({ state: scene.muted });
})()`));
check(unmuted.state === false, 'M did not unmute');
await sleep(250);
const soundUnmuted = await evaluate('window.__sootScene.sound.mute');
check(soundUnmuted === false, 'sound manager stayed muted');

const volume = JSON.parse(await evaluate(`(() => {
    const scene = window.__sootScene;
    const before = scene.masterVolume;
    scene.changeVolume(-0.1);
    return JSON.stringify({ before, lower: scene.masterVolume });
})()`));
check(volume.lower < volume.before, 'volume down did nothing');
await sleep(250);
const lowerSound = await evaluate('window.__sootScene.sound.volume');
check(lowerSound < 0.85, `sound manager volume did not follow (${lowerSound})`);
const restored = JSON.parse(await evaluate(`(() => {
    const scene = window.__sootScene;
    scene.changeVolume(0.1);
    return JSON.stringify({ back: scene.masterVolume });
})()`));
check(Math.abs(restored.back - volume.before) < 1e-6, 'volume restore failed');

// --- bombs -------------------------------------------------------------------
const bombResult = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        const room = scene.dungeon.rooms.find((r) => r.type === 'normal');
        scene.enterRoom(room, null);
        for (let guard = 0; guard < 6; guard += 1) { scene.enemies.slice().forEach((e) => e.takeDamage(9999, e.x, e.y - 1)); }
        scene.spawnWave(room);
        const enemy = scene.enemies[0];
        scene.player.hp = scene.player.stats.maxHp;
        scene.player.placeAt(320, 250);
        enemy.sprite.body.reset(338, 250);
        enemy.hp = enemy.maxHp = 200;
        const bombsBefore = scene.bombs;
        scene.placeBomb();
        return JSON.stringify({ bombsBefore, bombsAfter: scene.bombs, hp: enemy.hp });
    })()`)
);
check(bombResult.bombsAfter === bombResult.bombsBefore - 1, 'bomb was not consumed');
await sleep(1800);
const afterBomb = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        return JSON.stringify({ enemyHp: scene.enemies[0] ? scene.enemies[0].hp : 0 });
    })()`)
);
check(afterBomb.enemyHp < bombResult.hp, `bomb dealt no damage (${afterBomb.enemyHp})`);
const bombShot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${SHOTS}31-bomb.png`, Buffer.from(bombShot.result.data, 'base64'));

// --- keys + locked gold chest + lid animation --------------------------------
const chestLocked = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        const room = scene.dungeon.rooms.find((r) => r.type === 'normal' && !r.cleared);
        if (!room) return JSON.stringify({ skipped: true });
        room.chest = { kind: 'gold', opened: false };
        scene.enterRoom(room, null);
        for (let guard = 0; guard < 6; guard += 1) { scene.enemies.slice().forEach((e) => e.takeDamage(9999, e.x, e.y - 1)); }
        scene.pickups.slice().forEach((p) => { p.sprite.destroy(); p.glow.destroy(); });
        scene.pickups = [];
        scene.keys = 0;
        scene.hud.setConsumables(scene.bombs, scene.keys);
        const point = scene.roomView.chestPoint;
        scene.player.placeAt(point.x, point.y + 12);
        return JSON.stringify({ point, lid: !!scene.roomView.chestLid });
    })()`)
);
check(chestLocked.skipped !== true, 'no normal room for the chest test');
await sleep(400);
const lockedState = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        return JSON.stringify({
            opened: scene.room.chest.opened,
            toast: scene.hud.toast ? scene.hud.toast.text : null,
        });
    })()`)
);
check(lockedState.opened === false, 'gold chest opened without a key');
check(
    typeof lockedState.toast === 'string' && lockedState.toast.includes('钥匙'),
    `no key hint (toast=${lockedState.toast})`
);

await evaluate(`(() => {
    const scene = window.__sootScene;
    scene.keys = 1;
    scene.hud.setConsumables(scene.bombs, scene.keys);
    scene.player.placeAt(scene.roomView.chestPoint.x, scene.roomView.chestPoint.y + 80);
    window.__realRandom = Math.random;
    Math.random = () => 0.1; // force the gold chest to drop an item, not a spare key
})()`);
await sleep(300);
await evaluate(`(() => {
    const scene = window.__sootScene;
    const point = scene.roomView.chestPoint;
    scene.player.placeAt(point.x, point.y + 12);
})()`);
await sleep(350);
const openedState = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        Math.random = window.__realRandom;
        return JSON.stringify({
            opened: scene.room.chest.opened,
            keys: scene.keys,
            point: scene.roomView.chestPoint,
            lid: !!scene.roomView.chestLid,
        });
    })()`)
);
check(openedState.opened === true, 'gold chest did not open with a key');
check(openedState.keys === 0, `key was not consumed (${openedState.keys})`);
check(openedState.point === undefined, 'chest point survived opening');
check(openedState.lid === false, 'chest lid was not cleared');

// --- consumable HUD ----------------------------------------------------------
const hudText = await evaluate(`(() => {
    const hud = window.__sootScene.hud;
    return hud.bombCount.text + '/' + hud.keyCount.text;
})()`);
check(/^\d+\/\d+$/.test(hudText), `consumable HUD reads ${hudText}`);

// --- victory screen ----------------------------------------------------------
const victoryState = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        scene.level = 15;
        scene.enterRoom(scene.dungeon.boss, null);
        scene.boss.takeDamage(scene.boss.maxHp + 10, 0, 0);
        return JSON.stringify({
            victory: scene.victory,
            trapdoor: scene.room.trapdoor,
            overlay: scene.hud.victoryLayer.visible,
        });
    })()`)
);
check(victoryState.victory === true, 'floor-15 kill did not end the run');
check(victoryState.trapdoor === false, 'final boss still opened a trapdoor');
check(victoryState.overlay === true, 'victory overlay not shown');
await sleep(600);
const victoryShot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${SHOTS}32-victory.png`, Buffer.from(victoryShot.result.data, 'base64'));

console.log(
    JSON.stringify({ audio, volume, bombResult, afterBomb, lockedState, openedState, hudText, victoryState }, null, 2)
);
console.log(failures.length === 0 ? 'FINAL OK' : `FINAL FAIL: ${failures.join(' | ')}`);
process.exit(failures.length === 0 ? 0 : 1);
