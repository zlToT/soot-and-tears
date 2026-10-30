/**
 * Content audit (no browser): counts enemies and items, checks that every item
 * has an effect and every enemy has stats, a texture on disk and a behaviour case.
 * Run: node tools/check-content.mjs
 */
import { existsSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const items = read('src/game/core/items.ts');
const types = read('src/game/types.ts');
const consts = read('src/game/const.ts');
const enemy = read('src/game/core/Enemy.ts');

const ids = [...items.matchAll(/id: '([a-z0-9_]+)'/g)].map((match) => match[1]);
const tags = [...items.matchAll(/\n {8}tag: '(attack|survival|stat|look)',/g)].map(
    (match) => match[1]
);
const byTag = tags.reduce((acc, tag) => {
    acc[tag] = (acc[tag] ?? 0) + 1;
    return acc;
}, {});

const noEffect = [];
for (let i = 0; i < ids.length; i += 1) {
    const start = items.indexOf(`id: '${ids[i]}'`);
    const end = i + 1 < ids.length ? items.indexOf(`id: '${ids[i + 1]}'`) : items.length;
    const block = items.slice(start, end);
    if (!/apply:|hooks:|visual:/.test(block)) {
        noEffect.push(ids[i]);
    }
}

const union = types.match(/export type EnemyKind =([\s\S]*?);/)[1];
const kinds = [...union.matchAll(/'([a-zA-Z]+)'/g)].map((match) => match[1]);
const enemyStatsBlock = consts.match(/export const ENEMY_STATS = \{([\s\S]*?)\} as const;/)[1];
const statsKeys = [...enemyStatsBlock.matchAll(/^ {4}([a-zA-Z]+): \{ hp: /gm)].map(
    (match) => match[1]
);
const texKeys = [
    ...consts
        .matchAll(/^ {4}([a-zA-Z]+): 'enemy_[a-z_]+',/gm),
].map((match) => match[1]);
const pngPaths = [...consts.matchAll(/assets\/sprites\/enemy\/([a-z_]+)\.png/g)].map(
    (match) => `public/assets/sprites/enemy/${match[1]}.png`
);
const cases = new Set(
    [...enemy.matchAll(/case '([a-zA-Z]+)':/g)].map((match) => match[1])
);

const missingStats = kinds.filter((kind) => !statsKeys.includes(kind));
const missingTextureKey = kinds.filter((kind) => !texKeys.includes(kind));
const missingPng = pngPaths.filter((path) => !existsSync(path));
const missingCase = kinds.filter((kind) => !cases.has(kind));

const expectedTags = { attack: 27, survival: 8, stat: 22, look: 8 };
const tagOk =
    Object.keys(expectedTags).every((tag) => (byTag[tag] ?? 0) === expectedTags[tag]) &&
    tags.length === 65;

const failures = [];
if (ids.length !== 65 || new Set(ids).size !== 65) {
    failures.push(`expected 65 unique items, got ${ids.length} (${new Set(ids).size} unique)`);
}
if (!tagOk) {
    failures.push(`tag split mismatch: ${JSON.stringify(byTag)}`);
}
if (noEffect.length > 0) {
    failures.push(`items with no effect: ${noEffect.join(', ')}`);
}
if (kinds.length !== 14) {
    failures.push(`expected 14 enemy kinds, got ${kinds.length}`);
}
if (missingStats.length > 0) {
    failures.push(`enemies missing stats: ${missingStats.join(', ')}`);
}
if (missingTextureKey.length > 0) {
    failures.push(`enemies missing texture keys: ${missingTextureKey.join(', ')}`);
}
if (missingPng.length > 0) {
    failures.push(`missing enemy PNGs: ${missingPng.join(', ')}`);
}
if (missingCase.length > 0) {
    failures.push(`enemies without a behaviour case: ${missingCase.join(', ')}`);
}

console.log(
    JSON.stringify(
        {
            items: { total: ids.length, unique: new Set(ids).size, byTag, noEffect },
            enemies: {
                kinds: kinds.length,
                stats: statsKeys.length,
                textures: texKeys.length,
                pngOnDisk: pngPaths.length,
                behaviourCases: cases.size,
            },
        },
        null,
        2
    )
);
console.log(failures.length === 0 ? 'CONTENT OK' : `CONTENT FAIL: ${failures.join(' | ')}`);
process.exit(failures.length === 0 ? 0 : 1);
