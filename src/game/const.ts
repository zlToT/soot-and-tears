export const GAME_W = 640;
export const GAME_H = 360;

/** Room shell: 18x9 tiles of 32px + a 24px wall band. */
export const ROOM_X = 8;
export const ROOM_Y = 12;
export const ROOM_W = 624;
export const ROOM_H = 336;
export const WALL = 24;
export const TILE = 32;

export const PLAY_X = ROOM_X + WALL;
export const PLAY_Y = ROOM_Y + WALL;
export const PLAY_W = ROOM_W - WALL * 2;
export const PLAY_H = ROOM_H - WALL * 2;
export const PLAY_RIGHT = PLAY_X + PLAY_W;
export const PLAY_BOTTOM = PLAY_Y + PLAY_H;
export const ROOM_CX = ROOM_X + ROOM_W / 2;
export const ROOM_CY = ROOM_Y + ROOM_H / 2;

export const DIRS = ['up', 'down', 'left', 'right'] as const;

export const PLAYER = {
    maxHp: 8, // half hearts: 4 hearts
    damage: 3.5,
    fireRate: 2.8, // tears per second
    speed: 140,
    range: 315,
    shotSpeed: 345,
    tearRadius: 4.5,
    /** Foot hitbox radius. Centred low so rocks and walls stop the visible feet. */
    bodyRadius: 7,
    invuln: 1.25,
    hitStun: 0.2,
    accel: 1900,
    decel: 1450,
} as const;

export const ENEMY_STATS = {
    grub: { hp: 7, radius: 12, speed: 48, contact: 1, flying: false },
    moth: { hp: 6, radius: 12, speed: 39, contact: 1, flying: true },
    spitter: { hp: 10, radius: 12, speed: 0, contact: 1, flying: false },
    rat: { hp: 5, radius: 9, speed: 155, contact: 1, flying: false },
    hop: { hp: 9, radius: 10, speed: 50, contact: 1, flying: false },
    boomMoth: { hp: 7, radius: 11, speed: 55, contact: 1, flying: true },
    toad: { hp: 12, radius: 12, speed: 55, contact: 1, flying: false },
    maw: { hp: 10, radius: 12, speed: 32, contact: 1, flying: true },
    doll: { hp: 10, radius: 11, speed: 50, contact: 1, flying: false },
    mask: { hp: 16, radius: 12, speed: 38, contact: 1, flying: false },
    vis: { hp: 11, radius: 10, speed: 26, contact: 1, flying: false },
    shadeMoth: { hp: 8, radius: 11, speed: 34, contact: 1, flying: true },
    splitGrub: { hp: 16, radius: 13, speed: 40, contact: 1, flying: false },
    thornRoll: { hp: 18, radius: 12, speed: 118, contact: 1, flying: false },
} as const;

export const BOSS_STATS = {
    granny: { hp: 120, radius: 22, contact: 2, speed: 26, scale: 1.5 },
    flyking: { hp: 90, radius: 18, contact: 2, speed: 60, scale: 1.35 },
    tumor: { hp: 140, radius: 26, contact: 2, speed: 0, scale: 1.6 },
    grandpa: { hp: 160, radius: 24, contact: 2, speed: 30, scale: 1.55 },
    chandelier: { hp: 180, radius: 20, contact: 1, speed: 0, scale: 1.5 },
    drain: { hp: 150, radius: 16, contact: 2, speed: 92, scale: 1.2 },
    greedgut: { hp: 170, radius: 20, contact: 2, speed: 62, scale: 1.3 },
    attic: { hp: 150, radius: 20, contact: 2, speed: 0, scale: 1.4 },
    armor: { hp: 170, radius: 16, contact: 2, speed: 150, scale: 1.2 },
    hush: { hp: 220, radius: 24, contact: 2, speed: 0, scale: 1.4 },
    pitlord: { hp: 240, radius: 26, contact: 2, speed: 0, scale: 1.5 },
    pale: { hp: 260, radius: 22, contact: 2, speed: 0, scale: 1.45 },
    nameless: { hp: 300, radius: 26, contact: 2, speed: 0, scale: 1.55 },
} as const;

export const TEAR_COLORS = {
    player: 0xa9d4ef,
    enemy: 0xc46a5a,
} as const;

export const TEX = {
    hero: (dir: string, frame: number) => `hero_${dir}_${frame}`,
    grub: 'enemy_grub',
    moth: 'enemy_moth',
    spitter: 'enemy_spitter',
    rat: 'enemy_rat',
    hop: 'enemy_hop',
    boomMoth: 'enemy_boom_moth',
    toad: 'enemy_toad',
    maw: 'enemy_maw',
    doll: 'enemy_doll',
    mask: 'enemy_mask',
    vis: 'enemy_vis',
    shadeMoth: 'enemy_shade_moth',
    splitGrub: 'enemy_split_grub',
    thornRoll: 'enemy_thorn_roll',
    bossGranny: 'boss_granny',
    bossFlyking: 'boss_flyking',
    bossTumor: 'boss_tumor',
    bossGrandpa: 'boss_grandpa',
    bossChandelier: 'boss_chandelier',
    bossDrainHead: 'boss_drain_head',
    bossDrainBody: 'boss_drain_body',
    bossGreedgutHead: 'boss_greedgut_head',
    bossGreedgutBody: 'boss_greedgut_body',
    bossAttic: 'boss_attic',
    bossArmorHead: 'boss_armor_head',
    bossArmorBody: 'boss_armor_body',
    bossHush: 'boss_hush',
    bossPitlord: 'boss_pitlord',
    bossPale: 'boss_pale',
    bossNameless: 'boss_nameless',
    tear: 'fx_tear',
    shadow: 'fx_shadow',
    heartFull: 'ui_heart_full',
    heartHalf: 'ui_heart_half',
    heartEmpty: 'ui_heart_empty',
    floor: (i: number) => `terrain_floor_${i}`,
    floorBaked: 'terrain_floor_baked',
    wall: 'terrain_wall',
    wallV: 'terrain_wall_v',
    doorClosed: 'terrain_door_closed',
    doorOpen: 'terrain_door_open',
    torch: 'terrain_torch',
    rock: 'terrain_rock',
    glow: 'fx_glow',
    vignette: 'fx_vignette',
} as const;

const BASE_ASSETS: ReadonlyArray<{ key: string; path: string }> = [
    ...['down', 'left', 'right', 'up'].flatMap((dir) =>
        [0, 1].map((frame) => ({
            key: TEX.hero(dir, frame),
            path: `assets/sprites/hero/${dir}_${frame}.png`,
        }))
    ),
    { key: TEX.grub, path: 'assets/sprites/enemy/grub.png' },
    { key: TEX.moth, path: 'assets/sprites/enemy/moth.png' },
    { key: TEX.spitter, path: 'assets/sprites/enemy/spitter.png' },
    { key: TEX.rat, path: 'assets/sprites/enemy/rat.png' },
    { key: TEX.hop, path: 'assets/sprites/enemy/hop.png' },
    { key: TEX.boomMoth, path: 'assets/sprites/enemy/boom_moth.png' },
    { key: TEX.toad, path: 'assets/sprites/enemy/toad.png' },
    { key: TEX.maw, path: 'assets/sprites/enemy/maw.png' },
    { key: TEX.doll, path: 'assets/sprites/enemy/doll.png' },
    { key: TEX.mask, path: 'assets/sprites/enemy/mask.png' },
    { key: TEX.vis, path: 'assets/sprites/enemy/vis.png' },
    { key: TEX.shadeMoth, path: 'assets/sprites/enemy/shade_moth.png' },
    { key: TEX.splitGrub, path: 'assets/sprites/enemy/split_grub.png' },
    { key: TEX.thornRoll, path: 'assets/sprites/enemy/thorn_roll.png' },
    { key: TEX.bossGranny, path: 'assets/sprites/boss/granny.png' },
    { key: TEX.bossFlyking, path: 'assets/sprites/boss/flyking.png' },
    { key: TEX.bossTumor, path: 'assets/sprites/boss/tumor.png' },
    { key: TEX.bossGrandpa, path: 'assets/sprites/boss/grandpa.png' },
    { key: TEX.bossChandelier, path: 'assets/sprites/boss/chandelier.png' },
    { key: TEX.bossDrainHead, path: 'assets/sprites/boss/drain_head.png' },
    { key: TEX.bossDrainBody, path: 'assets/sprites/boss/drain_body.png' },
    { key: TEX.bossGreedgutHead, path: 'assets/sprites/boss/greedgut_head.png' },
    { key: TEX.bossGreedgutBody, path: 'assets/sprites/boss/greedgut_body.png' },
    { key: TEX.bossAttic, path: 'assets/sprites/boss/attic.png' },
    { key: TEX.bossArmorHead, path: 'assets/sprites/boss/armor_head.png' },
    { key: TEX.bossArmorBody, path: 'assets/sprites/boss/armor_body.png' },
    { key: TEX.bossHush, path: 'assets/sprites/boss/hush.png' },
    { key: TEX.bossPitlord, path: 'assets/sprites/boss/pitlord.png' },
    { key: TEX.bossPale, path: 'assets/sprites/boss/pale.png' },
    { key: TEX.bossNameless, path: 'assets/sprites/boss/nameless.png' },
    { key: TEX.tear, path: 'assets/sprites/fx/tear.png' },
    { key: TEX.shadow, path: 'assets/sprites/fx/shadow.png' },
    { key: TEX.glow, path: 'assets/sprites/fx/glow.png' },
    { key: TEX.vignette, path: 'assets/sprites/fx/vignette.png' },
    { key: TEX.heartFull, path: 'assets/sprites/ui/heart_full.png' },
    { key: TEX.heartHalf, path: 'assets/sprites/ui/heart_half.png' },
    { key: TEX.heartEmpty, path: 'assets/sprites/ui/heart_empty.png' },
    { key: TEX.floor(0), path: 'assets/sprites/terrain/floor_0.png' },
    { key: TEX.floor(1), path: 'assets/sprites/terrain/floor_1.png' },
    { key: TEX.floor(2), path: 'assets/sprites/terrain/floor_2.png' },
    { key: TEX.floorBaked, path: 'assets/sprites/terrain/floor_baked.png' },
    { key: TEX.wall, path: 'assets/sprites/terrain/wall.png' },
    { key: TEX.wallV, path: 'assets/sprites/terrain/wall_v.png' },
    { key: TEX.doorClosed, path: 'assets/sprites/terrain/door_closed.png' },
    { key: TEX.doorOpen, path: 'assets/sprites/terrain/door_open.png' },
    { key: TEX.torch, path: 'assets/sprites/terrain/torch.png' },
    { key: TEX.rock, path: 'assets/sprites/terrain/rock.png' },
];

/**
 * Enemy and boss textures that have generated extra frames (`_1`, `_2`) and
 * a looping animation (`anim_<key>`), produced by tools/gen_animation_frames.py.
 */
export const ANIMATED_TEXTURES: ReadonlyArray<{
    key: string;
    path: string;
    rate: number;
}> = [
    { key: TEX.grub, path: 'assets/sprites/enemy/grub.png', rate: 6 },
    { key: TEX.moth, path: 'assets/sprites/enemy/moth.png', rate: 9 },
    { key: TEX.spitter, path: 'assets/sprites/enemy/spitter.png', rate: 5.5 },
    { key: TEX.rat, path: 'assets/sprites/enemy/rat.png', rate: 7 },
    { key: TEX.hop, path: 'assets/sprites/enemy/hop.png', rate: 6 },
    { key: TEX.boomMoth, path: 'assets/sprites/enemy/boom_moth.png', rate: 9 },
    { key: TEX.toad, path: 'assets/sprites/enemy/toad.png', rate: 5 },
    { key: TEX.maw, path: 'assets/sprites/enemy/maw.png', rate: 5 },
    { key: TEX.doll, path: 'assets/sprites/enemy/doll.png', rate: 5 },
    { key: TEX.mask, path: 'assets/sprites/enemy/mask.png', rate: 5.5 },
    { key: TEX.vis, path: 'assets/sprites/enemy/vis.png', rate: 8 },
    { key: TEX.shadeMoth, path: 'assets/sprites/enemy/shade_moth.png', rate: 9 },
    { key: TEX.splitGrub, path: 'assets/sprites/enemy/split_grub.png', rate: 6 },
    { key: TEX.thornRoll, path: 'assets/sprites/enemy/thorn_roll.png', rate: 10 },
    { key: TEX.bossGranny, path: 'assets/sprites/boss/granny.png', rate: 2.5 },
    { key: TEX.bossFlyking, path: 'assets/sprites/boss/flyking.png', rate: 3 },
    { key: TEX.bossTumor, path: 'assets/sprites/boss/tumor.png', rate: 2.2 },
    { key: TEX.bossGrandpa, path: 'assets/sprites/boss/grandpa.png', rate: 2.5 },
    { key: TEX.bossChandelier, path: 'assets/sprites/boss/chandelier.png', rate: 2.2 },
    { key: TEX.bossDrainHead, path: 'assets/sprites/boss/drain_head.png', rate: 2.5 },
    { key: TEX.bossGreedgutHead, path: 'assets/sprites/boss/greedgut_head.png', rate: 2.5 },
    { key: TEX.bossAttic, path: 'assets/sprites/boss/attic.png', rate: 2.5 },
    { key: TEX.bossArmorHead, path: 'assets/sprites/boss/armor_head.png', rate: 3 },
    { key: TEX.bossHush, path: 'assets/sprites/boss/hush.png', rate: 2.5 },
    { key: TEX.bossPitlord, path: 'assets/sprites/boss/pitlord.png', rate: 2.2 },
    { key: TEX.bossPale, path: 'assets/sprites/boss/pale.png', rate: 2.5 },
    { key: TEX.bossNameless, path: 'assets/sprites/boss/nameless.png', rate: 2.5 },
    { key: TEX.bossDrainBody, path: 'assets/sprites/boss/drain_body.png', rate: 2.5 },
    { key: TEX.bossGreedgutBody, path: 'assets/sprites/boss/greedgut_body.png', rate: 2.5 },
    { key: TEX.bossArmorBody, path: 'assets/sprites/boss/armor_body.png', rate: 3 },
];

export const ASSET_MANIFEST: ReadonlyArray<{ key: string; path: string }> = [
    ...BASE_ASSETS,
    ...ANIMATED_TEXTURES.flatMap(({ key, path }) =>
        [1, 2].map((frame) => ({
            key: `${key}_${frame}`,
            path: path.replace('.png', `_${frame}.png`),
        }))
    ),
];

/** Original synthesized SFX, generated by tools/gen_sfx.py. */
export const SFX = {
    shoot: 'sfx_shoot',
    hit: 'sfx_hit',
    kill: 'sfx_kill',
    hurt: 'sfx_hurt',
    coin: 'sfx_coin',
    heart: 'sfx_heart',
    item: 'sfx_item',
    boss: 'sfx_boss',
    explode: 'sfx_explode',
    beam: 'sfx_beam',
    chest: 'sfx_chest',
    clear: 'sfx_clear',
    shop: 'sfx_shop',
    door: 'sfx_door',
} as const;

export type SfxName = keyof typeof SFX;

export const MUSIC = { loop: 'bgm_loop' } as const;

export const AUDIO_MANIFEST: ReadonlyArray<{ key: string; path: string }> = [
    ...(Object.keys(SFX) as SfxName[]).map((name) => ({
        key: SFX[name],
        path: `assets/audio/${SFX[name]}.wav`,
    })),
    { key: MUSIC.loop, path: `assets/audio/${MUSIC.loop}.wav` },
];
