import type * as Phaser from 'phaser';
import type { ItemDef } from '../core/items';

/**
 * Pixel item icons. Each glyph is a 10x10 mask; `itemIconKey` draws it at
 * 12x12 with a generated 1px dark outline and the item's own colour, so every
 * persistent pickup reads as a real icon instead of a coloured dot.
 * `.` empty / `o` base colour / `+` highlight / `=` shadow.
 */
type GlyphMask = readonly string[];

const GLYPHS: Record<string, GlyphMask> = {
    tear: [
        '....oo....',
        '...oooo...',
        '...o+oo...',
        '..oo+ooo..',
        '..oo+ooo..',
        '..oooooo..',
        '..oooooo..',
        '...oooo...',
        '....oo....',
        '..........',
    ],
    eye: [
        '..........',
        '...oooo...',
        '..oo++oo..',
        '.oooooooo.',
        '.oo+oo+oo.',
        '.oooooooo.',
        '..oooooo..',
        '...oooo...',
        '..........',
        '..........',
    ],
    fang: [
        '..........',
        '...oooo...',
        '..oooooo..',
        '..o+oooo..',
        '..o+oooo..',
        '..oooooo..',
        '...oooo...',
        '....oo....',
        '....oo....',
        '..........',
    ],
    ring: [
        '..........',
        '...oooo...',
        '..oo..oo..',
        '.oo....oo.',
        '.oo....oo.',
        '.oo....oo.',
        '..oo..oo..',
        '...oooo...',
        '..........',
        '..........',
    ],
    wing: [
        '..........',
        '..oo......',
        '.oooo.oo..',
        'ooooooooo.',
        '.ooooooo..',
        '..ooooo...',
        '...ooo....',
        '....o.....',
        '..........',
        '..........',
    ],
    heart: [
        '..........',
        '..oo..oo..',
        '.oooooooo.',
        '.oooooooo.',
        '.oooooooo.',
        '..oooooo..',
        '...oooo...',
        '....oo....',
        '..........',
        '..........',
    ],
    die: [
        '..........',
        '..oooooo..',
        '..o+o+oo..',
        '..oooooo..',
        '..oo+o+o..',
        '..oooooo..',
        '..oo+o+o..',
        '..oooooo..',
        '..........',
        '..........',
    ],
    leaf: [
        '..........',
        '....oooo..',
        '...ooooo..',
        '..ooooo...',
        '..oooo....',
        '..ooo.....',
        '.oooo.....',
        '.ooo......',
        '..........',
        '..........',
    ],
    bolt: [
        '..........',
        '....oo....',
        '...oo.....',
        '..oooooo..',
        '....ooo...',
        '...ooo....',
        '..ooo.....',
        '..oo......',
        '..........',
        '..........',
    ],
    bone: [
        '..........',
        '..oo..oo..',
        '..oooooo..',
        '...oooo...',
        '...oooo...',
        '..oooooo..',
        '..oo..oo..',
        '..........',
        '..........',
        '..........',
    ],
    orb: [
        '..........',
        '...oooo...',
        '..oo++oo..',
        '.oo+oo+oo.',
        '.oooooooo.',
        '.oooooooo.',
        '.oo+oo+oo.',
        '..oooooo..',
        '...oooo...',
        '..........',
    ],
    star: [
        '..........',
        '....oo....',
        '....oo....',
        '..oooooo..',
        '.oooooooo.',
        '...oooo...',
        '..oo..oo..',
        '.oo....oo.',
        '..........',
        '..........',
    ],
    needle: [
        '..........',
        '........oo',
        '.......oo.',
        '......oo..',
        '.....oo...',
        '....oo....',
        '...oo.....',
        '..oo......',
        '.oo.......',
        '..........',
    ],
    flame: [
        '..........',
        '....oo....',
        '...ooo....',
        '..oo+oo...',
        '..o+ooo...',
        '.ooooooo..',
        '.ooooooo..',
        '..ooooo...',
        '...ooo....',
        '..........',
    ],
    shell: [
        '..........',
        '.oooooooo.',
        '.oooooooo.',
        '..oooooo..',
        '..oooooo..',
        '...oooo...',
        '...oooo...',
        '....oo....',
        '..........',
        '..........',
    ],
    bubble: [
        '..........',
        '...oooo...',
        '..oo..oo..',
        '.oo....oo.',
        '.oo....oo.',
        '.oo....oo.',
        '..oo..oo..',
        '...oooo...',
        '..........',
        '..........',
    ],
    spiral: [
        '..........',
        '..ooooo...',
        '.oo...oo..',
        '.oo.ooooo.',
        '.oo...oo..',
        '..ooooo...',
        '....oo....',
        '..........',
        '..........',
        '..........',
    ],
    skull: [
        '..........',
        '..oooooo..',
        '.oooooooo.',
        '.oo+oo+oo.',
        '.oo+oo+oo.',
        '.oooooooo.',
        '..oooooo..',
        '...o..o...',
        '..........',
        '..........',
    ],
    tongue: [
        '..........',
        '...oooo...',
        '..oooooo..',
        '..o+oooo..',
        '..oooooo..',
        '...oooo...',
        '...oooo...',
        '....o.....',
        '..........',
        '..........',
    ],
    halo: [
        '..........',
        '..oooooo..',
        '.oo....oo.',
        '..........',
        '...oooo...',
        '..oooooo..',
        '..oooooo..',
        '...oooo...',
        '..........',
        '..........',
    ],
    print: [
        '..........',
        '...oo.....',
        '..oooo....',
        '..oooo....',
        '..oo......',
        '....oo....',
        '...oooo...',
        '...oooo...',
        '....oo....',
        '..........',
    ],
};

const SHAPE_BY_ID: Record<string, string> = {
    // attack
    singe_throat: 'flame',
    needle_eye: 'needle',
    three_ways: 'star',
    sniff_tear: 'eye',
    loop_back: 'ring',
    burst_tear: 'flame',
    wall_bounce: 'orb',
    rot_venom: 'leaf',
    cold_drip: 'tear',
    formless: 'bubble',
    twin_birth: 'orb',
    hunter_fang: 'fang',
    far_sight: 'eye',
    first_shot: 'star',
    scorch_ring: 'ring',
    sudden_rain: 'tear',
    giant_needle: 'needle',
    heart_piercer: 'fang',
    blood_thirst: 'heart',
    tri_split: 'star',
    gale_tear: 'wing',
    iron_throat: 'skull',
    leak_pot: 'tear',
    mirage_tear: 'tear',
    bitter_gall: 'flame',
    damp_air: 'bubble',
    bone_shard: 'bone',
    // survival
    ash_shell: 'shell',
    iron_hide: 'shell',
    fake_death: 'skull',
    companion: 'orb',
    magnet_heart: 'heart',
    thorn_back: 'fang',
    ember_charm: 'flame',
    ashen_lung: 'heart',
    // stat
    char_tooth: 'fang',
    wind_pipe: 'spiral',
    iron_ankle: 'bone',
    long_duct: 'spiral',
    stitched_heart: 'heart',
    bone_nail: 'bone',
    boiling_blood: 'flame',
    twin_pump: 'orb',
    quick_step: 'wing',
    thin_throat: 'needle',
    spring_vein: 'spiral',
    thick_skin: 'shell',
    lucky_stone: 'star',
    four_leaf: 'leaf',
    lead_ankle: 'bone',
    iron_stomach: 'orb',
    sharp_claw: 'fang',
    long_breath: 'bubble',
    light_foot: 'wing',
    lucky_die: 'die',
    fine_needle: 'needle',
    long_tongue: 'tongue',
    // look
    tall_figure: 'bone',
    wing_bone: 'wing',
    light_float: 'bubble',
    ring_light: 'halo',
    dark_ring: 'halo',
    footprint: 'print',
    satellite: 'orb',
    soap_film: 'bubble',
};

const TAG_SHAPE: Record<ItemDef['tag'], string> = {
    attack: 'tear',
    survival: 'heart',
    stat: 'orb',
    look: 'star',
};

const ICON_SIZE = 12;

function mix(color: number, target: number, amount: number): number {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    const tr = (target >> 16) & 0xff;
    const tg = (target >> 8) & 0xff;
    const tb = target & 0xff;
    const blend = (a: number, b2: number) => Math.round(a + (b2 - a) * amount);
    return (blend(r, tr) << 16) | (blend(g, tg) << 8) | blend(b, tb);
}

export function shapeForItem(item: ItemDef): string {
    return SHAPE_BY_ID[item.id] ?? TAG_SHAPE[item.tag] ?? 'tear';
}

/**
 * Renders one 10x10 pixel mask into a 12x12 texture with a generated 1px ink
 * outline. Shared by item icons and the HUD counters.
 */
export function makePixelIcon(
    scene: Phaser.Scene,
    key: string,
    mask: GlyphMask,
    base: number,
    accent?: number
): string {
    if (scene.textures.exists(key)) {
        return key;
    }
    const filled = (x: number, y: number): boolean =>
        y >= 0 && y < mask.length && x >= 0 && x < mask[y].length && mask[y][x] !== '.';
    const shades: Record<string, number> = {
        o: base,
        '+': mix(base, 0xffffff, 0.55),
        '=': mix(base, 0x000000, 0.45),
        x: accent ?? mix(base, 0xffffff, 0.7),
    };

    const graphics = scene.add.graphics();
    // Soft drop shadow for a little depth under the slot.
    graphics.fillStyle(0x000000, 0.32);
    for (let y = 0; y < mask.length; y += 1) {
        for (let x = 0; x < mask[y].length; x += 1) {
            if (filled(x, y)) {
                graphics.fillRect(x + 2, y + 2, 1, 1);
            }
        }
    }
    // 1px ink outline around the silhouette.
    graphics.fillStyle(0x0d0907, 1);
    for (let y = 0; y < mask.length; y += 1) {
        for (let x = 0; x < mask[y].length; x += 1) {
            if (filled(x, y)) {
                continue;
            }
            if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) {
                graphics.fillRect(x + 1, y + 1, 1, 1);
            }
        }
    }
    for (let y = 0; y < mask.length; y += 1) {
        for (let x = 0; x < mask[y].length; x += 1) {
            const char = mask[y][x];
            if (char === '.') {
                continue;
            }
            // Light falls from above: top rows are warmer/brighter.
            const lift = 0.05 + (1 - y / Math.max(1, mask.length - 1)) * 0.14;
            const shade = char === 'o' ? mix(base, 0xffffff, lift) : shades[char];
            if (shade === undefined) {
                continue;
            }
            graphics.fillStyle(shade, 1);
            graphics.fillRect(x + 1, y + 1, 1, 1);
        }
    }
    graphics.generateTexture(key, ICON_SIZE, ICON_SIZE);
    graphics.destroy();
    return key;
}

/** Builds (once) and returns the texture key for one item icon. */
export function itemIconKey(scene: Phaser.Scene, item: ItemDef): string {
    const key = `item_icon_${item.id}`;
    if (scene.textures.exists(key)) {
        return key;
    }
    const mask = GLYPHS[shapeForItem(item)] ?? GLYPHS.tear;
    return makePixelIcon(scene, key, mask, item.color);
}

export { ICON_SIZE as ITEM_ICON_SIZE };
