import type * as Phaser from 'phaser';
import type { Dir } from '../types';
import type { Enemy } from './Enemy';
import type { Player } from './Player';
import type { Stats } from './stats';
import { mulberry32, shuffle } from './rng';

/** Synergy points the game already calls; items hook in here. */
export type ItemHook = 'onFire' | 'onHit' | 'onKill' | 'onRoomClear' | 'onDamage';

/** Purely visual flags the player view reads. */
export type Visual =
    | 'bigBody'
    | 'wings'
    | 'float'
    | 'halo'
    | 'darkHalo'
    | 'tracks'
    | 'orbit'
    | 'bubble';

export interface HookContext {
    player: Player;
    scene: Phaser.Scene;
    x?: number;
    y?: number;
    dir?: Dir;
    enemy?: Enemy;
    damage?: number;
    /** Area damage provided by the scene. */
    blast?: (x: number, y: number, radius: number, damage: number) => void;
}

export interface ItemDef {
    id: string;
    name: string;
    desc: string;
    color: number;
    tag: 'attack' | 'survival' | 'stat' | 'look';
    /** Permanent stat change, applied on top of every previously taken item. */
    apply?: (stats: Stats) => void;
    /** Extra visual attached to the player while owned. */
    visual?: Visual;
    hooks?: Partial<Record<ItemHook, (ctx: HookContext) => void>>;
}

export const ITEMS: readonly ItemDef[] = [
    // ---------------------------------------------------------------- attack
    {
        id: 'singe_throat',
        name: '灼喉',
        desc: '按住蓄力，头环充满自动发射穿透激光',
        color: 0xffb060,
        tag: 'attack',
        apply: (stats) => {
            stats.beam = true;
        },
    },
    {
        id: 'needle_eye',
        name: '针眼',
        desc: '泪穿透 2 个敌人，伤害 ×0.9',
        color: 0xb8e0ff,
        tag: 'attack',
        apply: (stats) => {
            stats.pierce += 2;
            stats.damage *= 0.9;
        },
    },
    {
        id: 'three_ways',
        name: '三途',
        desc: '一次 3 泪呈扇形，伤害 ×0.95',
        color: 0x9fc8e8,
        tag: 'attack',
        apply: (stats) => {
            stats.tears += 2;
            stats.spread += 24;
            stats.damage *= 0.95;
        },
    },
    {
        id: 'sniff_tear',
        name: '嗅泪',
        desc: '泪会追踪最近的敌人，伤害 ×0.95',
        color: 0xa8e6c8,
        tag: 'attack',
        apply: (stats) => {
            stats.homing += 3.2;
            stats.damage *= 0.95;
        },
    },
    {
        id: 'loop_back',
        name: '回环',
        desc: '泪飞出后折返，射程 ×1.2',
        color: 0xd8c890,
        tag: 'attack',
        apply: (stats) => {
            stats.boomerang = true;
            stats.range *= 1.2;
        },
    },
    {
        id: 'burst_tear',
        name: '爆泪',
        desc: '泪消散时爆炸，伤害 ×0.9',
        color: 0xff8a50,
        tag: 'attack',
        apply: (stats) => {
            stats.blast += 36;
            stats.damage *= 0.9;
        },
    },
    {
        id: 'wall_bounce',
        name: '弹墙',
        desc: '泪撞墙反弹 2 次',
        color: 0xc8c0b0,
        tag: 'attack',
        apply: (stats) => {
            stats.bounces += 2;
        },
    },
    {
        id: 'rot_venom',
        name: '腐毒',
        desc: '命中附加中毒，伤害 ×0.9',
        color: 0x8fbf50,
        tag: 'attack',
        apply: (stats) => {
            stats.poison += 3;
            stats.damage *= 0.9;
        },
    },
    {
        id: 'cold_drip',
        name: '冷凝',
        desc: '命中减速 45%，伤害 ×0.9',
        color: 0x9fd8e8,
        tag: 'attack',
        apply: (stats) => {
            stats.slow += 0.55;
            stats.damage *= 0.9;
        },
    },
    {
        id: 'formless',
        name: '无形',
        desc: '泪穿过岩石与坑洞，伤害 ×0.95',
        color: 0xd0d8f0,
        tag: 'attack',
        apply: (stats) => {
            stats.ghost = true;
            stats.damage *= 0.95;
        },
    },
    {
        id: 'twin_birth',
        name: '双生',
        desc: '命中分裂成 2 颗小泪，伤害 ×0.95',
        color: 0xcf9fe0,
        tag: 'attack',
        apply: (stats) => {
            stats.splits += 2;
            stats.damage *= 0.95;
        },
    },
    {
        id: 'hunter_fang',
        name: '猎牙',
        desc: '22% 概率暴击 ×2',
        color: 0xe0c050,
        tag: 'attack',
        apply: (stats) => {
            stats.crit += 0.22;
        },
    },
    {
        id: 'far_sight',
        name: '远视',
        desc: '泪飞得越远伤害越高（最多 +60%）',
        color: 0x88b8e0,
        tag: 'attack',
        apply: (stats) => {
            stats.farBonus += 0.6;
        },
    },
    {
        id: 'first_shot',
        name: '首发',
        desc: '每间房第一次射击 +80% 伤害',
        color: 0xffd0a0,
        tag: 'attack',
        apply: (stats) => {
            stats.firstBonus += 0.8;
        },
    },
    {
        id: 'scorch_ring',
        name: '灼环',
        desc: '身周持续灼烧附近敌人',
        color: 0xff9060,
        tag: 'attack',
        apply: (stats) => {
            stats.aura += 3.2;
        },
    },
    {
        id: 'sudden_rain',
        name: '骤雨',
        desc: '射速 ×1.7，伤害 ×0.9',
        color: 0x9fd0ff,
        tag: 'attack',
        apply: (stats) => {
            stats.fireRate *= 1.7;
            stats.damage *= 0.9;
        },
    },
    {
        id: 'giant_needle',
        name: '大针',
        desc: '巨泪：伤害 ×1.6，射速 ×0.75',
        color: 0xffe0a0,
        tag: 'attack',
        apply: (stats) => {
            stats.tearSize *= 1.7;
            stats.damage *= 1.6;
            stats.fireRate *= 0.75;
        },
    },
    {
        id: 'heart_piercer',
        name: '锥心',
        desc: '泪穿透 5 个敌人，伤害 ×0.9',
        color: 0xc0e8ff,
        tag: 'attack',
        apply: (stats) => {
            stats.pierce += 5;
            stats.damage *= 0.9;
        },
    },
    {
        id: 'blood_thirst',
        name: '嗜血',
        desc: '强追踪，伤害 ×1.15，射速 ×0.85',
        color: 0xd85060,
        tag: 'attack',
        apply: (stats) => {
            stats.homing += 6;
            stats.damage *= 1.15;
            stats.fireRate *= 0.85;
        },
    },
    {
        id: 'tri_split',
        name: '三裂',
        desc: '命中分裂成 3 颗小泪，伤害 ×0.9',
        color: 0xb890e0,
        tag: 'attack',
        apply: (stats) => {
            stats.splits += 3;
            stats.damage *= 0.9;
        },
    },
    {
        id: 'gale_tear',
        name: '疾风',
        desc: '弹速 ×1.5，射程 ×1.2，伤害 ×0.9',
        color: 0xc8f0ff,
        tag: 'attack',
        apply: (stats) => {
            stats.shotSpeed *= 1.5;
            stats.range *= 1.2;
            stats.damage *= 0.9;
        },
    },

    // -------------------------------------------------------------- survival
    {
        id: 'ash_shell',
        name: '灰壳',
        desc: '每间房首次受击免伤',
        color: 0xb0b8c0,
        tag: 'survival',
        apply: (stats) => {
            stats.shields += 1;
        },
    },
    {
        id: 'iron_hide',
        name: '铁皮',
        desc: '受到的所有伤害 -1',
        color: 0x889098,
        tag: 'survival',
        apply: (stats) => {
            stats.armor += 1;
        },
    },
    {
        id: 'fake_death',
        name: '假死',
        desc: '首次死亡时以半血复活',
        color: 0xa0a8d8,
        tag: 'survival',
        apply: (stats) => {
            stats.revives += 1;
        },
    },
    {
        id: 'companion',
        name: '伴灵',
        desc: '一颗环绕光点替你射击',
        color: 0x80e0d0,
        tag: 'survival',
        apply: (stats) => {
            stats.turrets += 1;
        },
    },
    {
        id: 'magnet_heart',
        name: '磁心',
        desc: '自动吸取附近掉落物',
        color: 0xd07090,
        tag: 'survival',
        apply: (stats) => {
            stats.magnet += 80;
        },
    },
    {
        id: 'thorn_back',
        name: '反刺',
        desc: '受击时向四周爆刺',
        color: 0xc08050,
        tag: 'survival',
        apply: (stats) => {
            stats.retaliate += 8;
        },
        hooks: {
            onDamage: (ctx) => {
                ctx.blast?.(ctx.player.x, ctx.player.y + 6, 64, ctx.player.stats.retaliate);
            },
        },
    },
    {
        id: 'ember_charm',
        name: '炉灰护符',
        desc: '清房回半心',
        color: 0xffa060,
        tag: 'survival',
        hooks: {
            onRoomClear: (ctx) => {
                ctx.player.heal(1);
            },
        },
    },

    // ------------------------------------------------------------------ stat
    {
        id: 'char_tooth',
        name: '焦骨牙',
        desc: '伤害 +1.5',
        color: 0xd9a06a,
        tag: 'stat',
        apply: (stats) => {
            stats.damage += 1.5;
        },
    },
    {
        id: 'wind_pipe',
        name: '漏风喉',
        desc: '射速 ×1.3',
        color: 0x9ed0ff,
        tag: 'stat',
        apply: (stats) => {
            stats.fireRate *= 1.3;
        },
    },
    {
        id: 'iron_ankle',
        name: '铁踝',
        desc: '移速 +18',
        color: 0x8a8f96,
        tag: 'stat',
        apply: (stats) => {
            stats.speed += 18;
        },
    },
    {
        id: 'long_duct',
        name: '长泪管',
        desc: '射程 +70，弹速 +25',
        color: 0xa9d4ef,
        tag: 'stat',
        apply: (stats) => {
            stats.range += 70;
            stats.shotSpeed += 25;
        },
    },
    {
        id: 'stitched_heart',
        name: '缝心',
        desc: '生命上限 +1 心',
        color: 0xd85040,
        tag: 'stat',
        apply: (stats) => {
            stats.maxHp += 2;
        },
    },
    {
        id: 'bone_nail',
        name: '骨钉',
        desc: '伤害 +2.5，射速 ×0.9',
        color: 0xc8b8a0,
        tag: 'stat',
        apply: (stats) => {
            stats.damage += 2.5;
            stats.fireRate *= 0.9;
        },
    },
    {
        id: 'boiling_blood',
        name: '沸血',
        desc: '伤害 ×1.2',
        color: 0xd85030,
        tag: 'stat',
        apply: (stats) => {
            stats.damage *= 1.2;
        },
    },
    {
        id: 'twin_pump',
        name: '双泵',
        desc: '射速 +0.6',
        color: 0x70c0e0,
        tag: 'stat',
        apply: (stats) => {
            stats.fireRate += 0.6;
        },
    },
    {
        id: 'quick_step',
        name: '疾行',
        desc: '移速 +30',
        color: 0x90c0a0,
        tag: 'stat',
        apply: (stats) => {
            stats.speed += 30;
        },
    },
    {
        id: 'thin_throat',
        name: '细喉',
        desc: '射程 +120，弹速 -10',
        color: 0x88b0c8,
        tag: 'stat',
        apply: (stats) => {
            stats.range += 120;
            stats.shotSpeed -= 10;
        },
    },
    {
        id: 'spring_vein',
        name: '弹簧',
        desc: '弹速 +40',
        color: 0xb0e0f0,
        tag: 'stat',
        apply: (stats) => {
            stats.shotSpeed += 40;
        },
    },
    {
        id: 'thick_skin',
        name: '厚皮',
        desc: '生命上限 +2 心，移速 -8',
        color: 0xc08070,
        tag: 'stat',
        apply: (stats) => {
            stats.maxHp += 4;
            stats.speed -= 8;
        },
    },
    {
        id: 'lucky_stone',
        name: '幸运石',
        desc: '幸运 +2',
        color: 0x80d090,
        tag: 'stat',
        apply: (stats) => {
            stats.luck += 2;
        },
    },
    {
        id: 'four_leaf',
        name: '四叶',
        desc: '幸运 +1，伤害 +0.8',
        color: 0x90c060,
        tag: 'stat',
        apply: (stats) => {
            stats.luck += 1;
            stats.damage += 0.8;
        },
    },
    {
        id: 'lead_ankle',
        name: '铅踝',
        desc: '移速 -10，伤害 +1.8',
        color: 0x707880,
        tag: 'stat',
        apply: (stats) => {
            stats.speed -= 10;
            stats.damage += 1.8;
        },
    },
    {
        id: 'iron_stomach',
        name: '铁胃',
        desc: '生命上限 +1 心，幸运 +1',
        color: 0xb09070,
        tag: 'stat',
        apply: (stats) => {
            stats.maxHp += 2;
            stats.luck += 1;
        },
    },
    {
        id: 'sharp_claw',
        name: '锐爪',
        desc: '伤害 +1.2，射程 +30',
        color: 0xe0d0b0,
        tag: 'stat',
        apply: (stats) => {
            stats.damage += 1.2;
            stats.range += 30;
        },
    },
    {
        id: 'long_breath',
        name: '长息',
        desc: '射程 +100',
        color: 0xa0c8d8,
        tag: 'stat',
        apply: (stats) => {
            stats.range += 100;
        },
    },
    {
        id: 'light_foot',
        name: '轻足',
        desc: '移速 +22，射速 ×1.05',
        color: 0xa0d8b0,
        tag: 'stat',
        apply: (stats) => {
            stats.speed += 22;
            stats.fireRate *= 1.05;
        },
    },

    // ------------------------------------------------------------------ look
    {
        id: 'tall_figure',
        name: '巨像',
        desc: '体型变大（仅表现）',
        color: 0xc8b8a8,
        tag: 'look',
        visual: 'bigBody',
    },
    {
        id: 'wing_bone',
        name: '翼骨',
        desc: '背后浮出一对骨翼',
        color: 0xd8d0c0,
        tag: 'look',
        visual: 'wings',
    },
    {
        id: 'light_float',
        name: '轻浮',
        desc: '脚步离地半寸',
        color: 0xb0d8f0,
        tag: 'look',
        visual: 'float',
    },
    {
        id: 'ring_light',
        name: '环光',
        desc: '头顶一圈暖光',
        color: 0xffd090,
        tag: 'look',
        visual: 'halo',
    },
    {
        id: 'dark_ring',
        name: '暗环',
        desc: '头顶一圈暗紫光',
        color: 0x8a5ad0,
        tag: 'look',
        visual: 'darkHalo',
    },
    {
        id: 'footprint',
        name: '足印',
        desc: '走过留下灰印',
        color: 0x9a8f84,
        tag: 'look',
        visual: 'tracks',
    },
    {
        id: 'satellite',
        name: '环绕',
        desc: '两颗光点绕身旋转',
        color: 0x90e0ff,
        tag: 'look',
        visual: 'orbit',
    },
    {
        id: 'soap_film',
        name: '泡膜',
        desc: '身体被一层薄泡包住',
        color: 0xa0d8f8,
        tag: 'look',
        visual: 'bubble',
    },
    {
        id: 'iron_throat',
        name: '铁喉',
        desc: '伤害 ×1.4，射速 ×0.85',
        color: 0xc8d0d8,
        tag: 'attack',
        apply: (stats) => {
            stats.damage *= 1.4;
            stats.fireRate *= 0.85;
        },
    },
    {
        id: 'leak_pot',
        name: '漏壶',
        desc: '一次 2 泪，伤害 ×0.9',
        color: 0xb8a070,
        tag: 'attack',
        apply: (stats) => {
            stats.tears += 1;
            stats.spread += 12;
            stats.damage *= 0.9;
        },
    },
    {
        id: 'long_tongue',
        name: '长舌',
        desc: '射程 +150，弹速 +30',
        color: 0xc890a0,
        tag: 'stat',
        apply: (stats) => {
            stats.range += 150;
            stats.shotSpeed += 30;
        },
    },
    {
        id: 'bone_shard',
        name: '碎骨',
        desc: '暴击 +12%，伤害 +0.7',
        color: 0xe8e0c8,
        tag: 'attack',
        apply: (stats) => {
            stats.crit += 0.12;
            stats.damage += 0.7;
        },
    },
    {
        id: 'mirage_tear',
        name: '蜃泪',
        desc: '幽灵泪 + 追踪，伤害 ×0.8',
        color: 0xa8c8f0,
        tag: 'attack',
        apply: (stats) => {
            stats.ghost = true;
            stats.homing += 2.5;
            stats.damage *= 0.9;
        },
    },
    {
        id: 'bitter_gall',
        name: '苦胆',
        desc: '爆炸泪增强，伤害 ×0.85',
        color: 0x8a9a40,
        tag: 'attack',
        apply: (stats) => {
            stats.blast += 22;
            stats.damage *= 0.95;
        },
    },
    {
        id: 'damp_air',
        name: '潮气',
        desc: '命中减速并中毒，伤害 ×0.9',
        color: 0x90b8b0,
        tag: 'attack',
        apply: (stats) => {
            stats.slow += 0.8;
            stats.poison += 1.5;
            stats.damage *= 0.9;
        },
    },
    {
        id: 'lucky_die',
        name: '幸运骰',
        desc: '幸运 +3，射速 ×1.05',
        color: 0xd8c070,
        tag: 'stat',
        apply: (stats) => {
            stats.luck += 3;
            stats.fireRate *= 1.05;
        },
    },
    {
        id: 'fine_needle',
        name: '细针',
        desc: '射速 +1.1，伤害 ×0.92',
        color: 0xd0e0e8,
        tag: 'stat',
        apply: (stats) => {
            stats.fireRate += 1.1;
            stats.damage *= 0.95;
        },
    },
    {
        id: 'ashen_lung',
        name: '灰烬之肺',
        desc: '击杀敌人时 25% 概率回半心',
        color: 0xa89080,
        tag: 'survival',
        hooks: {
            onKill: (ctx) => {
                if (Math.random() < 0.25) {
                    ctx.player.heal(1);
                }
            },
        },
    },
];

export function itemById(id: string | undefined): ItemDef | undefined {
    return id ? ITEMS.find((item) => item.id === id) : undefined;
}

/** One shuffle per run, drawn one item at a time. */
export class ItemPool {
    private readonly bag: ItemDef[];

    constructor(seed = Date.now()) {
        this.bag = shuffle(ITEMS, mulberry32(seed));
    }

    draw(): ItemDef | undefined {
        return this.bag.pop();
    }

    get remaining(): number {
        return this.bag.length;
    }
}
