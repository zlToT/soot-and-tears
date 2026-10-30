/**
 * Save-slot smoke test: floor checkpoint in slot 0, integrity checksum,
 * multi-slot hint, resuming a chosen slot with 1/2/3, and death clearing only
 * the active slot.
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

const boot = async () => {
    for (let i = 0; i < 40; i += 1) {
        await sleep(250);
        if ((await evaluate('typeof window.__sootMenu')) === 'object') {
            await evaluate('window.__sootMenu.start()');
            await sleep(1200);
        }
        if ((await evaluate('typeof window.__soot')) === 'function') {
            return true;
        }
    }
    return false;
};

const pressKey = async (key, code, keyCode) => {
    await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code,
        windowsVirtualKeyCode: keyCode,
        nativeVirtualKeyCode: keyCode,
    });
    await send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key,
        code,
        windowsVirtualKeyCode: keyCode,
        nativeVirtualKeyCode: keyCode,
    });
};

await send('Page.enable');
await send('Page.bringToFront');
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await evaluate(
    `['soot-save-v1','soot-save-v2-slot0','soot-save-v2-slot1','soot-save-v2-slot2'].forEach((key) => localStorage.removeItem(key))`
);
await send('Page.reload', { ignoreCache: true });
if (!(await boot())) {
    console.error('game did not boot');
    process.exit(1);
}
await sleep(400);

// --- slot 0 checkpoint -------------------------------------------------------
await evaluate(`(() => {
    const scene = window.__sootScene;
    scene.player.addItem({ id: 'char_tooth', name: '焦骨牙', desc: '', color: 0xd9a06a, apply: (s) => { s.damage += 1.5; } });
    scene.player.addHeartContainer();
    scene.coins = 42;
    scene.bombs = 5;
    scene.keys = 3;
    scene.player.hp = scene.player.stats.maxHp;
    return null;
})()`);
await evaluate('window.__sootScene.descend()');
await sleep(900);
await evaluate('window.__sootScene.descend()');
await sleep(900);

const saved = JSON.parse(
    await evaluate(`(() => {
        const raw = localStorage.getItem('soot-save-v2-slot0');
        const file = raw ? JSON.parse(raw) : null;
        return JSON.stringify({
            file,
            valid: window.__sootScene.readSlot(0),
            state: window.__soot(),
        });
    })()`)
);
check(saved.file !== null, 'slot 0 was not written');
check(typeof saved.file?.sum === 'number', 'slot 0 has no checksum');
check(saved.file?.data?.level === 3, `slot 0 level ${saved.file?.data?.level}`);
check(saved.file?.data?.coins === 42, `slot 0 coins ${saved.file?.data?.coins}`);
check(saved.valid !== null, 'slot 0 checksum failed right after writing');

// seed a second slot with a deeper checkpoint
await evaluate(`(() => {
    window.__sootScene.writeSlot(1, {
        v: 1, level: 5, hp: 8, kills: 9, coins: 7, bombs: 1, keys: 0,
        runTime: 61, items: [], heartBonus: 0,
    });
})()`);

// --- reload: multi-slot hint -------------------------------------------------
await send('Page.reload', { ignoreCache: true });
if (!(await boot())) {
    console.error('game did not boot after reload');
    process.exit(1);
}
await sleep(500);
const hinted = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        return JSON.stringify({
            level: scene.level,
            slots: scene.saveSlots.map((slot) => (slot ? slot.level : null)),
            active: scene.activeSlot,
            hint: scene.hud.continueHint ? scene.hud.continueHint.visible : false,
            hintText: scene.hud.continueHint ? scene.hud.continueHint.text : '',
        });
    })()`)
);
check(hinted.level === 1, `fresh run should start at B1 (${hinted.level})`);
check(JSON.stringify(hinted.slots) === JSON.stringify([3, 5, null]), `slot cache wrong: ${JSON.stringify(hinted.slots)}`);
check(hinted.hint === true, 'continue hint hidden');
check(hinted.hintText.includes('1) B3') && hinted.hintText.includes('2) B5'), `hint text: ${hinted.hintText}`);

const hintShot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('docs/shots/33-continue.png', Buffer.from(hintShot.result.data, 'base64'));

// --- resume slot 2 (keyboard "2") -------------------------------------------
await pressKey('2', 'Digit2', 50);
await sleep(800);
const resumed = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        return JSON.stringify({
            level: scene.level,
            active: scene.activeSlot,
            coins: scene.coins,
            kills: scene.kills,
            hint: scene.hud.continueHint ? scene.hud.continueHint.visible : false,
            roomType: scene.room.type,
        });
    })()`)
);
check(resumed.level === 5, `slot 2 continue landed on B${resumed.level}`);
check(resumed.active === 1, `active slot ${resumed.active}`);
check(resumed.coins === 7, `slot 2 coins ${resumed.coins}`);
check(resumed.hint === false, 'continue hint stayed visible');
check(resumed.roomType === 'start', 'continue did not land in a start room');

// --- death only clears the active slot --------------------------------------
await evaluate(`(() => {
    const scene = window.__sootScene;
    scene.player.invuln = 0;
    scene.player.hp = 1;
    scene.player.takeDamage(99, 0, 0);
})()`);
await sleep(400);
const afterDeath = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        return JSON.stringify({
            dead: scene.dead,
            slot0: localStorage.getItem('soot-save-v2-slot0'),
            slot1: localStorage.getItem('soot-save-v2-slot1'),
            active: scene.activeSlot,
        });
    })()`)
);
check(afterDeath.dead === true, 'player did not die');
check(afterDeath.slot1 === null, 'active slot survived death');
check(afterDeath.slot0 !== null, 'other slot was cleared by death');

// --- checksum rejects tampered data -----------------------------------------
await evaluate(`(() => {
    const scene = window.__sootScene;
    scene.writeSlot(2, {
        v: 1, level: 4, hp: 8, kills: 0, coins: 11, bombs: 2, keys: 1,
        runTime: 10, items: [], heartBonus: 0,
    });
    const raw = JSON.parse(localStorage.getItem('soot-save-v2-slot2'));
    raw.data.coins = 9999; // keep the old checksum on purpose
    localStorage.setItem('soot-save-v2-slot2', JSON.stringify(raw));
})()`);
const tampered = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        return JSON.stringify({
            read: scene.readSlot(2),
            raw: localStorage.getItem('soot-save-v2-slot2'),
        });
    })()`)
);
check(tampered.read === null, 'tampered slot was accepted');
check(tampered.raw === null, 'tampered slot was not removed');

console.log(JSON.stringify({ saved, hinted, resumed, afterDeath, tampered }, null, 2));
console.log(failures.length === 0 ? 'SAVE OK' : `SAVE FAIL: ${failures.join(' | ')}`);
process.exit(failures.length === 0 ? 0 : 1);
