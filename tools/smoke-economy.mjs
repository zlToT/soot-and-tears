/**
 * Economy smoke test: coins + HUD, heart pickups, breakable rocks, chests,
 * shop purchases (heart container + item), sold-state persistence.
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
await sleep(400);

// --- coins -------------------------------------------------------------------
const start = await readState();
check(start.coins === 0, `run should start with 0 coins, got ${start.coins}`);
const coinText = await evaluate('window.__sootScene.hud.coinCount.text');
check(coinText === '0', `coin HUD reads ${coinText}`);

await evaluate(`(() => {
    const scene = window.__sootScene;
    scene.player.placeAt(320, 250);
    scene.spawnCoin(334, 250);
})()`);
await sleep(400);
const coinState = await readState();
check(coinState.coins === 1, `coin not collected (${coinState.coins})`);
check(coinState.pickups.length === 0, 'coin pickup lingered');

// --- heart pickup ------------------------------------------------------------
await evaluate(`(() => {
    const scene = window.__sootScene;
    scene.player.hp = 4;
    scene.player.invuln = 0;
    scene.addPickup('halfHeart', 334, 250, 1);
})()`);
await sleep(400);
const healed = await evaluate('window.__sootScene.player.hp');
check(healed === 5, `half heart healed to ${healed}`);

// --- breakable rocks ---------------------------------------------------------
const rockResult = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        const room = scene.dungeon.rooms.find(
            (r) => r.type === 'normal' && r.obstacles.some((o) => o.kind === 'rock')
        );
        if (!room) return JSON.stringify({ skipped: true });
        scene.enterRoom(room, null);
        for (let guard = 0; guard < 6; guard += 1) { scene.enemies.slice().forEach((e) => e.takeDamage(9999, e.x, e.y - 1)); }
        const rock = scene.roomView.solids.find((o) => o.data && o.data.get('rockHp') !== undefined);
        if (!rock) return JSON.stringify({ skipped: true });
        const before = scene.room.obstacles.length;
        for (let i = 0; i < 3; i += 1) {
            const tear = scene.playerTears.spawn(rock.x - 14, rock.y, 'right', {
                damage: 1, range: 30, speed: 10,
            });
            scene.onPlayerTearWall(tear, rock);
        }
        return JSON.stringify({
            before,
            after: scene.room.obstacles.length,
            destroyed: !rock.active,
        });
    })()`)
);
if (!rockResult.skipped) {
    check(rockResult.after === rockResult.before - 1, `rock was not removed (${JSON.stringify(rockResult)})`);
    check(rockResult.destroyed === true, 'rock sprite survived three tears');
}

// --- chest -------------------------------------------------------------------
const chestResult = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        const room = scene.dungeon.rooms.find((r) => r.type === 'normal' && r.chest && !r.chest.opened);
        if (!room) return JSON.stringify({ skipped: true });
        scene.enterRoom(room, null);
        for (let guard = 0; guard < 6; guard += 1) { scene.enemies.slice().forEach((e) => e.takeDamage(9999, e.x, e.y - 1)); }
        scene.keys = 1;
        scene.hud.setConsumables(scene.bombs, scene.keys);
        const point = scene.roomView.chestPoint;
        if (!point) return JSON.stringify({ skipped: true });
        scene.player.placeAt(point.x, point.y + 12);
        return JSON.stringify({ kind: room.chest.kind, point });
    })()`)
);
if (!chestResult.skipped) {
    await sleep(500);
    const chestState = await readState();
    check(chestState.room.chest?.opened === true, 'chest did not open on touch');
    const chestShot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${SHOTS}28-chest-opened.png`, Buffer.from(chestShot.result.data, 'base64'));
}

// --- shop --------------------------------------------------------------------
let shop = null;
for (let step = 0; step < 6 && !shop; step += 1) {
    await evaluate('window.__sootScene.descend()');
    await sleep(900);
    shop = await evaluate(`(() => {
        const scene = window.__sootScene;
        if (!scene.dungeon.shop) return null;
        scene.enterRoom(scene.dungeon.shop, null);
        return JSON.stringify({ level: scene.level });
    })()`);
}
if (!shop) {
    console.error('no shop on the first six floors');
    process.exit(1);
}
await sleep(400);

const shelves = await evaluate('window.__sootScene.roomView.shelves.length');
check(shelves === 3, `expected 3 shelves, found ${shelves}`);

// first shelf becomes a cheap heart container
const beforeBuy = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        const room = scene.dungeon.shop;
        room.shopStock[0] = { kind: 'heart', price: 5, sold: false };
        scene.enterRoom(room, null);
        scene.coins = 50;
        scene.hud.setCoins(50);
        scene.nearShelf = -1;
        const shelf = scene.roomView.shelves[0];
        scene.player.placeAt(shelf.x, shelf.y + 12);
        return JSON.stringify({ maxBefore: scene.player.stats.maxHp });
    })()`)
);
await sleep(450);
const afterBuy = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        return JSON.stringify({
            coins: scene.coins,
            maxHp: scene.player.stats.maxHp,
            hp: scene.player.hp,
            sold: scene.room.shopStock[0].sold,
        });
    })()`)
);
check(afterBuy.sold === true, 'heart shelf stayed unsold');
check(afterBuy.coins === 45, `coins after purchase: ${afterBuy.coins}`);
check(afterBuy.maxHp === beforeBuy.maxBefore + 2, `max HP ${beforeBuy.maxBefore} -> ${afterBuy.maxHp}`);
check(afterBuy.hp === afterBuy.maxHp, 'heart container did not full heal');

// buy an item shelf: price it low, then step onto it
const itemBuy = JSON.parse(
    await evaluate(`(() => {
        const scene = window.__sootScene;
        const room = scene.dungeon.shop;
        const index = room.shopStock.findIndex((slot) => slot.itemId && !slot.sold);
        if (index < 0) return JSON.stringify({ skipped: true });
        room.shopStock[index].price = 5;
        scene.nearShelf = -1;
        const shelf = scene.roomView.shelves[index];
        scene.player.placeAt(shelf.x, shelf.y + 12);
        return JSON.stringify({ index, itemId: room.shopStock[index].itemId, coins: scene.coins });
    })()`)
);
if (!itemBuy.skipped) {
    await sleep(450);
    const bought = JSON.parse(
        await evaluate(`(() => {
            const scene = window.__sootScene;
            return JSON.stringify({
                coins: scene.coins,
                items: scene.player.inventory.items.map((item) => item.id),
                sold: scene.room.shopStock[${itemBuy.index}].sold,
            });
        })()`)
    );
    check(bought.sold === true, 'item shelf stayed unsold');
    check(bought.coins === itemBuy.coins - 5, `item purchase coins: ${bought.coins}`);
    check(bought.items.includes(itemBuy.itemId), `bought item missing (${bought.items})`);
}

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${SHOTS}27-shop-bought.png`, Buffer.from(shot.result.data, 'base64'));

// sold state persists across room entries
await evaluate(`(() => {
    const scene = window.__sootScene;
    const shopRoom = scene.dungeon.shop;
    scene.enterRoom(scene.dungeon.start, null);
    scene.enterRoom(shopRoom, null);
})()`);
await sleep(350);
const persisted = await evaluate(
    `JSON.stringify(window.__sootScene.room.shopStock.map((slot) => slot.sold))`
);
check(JSON.parse(persisted)[0] === true, `sold state lost on re-entry (${persisted})`);

// --- room clear drops coins ---------------------------------------------------
const clearDrops = JSON.parse(
    await evaluate(`(async () => {
        const scene = window.__sootScene;
        const rooms = scene.dungeon.rooms.filter((r) => r.type === 'normal' && !r.cleared);
        const tried = [];
        const wipe = () => {
            for (let guard = 0; guard < 6; guard += 1) {
                scene.enemies.slice().forEach((e) => e.takeDamage(9999, e.x, e.y - 1));
            }
        };
        for (const room of rooms) {
            scene.enterRoom(room, null);
            const before = scene.pickups.length;
            const enemies = scene.enemies.length;
            const realRandom = Math.random;
            Math.random = () => 0.1; // force both the coin roll and the heart roll
            wipe();
            // 泥娃娃会化泥 2.4s 后复原，等它回来再补一轮，否则房间永远不清。
            if (scene.enemies.length > 0) {
                await new Promise((resolve) => setTimeout(resolve, 2600));
                wipe();
            }
            Math.random = realRandom;
            tried.push({ gx: room.gx, gy: room.gy, before, after: scene.pickups.length, enemies, dead: scene.dead, hp: scene.player.hp, cleared: room.cleared, left: scene.enemies.length, kinds: scene.enemies.map((e) => e.kind), grace: scene.spawnGrace, tr: scene.transitioning });
            if (scene.pickups.length > before) {
                return JSON.stringify({ spawned: true, tried });
            }
        }
        return JSON.stringify({ spawned: false, tried });
    })()`)
);
check(clearDrops.spawned === true, `room clear spawned no pickups (${JSON.stringify(clearDrops)})`);

console.log(
    JSON.stringify(
        { start: start.coins, coinState: coinState.coins, healed, rockResult, chestResult, shop: JSON.parse(shop), afterBuy, itemBuy },
        null,
        2
    )
);
console.log(failures.length === 0 ? 'ECONOMY OK' : `ECONOMY FAIL: ${failures.join(' | ')}`);
process.exit(failures.length === 0 ? 0 : 1);
