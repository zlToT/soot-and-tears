/**
 * Pause-menu smoke test: freeze on Esc, volume / mute controls, resume, and the
 * mobile pause button (loaded with ?touch=1).
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
const key = async (name, code, keyCode) => {
    await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: name,
        code,
        windowsVirtualKeyCode: keyCode,
        nativeVirtualKeyCode: keyCode,
    });
    await send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: name,
        code,
        windowsVirtualKeyCode: keyCode,
        nativeVirtualKeyCode: keyCode,
    });
};

const failures = [];
const check = (condition, message) => {
    if (!condition) failures.push(message);
};

await send('Page.enable');
await send('Page.bringToFront');
await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await send('Page.reload', { ignoreCache: true });
if (!(await boot())) {
    console.error('game did not boot');
    process.exit(1);
}
await sleep(500);

// --- pause with Esc ----------------------------------------------------------
await evaluate(`(() => {
    const scene = window.__sootScene;
    const room = scene.dungeon.rooms.find((r) => r.type === 'normal');
    scene.enterRoom(room, null);
    scene.player.placeAt(320, 250);
})()`);
await sleep(700);
const before = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        const enemy = scene.enemies[0];
        return JSON.stringify({ x: enemy ? enemy.x : 0, y: enemy ? enemy.y : 0 });
    })()`)
);

await key('Escape', 'Escape', 27);
await sleep(250);
const paused = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        const enemy = scene.enemies[0];
        return JSON.stringify({
            paused: scene.pausedByUser,
            layer: !!scene.pauseLayer,
            physics: scene.physics.world.isPaused,
            time: scene.time.paused,
            x: enemy ? enemy.x : 0,
            y: enemy ? enemy.y : 0,
            volumeText: scene.pauseVolumeText ? scene.pauseVolumeText.text : null,
        });
    })()`)
);
check(paused.paused === true, 'Esc did not pause');
check(paused.layer === true, 'pause panel missing');
check(paused.physics === true, 'physics kept running');
check(paused.time === true, 'scene clock kept running');
check(
    Math.abs(paused.x - before.x) < 0.5 && Math.abs(paused.y - before.y) < 0.5,
    'enemies moved while paused'
);

// volume and mute while paused
const controls = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        const v0 = scene.masterVolume;
        scene.changeVolume(-0.1, true);
        const v1 = scene.masterVolume;
        const text1 = scene.pauseVolumeText.text;
        scene.changeVolume(0.1, true);
        const wasMuted = scene.muted;
        scene.toggleMuteSilent();
        const muteText = scene.pauseMuteText.text;
        scene.toggleMuteSilent();

        scene.toggleShakeSetting();
        const shakeOff = window.__soot().settings.shake;
        scene.toggleShakeSetting();
        const shakeOn = window.__soot().settings.shake;

        scene.toggleHitStopSetting();
        scene.freeze(0.05);
        const freezeOff = scene.hitStop;
        scene.toggleHitStopSetting();
        scene.freeze(0.05);
        const freezeOn = scene.hitStop;
        scene.hitStop = 0;

        return JSON.stringify({
            v0, v1, text1, wasMuted, muteText, restored: scene.muted,
            shakeOff, shakeOn, freezeOff, freezeOn,
        });
    })()`)
);
check(controls.v1 < controls.v0, 'volume down did nothing while paused');
check(controls.text1.includes(`${Math.round(controls.v1 * 100)}%`), `volume label stale: ${controls.text1}`);
check(controls.muteText.includes('开'), `mute label did not change: ${controls.muteText}`);
check(controls.restored === controls.wasMuted, 'mute did not toggle back');
check(controls.shakeOff === false && controls.shakeOn === true, 'screen-shake setting did not toggle');
check(controls.freezeOff === 0, 'hit-stop still fired while disabled');
check(controls.freezeOn > 0, 'hit-stop did not fire when enabled');

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('docs/shots/34-pause.png', Buffer.from(shot.result.data, 'base64'));

// --- resume ------------------------------------------------------------------
await key('Escape', 'Escape', 27);
await sleep(300);
const resumed = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        return JSON.stringify({
            paused: scene.pausedByUser,
            layer: !!scene.pauseLayer,
            physics: scene.physics.world.isPaused,
            time: scene.time.paused,
        });
    })()`)
);
check(resumed.paused === false, 'Esc did not resume');
check(resumed.layer === false, 'pause panel stayed open');
check(resumed.physics === false, 'physics stayed paused');
check(resumed.time === false, 'scene clock stayed paused');

// --- mobile pause button -----------------------------------------------------
await send('Page.navigate', { url: 'http://127.0.0.1:5180/?touch=1' });
if (!(await boot())) {
    console.error('game did not boot with ?touch=1');
    process.exit(1);
}
await sleep(500);
const mobile = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        const btn = document.getElementById('pause-btn');
        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9 }));
        return JSON.stringify({
            touch: document.body.classList.contains('touch'),
            button: !!btn,
        });
    })()`)
);
check(mobile.touch === true, 'touch mode not forced');
check(mobile.button === true, 'pause button missing');
await sleep(300);
const mobilePaused = await evaluate('window.__sootScene.pausedByUser');
check(mobilePaused === true, 'mobile pause button did not pause');
await evaluate(`(() => {
    document.getElementById('pause-btn').dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, pointerId: 9 })
    );
})()`);
await sleep(300);
const mobileResumed = await evaluate('window.__sootScene.pausedByUser');
check(mobileResumed === false, 'mobile pause button did not resume');

// Leave the page on the normal (non-touch) URL for the next test.
await send('Page.navigate', { url: 'http://127.0.0.1:5180/' });

console.log(JSON.stringify({ before, paused, controls, resumed, mobile, mobilePaused, mobileResumed }, null, 2));
console.log(failures.length === 0 ? 'PAUSE OK' : `PAUSE FAIL: ${failures.join(' | ')}`);
process.exit(failures.length === 0 ? 0 : 1);
