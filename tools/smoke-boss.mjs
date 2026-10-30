/**
 * Boss smoke test: enters the boss room, checks the health bar, phase change,
 * attacks, and that killing the boss clears the room and opens the trapdoor.
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
const readState = async () => JSON.parse(await evaluate('JSON.stringify(window.__soot())'));

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

await evaluate(`(() => {
    const scene = window.__sootScene;
    scene.enterRoom(scene.dungeon.boss, null);
})()`);
await sleep(1800);

const spawned = await readState();
check(spawned.room.type === 'boss', `not in a boss room (${spawned.room.type})`);
check(spawned.boss !== null, 'no boss spawned');
if (spawned.boss) {
    check(spawned.boss.hp === spawned.boss.maxHp, 'boss did not start at full hp');
    check(spawned.boss.maxHp >= 90, `boss hp too low (${spawned.boss.maxHp})`);
}

const shotA = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${SHOTS}13-boss-room.png`, Buffer.from(shotA.result.data, 'base64'));

// The boss should start attacking within a few seconds.
const attacked = JSON.parse(
    await evaluate(`(async () => {
        const scene = window.__sootScene;
        let maxTears = 0;
        for (let i = 0; i < 60; i += 1) {
            scene.player.hp = scene.player.stats.maxHp;
            await new Promise((resolve) => setTimeout(resolve, 100));
            maxTears = Math.max(maxTears, scene.enemyTears.group.getLength());
        }
        return JSON.stringify({ maxTears });
    })()`)
);
check(attacked.maxTears > 0, 'boss never attacked');

// Phase two at 50% hp.
const phase = JSON.parse(
    await evaluate(`(() => {
        const boss = window.__sootScene.boss;
        boss.takeDamage(boss.maxHp * 0.55, 0, 0);
        return JSON.stringify({ hp: boss.hp, maxHp: boss.maxHp, phase: boss.phase, dead: boss.dead });
    })()`)
);
check(phase.phase === 2, `boss did not enrage at 50% (phase ${phase.phase})`);

// Killing it must clear the room and reveal the trapdoor.
await evaluate(`(() => {
    const boss = window.__sootScene.boss;
    boss.takeDamage(boss.hp + 10, 0, 0);
})()`);
await sleep(900);
const cleared = await readState();
check(cleared.boss === null, 'boss still registered after death');
check(cleared.room.cleared === true, 'boss room did not clear');
check(cleared.room.trapdoor === true, 'trapdoor did not appear');
const barHidden = await evaluate('window.__sootScene.hud.bossBar.visible === false');
check(barHidden === true, 'boss health bar stayed visible');

const shotB = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${SHOTS}14-boss-cleared.png`, Buffer.from(shotB.result.data, 'base64'));

// --- every boss kind can spawn and attack -----------------------------------
const kinds = ['granny', 'flyking', 'tumor', 'grandpa', 'chandelier', 'drain', 'greedgut', 'attic', 'armor', 'hush', 'pitlord', 'pale', 'nameless'];
const seen = [];
for (const kind of kinds) {
    await evaluate(`window.__sootScene.debugBoss('${kind}')`);
    await sleep(700);
    const info = JSON.parse(
        await evaluate(
            `JSON.stringify({ kind: window.__sootScene.boss && window.__sootScene.boss.kind, hp: window.__sootScene.boss && window.__sootScene.boss.hp })`
        )
    );
    check(info.kind === kind, `debugBoss(${kind}) produced ${info.kind}`);

    const fired = JSON.parse(
        await evaluate(`(async () => {
            const scene = window.__sootScene;
            scene.enemyTears.clear();
            let max = 0;
            for (let i = 0; i < 35; i += 1) {
                scene.player.hp = scene.player.stats.maxHp;
                await new Promise((resolve) => setTimeout(resolve, 100));
                max = Math.max(max, scene.enemyTears.group.getLength());
            }
            return JSON.stringify({ max });
        })()`)
    );
    seen.push({ kind, tears: fired.max });
    // 装甲蛆靠冲撞而不是弹幕，不能用泪数量判断“有没有攻击”。
    if (kind !== 'armor') {
        check(fired.max > 0, `${kind} never attacked`);
    }

    if (kind === 'drain' || kind === 'greedgut') {
        const seg = JSON.parse(
            await evaluate(`(() => {
                const boss = window.__sootScene.boss;
                const last = boss.segments[boss.segments.length - 1];
                return JSON.stringify({
                    count: boss.segments.length,
                    hit: boss.hitTest(last.sprite.x, last.sprite.y),
                });
            })()`)
        );
        check(seg.count >= 2, `${kind} has no body segments`);
        check(seg.hit === true, `${kind} tail segment is not hittable`);
    }

    if (kind === 'armor') {
        const armor = JSON.parse(
            await evaluate(`(() => {
                const boss = window.__sootScene.boss;
                // 钻地（idle）时才免疫；先固定状态，避免赶上滑行帧。
                boss.state = 'idle';
                boss.timer = 1;
                const before = boss.hp;
                boss.takeDamage(10, boss.x, boss.y);
                const burrowed = boss.hp;
                boss.state = 'slide';
                const tail = boss.segments[boss.segments.length - 1];
                boss.takeDamage(10, tail.sprite.x, tail.sprite.y);
                return JSON.stringify({ before, burrowed, tailHit: boss.hp });
            })()`)
        );
        check(armor.burrowed === armor.before, 'armor grub took damage while burrowed');
        check(armor.tailHit < armor.burrowed, 'armor grub tail took no damage');
    }

    if (kind === 'hush') {
        const hush = JSON.parse(
            await evaluate(`(() => {
                const boss = window.__sootScene.boss;
                boss.takeDamage(boss.maxHp * 0.3, 0, 0);
                return JSON.stringify({ teleports: boss.teleports });
            })()`)
        );
        check(hush.teleports >= 1, 'hush did not teleport at 75%');
    }

    const shotIndex = {
        tumor: '15',
        chandelier: '16',
        drain: '17',
        greedgut: '18',
        attic: '19',
        armor: '20',
        hush: '21',
        pitlord: '22',
        pale: '23',
        nameless: '24',
    }[kind];
    if (shotIndex) {
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(`${SHOTS}${shotIndex}-boss-${kind}.png`, Buffer.from(shot.result.data, 'base64'));
    }
}

await evaluate(`(() => {
    const scene = window.__sootScene;
    if (scene.boss) scene.boss.destroy();
    scene.boss = undefined;
    scene.hud.clearBoss();
})()`);

console.log(
    JSON.stringify({ spawned: spawned.boss, attacked, phase, cleared: cleared.room, seen }, null, 2)
);
console.log(failures.length === 0 ? 'BOSS OK' : `BOSS FAIL: ${failures.join(' | ')}`);
process.exit(failures.length === 0 ? 0 : 1);
