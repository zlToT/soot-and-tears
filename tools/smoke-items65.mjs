/**
 * 65-item smoke test: item pool size, multishot, pierce, crit, blast, poison,
 * beam, shields, armor, revive, drops + pickup.
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

// --- item pool ---------------------------------------------------------------
const pool = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        return JSON.stringify({
            remaining: scene.itemPool.remaining,
            items: scene.player.inventory.items.length,
        });
    })()`)
);
check(pool.remaining === 65, `item pool should hold 65 items, got ${pool.remaining}`);

// --- one synchronous mechanics pass -----------------------------------------
const result = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        const out = {};
        const room = scene.dungeon.rooms.find((r) => r.type === 'normal');
        scene.enterRoom(room, null);
        let guard = 0;
        while (scene.enemies.length < 5 && guard < 6) {
            scene.spawnWave(room);
            guard += 1;
        }
        scene.player.placeAt(320, 250);
        // 出场动画期间子弹不掉血；本测试直接验证伤害逻辑。
        scene.spawnGrace = 0;
        scene.enemies.forEach((e, i) => {
            e.sprite.body.reset(360 + i * 12, 140);
            e.hp = e.maxHp = 200;
        });

        // multishot: 3 tears, 24 degree fan
        scene.player.inventory.add({
            id: 'test_fan', name: 'F', desc: '', color: 0,
            apply: (s) => { s.tears = 2; s.spread = 24; },
        });
        scene.player.onRoomEnter();
        scene.playerTears.clear();
        scene.player.update(0.016, { mx: 0, my: 0, shootDir: 'up' });
        const volley = scene.playerTears.group.getChildren();
        out.volley = volley.length;
        out.angles = volley.map((t) => Math.round(t.angle));
        scene.player.inventory.items.pop();
        scene.player.inventory.recompute();

        // pierce: the tear survives the first hit
        const a = scene.enemies[0];
        const pierce = scene.playerTears.spawn(a.x, a.y, 'right', {
            damage: 5, range: 80, speed: 1, pierce: 1,
        });
        const hpBefore = a.hp;
        scene.onPlayerTearEnemy(pierce, a.sprite);
        out.pierceSurvived = pierce.active;
        out.pierceDamage = hpBefore - a.hp;

        // splits: a popped tear leaves two smaller tears behind
        scene.playerTears.clear();
        const split = scene.playerTears.spawn(320, 250, 'right', {
            damage: 6, range: 80, speed: 120, splits: 2,
        });
        scene.playerTears.pop(split);
        out.splits = scene.playerTears.group.getChildren().length;

        // homing: the tear turns toward the target
        scene.playerTears.clear();
        const homing = scene.playerTears.spawn(300, 250, 'left', {
            damage: 1, range: 80, speed: 100, homing: 6,
        });
        scene.playerTears.update(0.1, [{ x: 300, y: 100 }]);
        out.homingTurned = homing.body.velocity.y < 0;
        scene.playerTears.clear();

        // blast: pop damages neighbours
        const b = scene.enemies[1];
        const blast = scene.playerTears.spawn(b.x - 10, b.y, 'right', {
            damage: 4, range: 80, speed: 1, blast: 40,
        });
        const bHp = b.hp;
        scene.playerTears.pop(blast);
        out.blastDamage = bHp - b.hp;

        // crit: a rolled crit doubles the damage
        const c = scene.enemies[2];
        const crit = scene.playerTears.spawn(c.x, c.y, 'right', {
            damage: 4, range: 80, speed: 1, crit: 1,
        });
        const cHp = c.hp;
        const rolled = scene.playerTears.rollDamage(crit);
        out.critDouble = Math.abs(rolled.damage - 8) < 1e-6;
        out.rolledCrit = rolled.crit;
        scene.onPlayerTearEnemy(crit, c.sprite);
        out.critDamage = cHp - c.hp;

        // beam: everything on the ray takes damage
        const bx = 300, by = 200;
        const d = scene.enemies[3];
        d.sprite.body.reset(420, 200);
        const dHp = d.hp;
        scene.fireBeam(bx, by, 'right', 9, 180);
        out.beamDamage = dHp - d.hp;

        // poison ticks on the enemy
        const e = scene.enemies[4];
        e.applyPoison(4, 2);
        for (let i = 0; i < 10; i += 1) {
            e.tickPoison(0.1);
        }
        out.poisonDamage = 200 - e.hp;

        // shields absorb the first hit of a room
        scene.player.stats.shields = 1;
        scene.player.onRoomEnter();
        scene.player.invuln = 0;
        const hp0 = scene.player.hp;
        scene.player.takeDamage(2, 0, 0);
        out.shieldBlocked = scene.player.hp === hp0;

        // armour reduces every hit by 1
        scene.player.stats.shields = 0;
        scene.player.stats.armor = 1;
        scene.player.invuln = 0;
        const hp1 = scene.player.hp;
        scene.player.takeDamage(3, 0, 0);
        out.armorDamage = hp1 - scene.player.hp;

        // revive: lethal hit leaves the player at half hearts
        scene.player.stats.armor = 0;
        scene.player.stats.revives = 1;
        scene.player.invuln = 0;
        scene.player.hp = 1;
        scene.player.takeDamage(9, 0, 0);
        out.revived = !scene.player.dead;
        out.reviveHp = scene.player.hp;

        return JSON.stringify(out);
    })()`)
);

check(result.volley === 3, `multishot should spawn 3 tears, got ${result.volley}`);
check(new Set(result.angles).size === 3, `multishot fan is flat: ${result.angles}`);
check(result.pierceSurvived === true, 'piercing tear popped on the first hit');
check(Math.abs(result.pierceDamage - 5) < 1e-6, `pierce damage ${result.pierceDamage}`);
check(result.splits === 2, `split produced ${result.splits} tears`);
check(result.homingTurned === true, 'homing tear did not steer');
check(result.blastDamage > 0, 'blast dealt no splash damage');
check(result.rolledCrit === true, 'guaranteed crit did not roll');
check(Math.abs(result.critDamage - 8) < 1e-6, `crit damage was ${result.critDamage}`);
check(result.beamDamage > 0, 'beam missed the enemy on its ray');
check(result.poisonDamage > 1, `poison ticked ${result.poisonDamage}`);
check(result.shieldBlocked === true, 'shield did not absorb the hit');
check(Math.abs(result.armorDamage - 2) < 1e-6, `armour damage was ${result.armorDamage}`);
check(result.revived === true, 'revive did not trigger');
check(result.reviveHp === 4, `revive left ${result.reviveHp} hp (expected half of 8)`);

// --- drop + pickup ------------------------------------------------------------
const drop = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        scene.player.placeAt(320, 250);
        scene.player.stats.magnet = 0;
        scene.dropItem(332, 250, { id: 'test_drop', name: '测试掉落', desc: '', color: 0xffffff });
        return JSON.stringify({ drops: scene.pickups.length });
    })()`)
);
check(drop.drops === 1, 'drop was not spawned');
await sleep(400);
const picked = await evaluate('window.__soot().items.includes("test_drop")');
check(picked === true, 'drop was not picked up');

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('docs/shots/25-items65.png', Buffer.from(shot.result.data, 'base64'));

// --- cosmetic items + turret orbit -------------------------------------------
const lookCount = await evaluate(`(() => {
    const scene = window.__sootScene;
    ['bigBody', 'wings', 'float', 'halo', 'tracks', 'orbit', 'bubble'].forEach((visual) => {
        scene.player.addItem({ id: 'look_' + visual, name: 'L', desc: '', color: 0xffffff, visual });
    });
    scene.player.addItem({ id: 'turret', name: 'T', desc: '', color: 0x80e0d0, apply: (s) => { s.turrets = 1; } });
    return scene.player.inventory.items.length;
})()`);
check(lookCount >= 9, `look items were not applied (${lookCount})`);
await sleep(500);
const orbit = await evaluate('window.__sootScene.player.orbiters.length');
check(orbit === 1, `turret orbit missing (${orbit})`);

const lookShot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('docs/shots/26-item-visuals.png', Buffer.from(lookShot.result.data, 'base64'));

console.log(JSON.stringify({ pool, result }, null, 2));
console.log(failures.length === 0 ? 'ITEMS65 OK' : `ITEMS65 FAIL: ${failures.join(' | ')}`);
process.exit(failures.length === 0 ? 0 : 1);
