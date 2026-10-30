import { Scene } from 'phaser';
import type * as Phaser from 'phaser';
import {
    GAME_H,
    GAME_W,
    MUSIC,
    PLAY_BOTTOM,
    PLAY_H,
    PLAY_RIGHT,
    PLAY_W,
    PLAY_X,
    PLAY_Y,
    ROOM_CX,
    ROOM_CY,
    TEX,
} from '../const';
import type { BossKind, Dir, EnemyKind } from '../types';
import { Dungeon, type RoomDef, type ShopSlot } from '../core/Dungeon';
import { mulberry32, shuffle } from '../core/rng';
import { Player, dirX, dirY, type ShotSpec } from '../core/Player';
import { Enemy } from '../core/Enemy';
import { TearManager } from '../core/TearManager';
import { RoomView, type DoorTarget } from '../view/RoomView';
import { Hud, type MapRoom } from '../view/Hud';
import { crispContainer } from '../view/crispText';
import { setupCamera } from '../view/viewport';
import { InputManager } from '../input/InputManager';
import { ITEMS, ItemPool, itemById, type ItemDef } from '../core/items';
import { Boss } from '../core/Boss';
import { Sfx } from '../core/Sfx';
import { loadSettings, saveSettings, settings, shakeCamera } from '../core/settings';
import {
    migrateLegacySave,
    readSlot,
    readSlots,
    removeSlot,
    writeSlot,
    type SaveData,
} from '../core/save';

const EARLY_KINDS: readonly EnemyKind[] = ['grub', 'rat', 'hop', 'moth'];
const MID_KINDS: readonly EnemyKind[] = [
    'grub',
    'rat',
    'hop',
    'moth',
    'spitter',
    'boomMoth',
    'doll',
    'shadeMoth',
    'splitGrub',
];
const LATE_KINDS: readonly EnemyKind[] = [
    'grub',
    'rat',
    'hop',
    'moth',
    'spitter',
    'boomMoth',
    'doll',
    'toad',
    'maw',
    'mask',
    'vis',
    'shadeMoth',
    'splitGrub',
    'thornRoll',
];

/** Spawn anchors as fractions of the playable rect. */
const SPAWN_SPOTS: ReadonlyArray<readonly [number, number]> = [
    [0.16, 0.22],
    [0.84, 0.2],
    [0.82, 0.8],
    [0.18, 0.78],
    [0.5, 0.2],
    [0.5, 0.82],
    [0.2, 0.5],
    [0.8, 0.5],
    [0.5, 0.5],
];

/** How far past the wall band the player has to travel to change rooms. */
const DOOR_REACH = 6;

/** Which boss waits on each floor index (1-based). */
const BOSS_ORDER: readonly BossKind[] = [
    'granny',
    'granny',
    'flyking',
    'flyking',
    'drain',
    'greedgut',
    'tumor',
    'grandpa',
    'chandelier',
    'attic',
    'armor',
    'hush',
    'pitlord',
    'pale',
    'nameless',
];

/** Beating the boss on this floor ends the run with a victory screen. */
const FINAL_LEVEL = 15;

/** Everything the player can walk over and collect. */
type PickupKind = 'item' | 'coin' | 'heart' | 'halfHeart' | 'bomb' | 'key';

interface Pickup {
    kind: PickupKind;
    value: number;
    item?: ItemDef;
    sprite: Phaser.GameObjects.Image;
    glow: Phaser.GameObjects.Image;
}

/** Data passed in when the main menu boots a run. */
export interface GameSceneData {
    mode?: 'new' | 'continue';
    continueSlot?: number;
}

/** Tears are flagged in their data so collider callbacks can tell them apart. */
function isTearObject(object: unknown): boolean {
    const getData = (object as { getData?: (key: string) => unknown } | null | undefined)
        ?.getData;
    return typeof getData === 'function' && getData.call(object, 'tear') === true;
}

export class GameScene extends Scene {
    private player!: Player;
    private enemies: Enemy[] = [];
    private enemyGroup!: Phaser.Physics.Arcade.Group;
    private groundGroup!: Phaser.Physics.Arcade.Group;
    private playerTears!: TearManager;
    private enemyTears!: TearManager;
    private roomView!: RoomView;
    private hud!: Hud;
    private inputManager!: InputManager;
    private solidColliders: Phaser.Physics.Arcade.Collider[] = [];

    private level = 1;
    private dungeon!: Dungeon;
    private room!: RoomDef;
    private kills = 0;
    private bossKills = 0;
    private coins = 0;
    private bombs = 2;
    private keys = 1;
    private victory = false;
    private runTime = 0;
    private saveData: SaveData | null = null;
    private saveSlots: Array<SaveData | null> = [null, null, null];
    private activeSlot = 0;
    private masterVolume = 0.8;
    private muted = false;
    private bgm?: Phaser.Sound.BaseSound;
    private pausedByUser = false;
    private gmOpen = false;
    private pauseLayer?: Phaser.GameObjects.Container;
    private pauseVolumeText?: Phaser.GameObjects.Text;
    private pauseMuteText?: Phaser.GameObjects.Text;
    private pauseSlider?: {
        track: Phaser.GameObjects.Graphics;
        knob: Phaser.GameObjects.Rectangle;
        left: number;
        right: number;
        y: number;
    };
    private dead = false;
    private paused = false;
    private canRestart = false;
    private transitioning = false;
    private nearShelf = -1;
    private chestHint = false;
    private itemPool = new ItemPool();
    private boss?: Boss;
    private trapdoorArt: Phaser.GameObjects.GameObject[] = [];
    private trapdoorTween?: Phaser.Tweens.Tween;
    private pickups: Pickup[] = [];
    private auraCd = 0;
    private turretCd = 0;
    private sfx!: Sfx;
    /** Brief gameplay freeze on heavy hits. */
    private hitStop = 0;
    /** Normal rooms spawn with a short materialise window. */
    private spawnGrace = 0;
    private clearPoll = 0;
    /** Per-room blood decals painted on the floor. */
    private blood!: Phaser.GameObjects.Graphics;
    private bloodSplats = 0;
    /** Screen-space vignette, kept fixed while rooms slide. */
    private vignette!: Phaser.GameObjects.Image;
    private slideSeq = 0;
    /** Set when the menu asked to resume a specific save slot. */
    private pendingContinueSlot: number | null = null;

    constructor() {
        super('GameScene');
    }

    init(data?: GameSceneData): void {
        this.pendingContinueSlot =
            typeof data?.continueSlot === 'number' ? data.continueSlot : null;
    }

    create(): void {
        this.enemies = [];
        this.solidColliders = [];
        this.trapdoorArt = [];
        this.trapdoorTween = undefined;
        this.level = 1;
        this.kills = 0;
        this.bossKills = 0;
        this.coins = 0;
        this.bombs = 2;
        this.keys = 1;
        this.victory = false;
        this.runTime = 0;
        this.saveData = null;
        this.saveSlots = [null, null, null];
        this.activeSlot = 0;
        this.dead = false;
        this.paused = false;
        this.pausedByUser = false;
        this.canRestart = false;
        this.transitioning = false;
        this.nearShelf = -1;
        this.itemPool = new ItemPool();
        this.pickups = [];
        this.auraCd = 0;
        this.turretCd = 0;
        this.hitStop = 0;
        this.spawnGrace = 0;
        this.bloodSplats = 0;
        this.ensurePickupTextures();

        this.cameras.main.setBackgroundColor(0x0b0806);
        setupCamera(this);
        this.physics.world.setBounds(0, 0, GAME_W, GAME_H);
        this.add.rectangle(0, 0, GAME_W, GAME_H, 0x0b0806).setOrigin(0, 0).setDepth(0);
        this.blood = this.add.graphics().setDepth(6);
        this.vignette = this.add
            .image(0, 0, TEX.vignette)
            .setOrigin(0, 0)
            .setDepth(90)
            .setAlpha(0.9);

        this.enemyGroup = this.physics.add.group({ allowGravity: false });
        this.groundGroup = this.physics.add.group({ allowGravity: false });
        this.playerTears = new TearManager(this);
        this.enemyTears = new TearManager(this);
        this.playerTears.onBlast = this.blastAt;

        this.player = new Player(
            {
                scene: this,
                fireTear: (x, y, dir, spec: ShotSpec) => {
                    this.playerTears.spawn(x, y, dir, spec);
                    this.muzzleFlash(x, y);
                    this.sfx.play('shoot', 0.1, 0.05);
                    this.player.inventory.run('onFire', {
                        player: this.player,
                        scene: this,
                        x,
                        y,
                        dir,
                        blast: this.blastAt,
                    });
                },
                fireBeam: (x, y, dir, damage, length) => {
                    this.fireBeam(x, y, dir, damage, length);
                },
                onDeath: () => this.onPlayerDeath(),
                onRevive: () => {
                    this.hud.showToast('假死触发 · 半血复活', 1200);
                    this.sfx.play('heart', 0.3);
                },
                onDamaged: () => {
                    this.sfx.play('hurt', 0.22);
                    this.freeze(0.07);
                    this.addBlood(this.player.x, this.player.y + 10, 0.9);
                    this.cameras.main.flash(110, 60, 10, 10);
                    this.player.inventory.run('onDamage', {
                        player: this.player,
                        scene: this,
                        blast: this.blastAt,
                    });
                },
                onBlocked: () => {
                    this.sfx.play('hit', 0.16);
                    this.freeze(0.04);
                },
            },
            ROOM_CX,
            PLAY_BOTTOM - 48
        );

        this.hud = new Hud(this);
        this.hud.setStats(this.player.stats);
        this.hud.setGmCallbacks({
            canOpen: () =>
                !this.dead && !this.victory && !this.transitioning && !this.pausedByUser,
            getLevel: () => this.level,
            getMaxLevel: () => FINAL_LEVEL,
            setLevel: (level) => this.gmSetLevel(level),
            addItem: (item) => this.gmAddItem(item),
            addAllItems: () => this.gmAddAllItems(),
            removeItem: (id) => this.gmRemoveItem(id),
            hasItem: (id) => this.player.inventory.items.some((item) => item.id === id),
            isInvincible: () => this.player.godMode,
            toggleInvincible: () => this.gmToggleInvincible(),
            jumpToBoss: () => this.gmJumpToBoss(),
            onOpen: () => this.setGmPaused(true),
            onClose: () => this.setGmPaused(false),
        });
        this.hud.setCoins(this.coins);
        this.sfx = new Sfx(this);
        this.hud.setConsumables(this.bombs, this.keys);
        this.loadAudioSettings();
        loadSettings();
        this.startMusic();
        this.sound.once('unlocked', this.reapplyAudio, this);
        this.inputManager = new InputManager(this);

        this.wireCollisions();

        this.dungeon = Dungeon.generate(this.level);
        this.enterRoom(this.dungeon.start, null);
        migrateLegacySave();
        this.saveSlots = readSlots();
        const pending = this.pendingContinueSlot;
        this.pendingContinueSlot = null;
        if (pending !== null && this.saveSlots[pending]) {
            this.continueRun(pending);
        } else {
            this.offerContinue();
        }

        this.input.keyboard?.on('keydown-R', this.onRestartKey, this);
        this.input.keyboard?.on('keydown-C', this.onContinueKey, this);
        this.input.keyboard?.on('keydown-ONE', this.onSlotOne, this);
        this.input.keyboard?.on('keydown-TWO', this.onSlotTwo, this);
        this.input.keyboard?.on('keydown-THREE', this.onSlotThree, this);
        this.input.keyboard?.on('keydown-M', this.onMuteKey, this);
        this.input.keyboard?.on('keydown-ESC', this.onPauseKey, this);
        this.input.keyboard?.on('keydown-ESC', this.onEndMenuKey, this);
        this.input.keyboard?.on('keydown-P', this.onPauseKey, this);
        this.input.keyboard?.on('keydown-OPEN_BRACKET', this.onVolumeDown, this);
        this.input.keyboard?.on('keydown-CLOSED_BRACKET', this.onVolumeUp, this);
        document.addEventListener('visibilitychange', this.onVisibility);
        window.addEventListener('blur', this.onVisibility);
        window.addEventListener('focus', this.onVisibility);
        this.events.once('shutdown', this.onShutdown, this);

        (window as unknown as { __soot: () => unknown }).__soot = () => this.debugState();
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            (window as unknown as { __sootScene?: GameScene }).__sootScene = this;
        }
    }

    update(_time: number, delta: number): void {
        if (this.inputManager.consumePause()) {
            this.togglePause();
        }
        if (this.paused || this.dead || this.victory || this.transitioning || this.pausedByUser || this.gmOpen) {
            return;
        }
        const raw = Math.min(delta / 1000, 0.05);
        if (this.hitStop > 0) {
            this.hitStop = Math.max(0, this.hitStop - raw);
            this.keepPlayerInRoom();
            return;
        }
        const dt = raw;
        this.runTime += dt;
        if (this.inputManager.consumeBomb()) {
            this.placeBomb();
        }
        const input = this.inputManager.sample();

        const bounds = this.roomBounds();
        this.player.setBounds(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
        this.player.update(dt, input);
        this.keepPlayerInRoom();
        this.spawnGrace = Math.max(0, this.spawnGrace - dt);
        const spawning = this.spawnGrace > 0;
        for (const enemy of this.enemies) {
            if (!spawning) {
                enemy.update(dt);
            }
        }
        this.boss?.update(dt);
        this.playerTears.update(dt, this.homingTargets(), { x: this.player.x, y: this.player.y });
        this.enemyTears.update(dt);
        this.updateAura(dt);
        this.updateTurrets(dt);
        this.updatePickups(dt);
        this.checkBossHits();
        this.checkSpikes();
        if (!this.room.cleared && this.room.type !== 'boss' && !this.hasActiveEnemies()) {
            // Safety net: a mud doll or a missed death event must not lock the room.
            this.clearPoll += dt;
            if (this.clearPoll > 0.45) {
                this.tryCompleteRoomClear();
            }
        } else {
            this.clearPoll = 0;
        }
        this.checkTreasure();
        this.checkChest();
        this.checkShop();
        if (this.boss && !this.boss.dead) {
            this.hud.setBoss(this.boss.name, this.boss.hp, this.boss.maxHp);
        }
        this.hud.update(this.player.hp, this.kills, this.player.stats.maxHp);
        this.hud.setTime(this.runTime);
        this.hud.setStats(this.player.stats);

        if (
            this.room.trapdoor &&
            Math.hypot(this.player.x - ROOM_CX, this.player.y - ROOM_CY) < 18
        ) {
            this.descend();
            return;
        }

        const exit = this.doorExit();
        if (exit) {
            this.moveTo(exit);
        }
    }

    /** Spikes do not collide; they just hurt while the player stands on them. */
    private checkSpikes(): void {
        if (this.player.dead) {
            return;
        }
        for (const spike of this.roomView.spikes) {
            if (
                Math.abs(this.player.x - spike.x) < 12 &&
                Math.abs(this.player.y - spike.y) < 11
            ) {
                this.player.takeDamage(1, spike.x, spike.y + 12);
                break;
            }
        }
    }

    /** Treasure pedestal: touch it to take the placeholder relic. */
    private checkTreasure(): void {
        const point = this.roomView.itemPoint;
        if (this.room.itemTaken || !point || this.player.dead) {
            return;
        }
        if (Math.hypot(this.player.x - point.x, this.player.y - point.y) < 24) {
            this.room.itemTaken = true;
            this.roomView.takeItem(this.player.x, this.player.y);
            const item = itemById(this.room.itemId);
            if (item) {
                this.player.addItem(item);
                this.hud.setItems(this.player.inventory.items);
                this.hud.showToast(`拾得「${item.name}」· ${item.desc}`);
            } else {
                this.hud.showToast('拾得未知遗物');
            }
            this.cameras.main.flash(120, 70, 34, 12);
        }
    }

    /** Chest: walk into it to open. Gold chests need one key. */
    private checkChest(): void {
        const point = this.roomView.chestPoint;
        if (!point || this.player.dead) {
            return;
        }
        if (Math.hypot(this.player.x - point.x, this.player.y - point.y) >= 24) {
            this.chestHint = false;
            return;
        }
        if (this.room.chest?.kind === 'gold' && this.keys <= 0) {
            if (!this.chestHint) {
                this.chestHint = true;
                this.hud.showToast('金箱需要 1 把钥匙', 1000);
            }
            return;
        }
        this.chestHint = false;
        this.openChest(point.x, point.y);
    }

    private openChest(x: number, y: number): void {
        const chest = this.room.chest;
        if (!chest || chest.opened) {
            return;
        }
        chest.opened = true;
        this.roomView.openChest();
        if (chest.kind === 'gold') {
            this.keys -= 1;
            this.hud.setConsumables(this.bombs, this.keys);
        }
        this.sfx.play('chest', 0.24);
        this.cameras.main.flash(130, 70, 55, 20);

        if (chest.kind === 'gold') {
            const roll = Math.random();
            if (roll < 0.55) {
                const item = this.itemPool.draw();
                if (item) {
                    this.addPickup('item', x, y + 6, 1, item);
                } else {
                    for (let i = 0; i < 8; i += 1) {
                        this.spawnCoin(x - 14 + (i % 4) * 9, y + 4 + Math.floor(i / 4) * 9);
                    }
                }
            } else if (roll < 0.8) {
                this.addPickup('heart', x, y + 6);
            } else if (roll < 0.92) {
                for (let i = 0; i < 6; i += 1) {
                    this.spawnCoin(x - 10 + (i % 3) * 10, y + 4 + Math.floor(i / 3) * 9);
                }
            } else {
                this.addPickup('bomb', x - 6, y + 6);
                this.addPickup('key', x + 6, y + 6);
            }
        } else {
            const roll = Math.random();
            if (roll < 0.52) {
                const coins = 2 + Math.floor(Math.random() * 3);
                for (let i = 0; i < coins; i += 1) {
                    this.spawnCoin(x - 12 + i * 10, y + 6 + (i % 2) * 8);
                }
            } else if (roll < 0.74) {
                this.addPickup('halfHeart', x, y + 6);
            } else if (roll < 0.88) {
                this.addPickup(Math.random() < 0.5 ? 'bomb' : 'key', x, y + 6);
            } else {
                const item = this.itemPool.draw();
                if (item) {
                    this.addPickup('item', x, y + 6, 1, item);
                }
            }
        }
    }

    /** Walk onto a shelf to buy it. Prices scale with depth. */
    private checkShop(): void {
        if (this.room.type !== 'shop') {
            this.nearShelf = -1;
            return;
        }
        const index = this.roomView.shelves.findIndex(
            (shelf) => Math.hypot(this.player.x - shelf.x, this.player.y - shelf.y) < 24
        );
        if (index < 0) {
            this.nearShelf = -1;
            return;
        }
        if (index === this.nearShelf) {
            return;
        }
        this.nearShelf = index;
        const slot = this.room.shopStock?.[index];
        if (!slot || slot.sold) {
            this.hud.showToast('已售出', 700);
            return;
        }
        if (this.coins < slot.price) {
            this.hud.showToast(`需要 ${slot.price} 金币（现有 ${this.coins}）`, 1000);
            return;
        }
        this.buyShelf(index, slot);
    }

    private buyShelf(index: number, slot: ShopSlot): void {
        this.coins -= slot.price;
        slot.sold = true;
        this.roomView.markSold(index);
        this.sfx.play('shop', 0.24);
        if (slot.kind === 'heart') {
            this.player.addHeartContainer();
            this.hud.showToast('生命上限 +1 心，血量回满');
        } else {
            const item = itemById(slot.itemId);
            if (item) {
                this.player.addItem(item);
                this.hud.setItems(this.player.inventory.items);
                this.hud.showToast(`买到「${item.name}」· ${item.desc}`);
            }
        }
        this.cameras.main.flash(100, 60, 50, 20);
        this.refreshHud();
    }

    /** First visit rolls the three shelves; sold flags persist in the room. */
    private rollShopStock(room: RoomDef): void {
        if (room.shopStock) {
            return;
        }
        const stock: ShopSlot[] = [];
        for (let i = 0; i < 3; i += 1) {
            const wantsHeart = i === 2 && Math.random() < 0.3;
            const item = wantsHeart ? undefined : this.itemPool.draw();
            if (!item) {
                stock.push({ kind: 'heart', price: 18 + this.level * 2, sold: false });
            } else {
                stock.push({
                    kind: 'item',
                    itemId: item.id,
                    price: 12 + this.level * 3 + i * 6,
                    sold: false,
                });
            }
        }
        room.shopStock = stock;
    }

    private wireCollisions(): void {
        this.physics.add.overlap(
            this.player.sprite,
            this.enemyGroup,
            this.onPlayerEnemy,
            undefined,
            this
        );
        this.physics.add.overlap(
            this.playerTears.group,
            this.enemyGroup,
            this.onPlayerTearEnemy,
            undefined,
            this
        );
        this.physics.add.overlap(
            this.player.sprite,
            this.enemyTears.group,
            this.onEnemyTearPlayer,
            undefined,
            this
        );
    }

    private wireSolidColliders(): void {
        this.solidColliders = [
            this.physics.add.collider(this.player.sprite, this.roomView.solids),
            this.physics.add.collider(this.groundGroup, this.roomView.solids),
            this.physics.add.collider(this.player.sprite, this.roomView.pits),
            this.physics.add.collider(this.groundGroup, this.roomView.pits),
            this.physics.add.collider(
                this.playerTears.group,
                this.roomView.solids,
                this.onPlayerTearWall,
                (object1, object2) => this.playerTears.passesWalls(object1, object2),
                this
            ),
            this.physics.add.collider(
                this.enemyTears.group,
                this.roomView.solids,
                this.onEnemyTearWall,
                undefined,
                this
            ),
        ];
    }

    private enterRoom(room: RoomDef, from: Dir | null): void {
        this.room = room;
        this.dungeon.visit(room);
        this.nearShelf = -1;
        this.chestHint = false;
        this.clearPoll = 0;
        this.clearRoomObjects();

        const targets: Partial<Record<Dir, DoorTarget>> = {};
        if (room.type === 'treasure' && !room.itemTaken && !room.itemId) {
            room.itemId = this.itemPool.draw()?.id;
        }
        if (room.type === 'shop') {
            this.rollShopStock(room);
        }
        for (const dir of room.doors) {
            const neighbour = this.dungeon.neighbour(room, dir);
            if (neighbour) {
                targets[dir] = { type: neighbour.type, cleared: neighbour.cleared };
            }
        }

        this.roomView = new RoomView(this, room, targets, this.level);
        this.wireSolidColliders();
        this.placePlayer(from);
        this.player.onRoomEnter();

        if (!room.cleared) {
            if (room.type === 'boss') {
                this.spawnBoss();
            } else {
                this.spawnWave(room);
                this.beginSpawnGrace();
            }
            this.roomView.setDoorsOpen(false);
        } else {
            this.roomView.setDoorsOpen(true);
        }
        if (room.trapdoor) {
            this.buildTrapdoor();
        }

        this.refreshHud();
    }

    private clearRoomObjects(): void {
        for (const collider of this.solidColliders) {
            collider.destroy();
        }
        this.solidColliders = [];
        this.blood.clear();
        this.bloodSplats = 0;

        this.boss?.destroy();
        this.boss = undefined;
        this.hud?.clearBoss();

        for (const enemy of this.enemies) {
            enemy.destroy();
        }
        this.enemies = [];
        this.enemyGroup.clear(true, true);
        this.groundGroup.clear(true, true);

        this.playerTears.clear();
        this.enemyTears.clear();

        this.trapdoorTween?.stop();
        this.trapdoorTween = undefined;
        for (const art of this.trapdoorArt) {
            art.destroy();
        }
        this.trapdoorArt = [];

        for (const pickup of this.pickups) {
            pickup.sprite.destroy();
            pickup.glow.destroy();
        }
        this.pickups = [];

        if (this.roomView) {
            this.roomView.destroy();
        }
    }

    private placePlayer(from: Dir | null): void {
        const inset = 24;
        if (!from) {
            this.player.placeAt(ROOM_CX, PLAY_BOTTOM - 40);
            return;
        }
        switch (from) {
            case 'up':
                this.player.placeAt(ROOM_CX, PLAY_BOTTOM - inset);
                break;
            case 'down':
                this.player.placeAt(ROOM_CX, PLAY_Y + inset);
                break;
            case 'left':
                this.player.placeAt(PLAY_RIGHT - inset, ROOM_CY);
                break;
            case 'right':
                this.player.placeAt(PLAY_X + inset, ROOM_CY);
                break;
        }
    }

    private spawnWave(room: RoomDef): void {
        const rand = mulberry32(room.seed);
        const elite = room.type === 'boss';
        const count = elite
            ? 4
            : Math.min(5, 2 + Math.floor(this.level * 0.5) + (room.dist >= 2 ? 1 : 0));
        const hpScale = Math.pow(1.13, this.level - 1) * (elite ? 1.8 : 1);
        const spots = this.pickSpawnSpots(room, rand, count);
        const pool = elite
            ? LATE_KINDS
            : this.level <= 2
              ? EARLY_KINDS
              : this.level <= 5
                ? MID_KINDS
                : LATE_KINDS;

        for (let i = 0; i < count; i += 1) {
            const spot = spots[i];
            const kind = pool[(room.seed + i * 7) % pool.length];
            const enemy = new Enemy(
                {
                    scene: this,
                    getPlayer: () => this.player,
                    fireTear: (x, y, vx, vy, damage, size) => {
                        this.enemyTears.spawnVelocity(x, y, vx, vy, damage, false, 0.95, undefined, size);
                    },
                    onDeath: (deadEnemy) => this.onEnemyDeath(deadEnemy),
                },
                kind,
                spot.x,
                spot.y,
                hpScale
            );
            this.enemies.push(enemy);
            this.enemyGroup.add(enemy.sprite);
            if (!enemy.flying) {
                this.groundGroup.add(enemy.sprite);
            }
        }
    }

    /** Dev helper (localhost only): spawn one enemy, optionally at a fixed spot. */
    debugSpawn(kind: EnemyKind, x?: number, y?: number): void {
        this.spawnEnemyAt(kind, x ?? this.player.x + 60, y ?? this.player.y);
    }

    private spawnEnemyAt(kind: EnemyKind, x: number, y: number, hpScale = 1): void {
        const enemy = new Enemy(
            {
                scene: this,
                getPlayer: () => this.player,
                fireTear: (tx, ty, vx, vy, damage, size) => {
                    this.enemyTears.spawnVelocity(
                        tx,
                        ty,
                        vx,
                        vy,
                        damage,
                        false,
                        0.95,
                        undefined,
                        size
                    );
                },
                onDeath: (deadEnemy) => this.onEnemyDeath(deadEnemy),
            },
            kind,
            x,
            y,
            hpScale
        );
        this.enemies.push(enemy);
        this.enemyGroup.add(enemy.sprite);
        if (!enemy.flying) {
            this.groundGroup.add(enemy.sprite);
        }
    }

    private spawnBoss(): void {
        const index = Math.min(this.level, BOSS_ORDER.length) - 1;
        this.spawnBossKind(BOSS_ORDER[index]);
    }

    /** Dev helper (localhost only): swap in a specific boss. */
    debugBoss(kind: BossKind): void {
        this.boss?.destroy();
        this.boss = undefined;
        this.spawnBossKind(kind);
    }

    private spawnBossKind(kind: BossKind): void {
        const hpScale = Math.pow(1.16, this.level - 1);
        const fixed =
            kind === 'tumor' ||
            kind === 'chandelier' ||
            kind === 'attic' ||
            kind === 'hush' ||
            kind === 'pitlord' ||
            kind === 'pale' ||
            kind === 'nameless';
        const boss = new Boss(
            {
                scene: this,
                getPlayer: () => this.player,
                fireTear: (x, y, vx, vy, damage, size) => {
                    this.enemyTears.spawnVelocity(x, y, vx, vy, damage, false, 1.1, undefined, size);
                },
                summon: (minion, x, y) => this.spawnEnemyAt(minion, x, y),
                onDeath: () => this.onBossDeath(),
            },
            kind,
            ROOM_CX,
            fixed ? PLAY_Y + 60 : ROOM_CY - 30,
            hpScale
        );
        this.boss = boss;
        if (kind === 'armor') {
            this.hud.showToast('装甲蛆：只打尾部发光的节', 1600);
        }
        this.spawnRing(boss.x, boss.y, 70, 1000);
        this.spawnRing(boss.x, boss.y, 46, 760);
        this.solidColliders.push(
            this.physics.add.overlap(
                this.player.sprite,
                boss.sprite,
                this.onPlayerBoss,
                undefined,
                this
            )
        );
        this.hud.setBoss(boss.name, boss.hp, boss.maxHp);
        this.sfx.play('boss', 0.26);
    }

    /** Tears hit the head or any body segment (worm bosses). */
    private checkBossHits(): void {
        const boss = this.boss;
        if (!boss || boss.dead || boss.entering) {
            return;
        }
        for (const child of [...this.playerTears.group.getChildren()]) {
            const tear = child as Phaser.Physics.Arcade.Sprite;
            if (!tear.active || !boss.hitTest(tear.x, tear.y)) {
                continue;
            }
            if (!this.playerTears.hitOnce(tear, boss)) {
                continue;
            }
            const { damage } = this.playerTears.rollDamage(tear);
            const poison = (tear.getData('poison') as number) ?? 0;
            boss.takeDamage(damage + poison * 1.2, tear.x, tear.y);
            this.sfx.play('boss', 0.2, 0.05);
            this.burst(tear.x, tear.y, 0xffd0a0, 5, 22, 0.36);
            this.freeze(0.03);
            if (!this.playerTears.pierceThrough(tear)) {
                this.playerTears.pop(tear);
            }
            if (boss.dead) {
                break;
            }
        }
    }

    private onBossDeath(): void {
        this.boss = undefined;
        this.hud.clearBoss();
        if (this.dead) {
            return;
        }
        this.kills += 1;
        this.bossKills += 1;
        const final = this.level >= FINAL_LEVEL;
        this.room.cleared = true;
        this.room.trapdoor = !final;
        this.roomView.setDoorsOpen(true);
        this.hud.flashClear();
        this.sfx.play('explode', 0.3);
        this.burst(ROOM_CX, ROOM_CY, 0xffb060, 22, 64, 0.7);
        this.addBlood(ROOM_CX, ROOM_CY, 2.8);
        const deathRing = this.add
            .circle(ROOM_CX, ROOM_CY, 12, 0xe08050, 0.4)
            .setDepth(41)
            .setBlendMode('ADD');
        this.tweens.add({
            targets: deathRing,
            radius: 110,
            alpha: 0,
            duration: 460,
            ease: 'Cubic.easeOut',
            onComplete: () => deathRing.destroy(),
        });
        shakeCamera(this, 190, 0.007);
        this.freeze(0.12);
        if (!final) {
            this.buildTrapdoor();
        }
        this.scatterPickups('coin', 6 + Math.min(6, this.level), ROOM_CX, ROOM_CY, 62);
        this.addPickup('halfHeart', ROOM_CX - 58, ROOM_CY + 28);
        this.addPickup('halfHeart', ROOM_CX + 58, ROOM_CY - 22);
        this.addPickup('bomb', ROOM_CX - 40, ROOM_CY + 8);
        this.addPickup('key', ROOM_CX + 30, ROOM_CY + 8);
        this.dropItem(ROOM_CX + 46, ROOM_CY + 8, this.itemPool.draw());
        this.refreshHud();
        if (final) {
            this.finishRun();
        }
    }

    /** Floor 15 boss defeated: stop the run and show the results screen. */
    private finishRun(): void {
        this.victory = true;
        this.clearSave();
        this.inputManager.setEnabled(false);
        this.playerTears.clear();
        this.enemyTears.clear();
        this.sfx.play('clear', 0.3);
        this.hud.showVictory(this.settlementStats(), {
            onRestart: () => this.restart(),
            onMenu: () => this.goToMenu(),
        });
        this.time.delayedCall(900, () => {
            this.canRestart = true;
        });
    }

    private pickSpawnSpots(
        room: RoomDef,
        rand: () => number,
        count: number
    ): Array<{ x: number; y: number }> {
        const spots: Array<{ x: number; y: number }> = [];
        for (const [fx, fy] of shuffle(SPAWN_SPOTS, rand)) {
            const x = PLAY_X + fx * PLAY_W;
            const y = PLAY_Y + fy * PLAY_H;
            if (
                room.obstacles.some(
                    (obstacle) => Math.hypot(obstacle.x - x, obstacle.y - y) < 44
                )
            ) {
                continue;
            }
            if (Math.hypot(this.player.x - x, this.player.y - y) < 80) {
                continue;
            }
            spots.push({ x, y });
            if (spots.length >= count) {
                break;
            }
        }
        while (spots.length < count) {
            const fx = 0.2 + rand() * 0.6;
            const fy = 0.2 + rand() * 0.6;
            spots.push({ x: PLAY_X + fx * PLAY_W, y: PLAY_Y + fy * PLAY_H });
        }
        return spots;
    }

    private onEnemyDeath(enemy: Enemy): void {
        this.enemies = this.enemies.filter((item) => item !== enemy);
        this.kills += 1;
        if (enemy.kind === 'splitGrub' && !this.dead) {
            this.spawnEnemyAt('grub', enemy.x - 15, enemy.y, 0.45);
            this.spawnEnemyAt('grub', enemy.x + 15, enemy.y, 0.45);
        }
        this.sfx.play('kill', 0.18, 0.04);
        this.enemyDeathFx(enemy.x, enemy.y, enemy.radius);
        this.freeze(0.05);
        const chance = 0.035 + this.player.stats.luck * 0.004;
        if (Math.random() < chance) {
            this.dropItem(enemy.x, enemy.y, this.itemPool.draw());
        }
        if (Math.random() < 0.08 + this.player.stats.luck * 0.01) {
            this.spawnCoin(enemy.x, enemy.y);
        }
        if (Math.random() < 0.025) {
            this.addPickup('bomb', enemy.x + 6, enemy.y);
        }
        if (Math.random() < 0.02) {
            this.addPickup('key', enemy.x - 6, enemy.y);
        }
        this.player.inventory.run('onKill', {
            player: this.player,
            scene: this,
            enemy,
            blast: this.blastAt,
        });
        if (!this.dead) {
            this.tryCompleteRoomClear();
        }
        this.hud.update(this.player.hp, this.kills, this.player.stats.maxHp);
    }

    private hasActiveEnemies(): boolean {
        return this.enemies.some((enemy) => !enemy.dead && enemy.body.enable);
    }

    /** Opens the doors once no live, hittable enemy is left in the room. */
    private tryCompleteRoomClear(): void {
        if (this.room.cleared || this.room.type === 'boss' || this.hasActiveEnemies()) {
            return;
        }
        this.room.cleared = true;
        this.roomView.setDoorsOpen(true);
        this.hud.flashClear();
        this.player.inventory.run('onRoomClear', {
            player: this.player,
            scene: this,
            blast: this.blastAt,
        });
        if (this.room.type === 'normal') {
            this.rewardRoomClear();
        }
        this.sfx.play('clear', 0.2);
        this.freeze(0.04);
        this.refreshHud();
    }

    private buildTrapdoor(): void {
        const graphics = this.add.graphics().setDepth(6);
        graphics.fillStyle(0x080504, 1);
        graphics.fillEllipse(ROOM_CX, ROOM_CY, 46, 28);
        graphics.lineStyle(2, 0x7a5230, 1);
        graphics.strokeEllipse(ROOM_CX, ROOM_CY, 46, 28);
        graphics.lineStyle(1, 0x241408, 1);
        for (let i = -2; i <= 2; i += 1) {
            graphics.lineBetween(ROOM_CX - 17, ROOM_CY + i * 5, ROOM_CX + 17, ROOM_CY + i * 5);
        }
        const glow = this.add
            .image(ROOM_CX, ROOM_CY, TEX.glow)
            .setDepth(5)
            .setBlendMode('ADD')
            .setTint(0xffa060)
            .setAlpha(0.22)
            .setScale(1.8);

        this.trapdoorArt.push(graphics, glow);
        this.trapdoorTween = this.tweens.add({
            targets: glow,
            alpha: 0.42,
            duration: 900,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
    }

    private doorExit(): Dir | null {
        const player = this.player;
        const centeredX = Math.abs(player.x - ROOM_CX) < 22;
        const centeredY = Math.abs(player.y - ROOM_CY) < 22;
        if (centeredX && this.room.doors.includes('up') && player.y < PLAY_Y - DOOR_REACH) {
            return 'up';
        }
        if (
            centeredX &&
            this.room.doors.includes('down') &&
            player.y > PLAY_BOTTOM + DOOR_REACH
        ) {
            return 'down';
        }
        if (centeredY && this.room.doors.includes('left') && player.x < PLAY_X - DOOR_REACH) {
            return 'left';
        }
        if (
            centeredY &&
            this.room.doors.includes('right') &&
            player.x > PLAY_RIGHT + DOOR_REACH
        ) {
            return 'right';
        }
        return null;
    }

    private moveTo(dir: Dir): void {
        if (this.transitioning) {
            return;
        }
        const next = this.dungeon.neighbour(this.room, dir);
        if (!next) {
            return;
        }
        this.sfx.play('door', 0.2);
        this.slideTo(dir, () => this.enterRoom(next, dir));
    }

    private descend(): void {
        if (this.transitioning) {
            return;
        }
        this.sfx.play('door', 0.2);
        this.slideTo('down', () => {
            this.level += 1;
            this.dungeon = Dungeon.generate(this.level);
            this.enterRoom(this.dungeon.start, null);
            this.saveRun();
        });
    }

    /**
     * Slide between rooms like the reference: the old frame is captured, the
     * new room comes in from the door side while the snapshot leaves the other
     * way. The HUD is compensated so it stays glued to the screen.
     */
    private slideTo(dir: Dir, changeRoom: () => void): void {
        this.transitioning = true;
        this.inputManager.setEnabled(false);
        this.player.body.setVelocity(0, 0);

        const camera = this.cameras.main;
        const baseX = camera.scrollX;
        const baseY = camera.scrollY;
        const vec: Record<Dir, [number, number]> = {
            up: [0, -1],
            down: [0, 1],
            left: [-1, 0],
            right: [1, 0],
        };
        const [vx, vy] = vec[dir];
        const dx = -vx * GAME_W;
        const dy = -vy * GAME_H;

        let snapshot: Phaser.GameObjects.Image | undefined;
        let textureKey: string | undefined;
        const complete = (): void => {
            camera.setScroll(baseX, baseY);
            this.hud.shift(0, 0);
            this.vignette.setPosition(0, 0);
            snapshot?.destroy();
            if (textureKey) {
                this.textures.remove(textureKey);
            }
            this.transitioning = false;
            this.inputManager.setEnabled(true);
        };

        const placeSnapshot = (image: HTMLImageElement): void => {
            textureKey = `slide_${this.slideSeq += 1}`;
            this.textures.addImage(textureKey, image);
            changeRoom();
            camera.setScroll(baseX + dx, baseY + dy);
            snapshot = this.add
                .image(dx, dy, textureKey)
                .setOrigin(0)
                .setDisplaySize(GAME_W, GAME_H)
                .setDepth(95);
            this.hud.shift(dx, dy);
            this.vignette.setPosition(dx, dy);

            const state = { t: 0 };
            this.tweens.add({
                targets: state,
                t: 1,
                duration: 300,
                ease: 'Cubic.easeOut',
                onUpdate: () => {
                    const cx = dx * (1 - state.t);
                    const cy = dy * (1 - state.t);
                    camera.setScroll(baseX + cx, baseY + cy);
                    this.hud.shift(cx, cy);
                    this.vignette.setPosition(cx, cy);
                },
                onComplete: complete,
            });
        };

        // Hide the HUD for the one frame the snapshot is captured in, then
        // restore it exactly as it was.
        this.hud.setVisible(false);
        this.game.renderer.snapshot((result) => {
            this.hud.setVisible(true);
            if (result instanceof HTMLImageElement && result.width > 0) {
                placeSnapshot(result);
                return;
            }
            changeRoom();
            complete();
        });
    }

    private refreshHud(): void {
        const cells: MapRoom[] = this.dungeon.rooms.map((room) => ({
            gx: room.gx,
            gy: room.gy,
            type: room.type,
            cleared: room.cleared,
            seen: room.seen,
            doors: room.doors,
        }));
        this.hud.setMap(
            cells,
            { gx: this.room.gx, gy: this.room.gy },
            this.level
        );
        this.hud.setItems(this.player.inventory.items);
        this.hud.setCoins(this.coins);
        this.hud.update(this.player.hp, this.kills, this.player.stats.maxHp);
        this.hud.setTime(this.runTime);
        this.hud.setStats(this.player.stats);
    }

    private readonly onPlayerTearWall: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
        object1,
        object2
    ) => {
        // Phaser can hand group-vs-array collisions back in either order.
        const tear = (isTearObject(object1) ? object1 : object2) as Phaser.Physics.Arcade.Sprite;
        const solid = (tear === object1 ? object2 : object1) as Phaser.GameObjects.Image;
        if (solid?.data && solid.active && solid.getData('rockHp') !== undefined) {
            this.hitRock(solid, tear.x, tear.y);
        }
        this.playerTears.onWall(tear);
    };

    /** Rocks take three tears and sometimes cough up a coin. */
    private hitRock(
        rock: Phaser.GameObjects.Image,
        hitX: number,
        hitY: number,
        amount = 1
    ): void {
        const hp = (rock.getData('rockHp') as number) - amount;
        if (hp > 0) {
            rock.setData('rockHp', hp);
            rock.setTint(0xb89070);
            this.sfx.play('hit', 0.12, 0.06);
            this.time.delayedCall(80, () => {
                if (rock.active) {
                    rock.clearTint();
                }
            });
            return;
        }
        const obstacle = rock.getData('obstacle') as { x: number; y: number } | undefined;
        this.room.obstacles = this.room.obstacles.filter((entry) => entry !== obstacle);
        rock.destroy();
        this.sfx.play('hit', 0.16);
        this.burst(hitX, hitY, 0x9a8060, 7, 22, 0.42);
        for (let i = 0; i < 5; i += 1) {
            const chip = this.add
                .image(hitX, hitY, TEX.rock)
                .setScale(0.25)
                .setDepth(13)
                .setTint(0x9a8060);
            const angle = Math.random() * Math.PI * 2;
            this.tweens.add({
                targets: chip,
                x: hitX + Math.cos(angle) * 16,
                y: hitY + Math.sin(angle) * 10 + 6,
                alpha: 0,
                duration: 260,
                onComplete: () => chip.destroy(),
            });
        }
        if (Math.random() < 0.45 + this.player.stats.luck * 0.03) {
            this.spawnCoin(hitX, hitY + 6);
        }
    }

    private readonly onEnemyTearWall: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
        object1,
        object2
    ) => {
        const tear = (isTearObject(object1) ? object1 : object2) as Phaser.Physics.Arcade.Sprite;
        this.enemyTears.pop(tear);
    };

    private readonly onPlayerEnemy: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
        _playerObject,
        enemyObject
    ) => {
        if (this.spawnGrace > 0 || this.transitioning) {
            return;
        }
        const enemy = this.enemyFromObject(enemyObject);
        if (!enemy || enemy.dead) {
            return;
        }
        this.player.takeDamage(enemy.contact, enemy.x, enemy.y);
    };

    private readonly onPlayerTearEnemy: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
        tearObject,
        enemyObject
    ) => {
        const tear = tearObject as Phaser.Physics.Arcade.Sprite;
        const enemy = this.enemyFromObject(enemyObject);
        if (!tear.active || !enemy || enemy.dead) {
            return;
        }
        if (this.spawnGrace > 0) {
            // Still materialising: the ring is visible, hits splash but do no damage.
            this.playerTears.pop(tear);
            return;
        }
        if (!this.playerTears.hitOnce(tear, enemy)) {
            return;
        }
        const { damage, crit } = this.playerTears.rollDamage(tear);
        enemy.takeDamage(damage, tear.x, tear.y);
        this.sfx.play('hit', 0.14, 0.025);
        this.burst(tear.x, tear.y, crit ? 0xffe0a0 : 0xa9d4ef, 4, 18, 0.32);
        this.freeze(0.025);
        const poison = (tear.getData('poison') as number) ?? 0;
        if (poison > 0) {
            enemy.applyPoison(poison, 2.5);
        }
        const slow = (tear.getData('slow') as number) ?? 0;
        if (slow > 0) {
            enemy.applySlow(slow, 1.6);
        }
        this.player.inventory.run('onHit', {
            player: this.player,
            scene: this,
            enemy,
            damage,
            blast: this.blastAt,
        });
        if (!this.playerTears.pierceThrough(tear)) {
            this.playerTears.pop(tear);
        }
    };

    private readonly onEnemyTearPlayer: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (
        _playerObject,
        tearObject
    ) => {
        if (this.transitioning) {
            return;
        }
        const tear = tearObject as Phaser.Physics.Arcade.Sprite;
        if (!tear.active) {
            return;
        }
        this.player.takeDamage(tear.getData('damage') as number, tear.x, tear.y);
        this.enemyTears.pop(tear);
    };


    private readonly onPlayerBoss: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = () => {
        if (this.transitioning || !this.boss || this.boss.dead || !this.boss.aggro) {
            return;
        }
        this.player.takeDamage(this.boss.contact, this.boss.x, this.boss.y);
    };

    private enemyFromObject(object: unknown): Enemy | undefined {
        const sprite = object as Phaser.Physics.Arcade.Sprite;
        return this.enemies.find((enemy) => enemy.sprite === sprite);
    }

    private onPlayerDeath(): void {
        this.dead = true;
        this.clearSave();
        this.inputManager.setEnabled(false);
        this.sfx.play('hurt', 0.3);
        this.hud.update(0, this.kills, this.player.stats.maxHp);
        this.hud.showDeath(this.settlementStats(), {
            onRestart: () => this.restart(),
            onMenu: () => this.goToMenu(),
        });
        this.playerTears.clear();
        this.enemyTears.clear();
        this.time.delayedCall(500, () => {
            this.canRestart = true;
        });
    }

    private setGmPaused(open: boolean): void {
        if (open) {
            this.gmOpen = true;
            this.physics.world.pause();
            this.tweens.pauseAll();
            this.time.paused = true;
            this.inputManager.setEnabled(false);
        } else {
            this.gmOpen = false;
            this.physics.world.resume();
            this.tweens.resumeAll();
            this.time.paused = false;
            this.inputManager.setEnabled(true);
            this.keepPlayerInRoom();
        }
    }

    private gmSetLevel(level: number): void {
        const next = Math.max(1, Math.min(FINAL_LEVEL, Math.round(level)));
        this.level = next;
        this.spawnGrace = 0;
        this.hitStop = 0;
        this.dungeon = Dungeon.generate(next);
        this.enterRoom(this.dungeon.start, null);
        this.refreshHud();
        this.hud.setStats(this.player.stats);
        this.hud.setTime(this.runTime);
        this.hud.update(this.player.hp, this.kills, this.player.stats.maxHp);
    }

    private gmAddItem(item: ItemDef): void {
        this.player.inventory.add(item);
        this.player.refreshLook();
        this.hud.setItems(this.player.inventory.items);
        this.hud.setStats(this.player.stats);
        this.hud.update(this.player.hp, this.kills, this.player.stats.maxHp);
    }

    private gmRemoveItem(id: string): void {
        if (!this.player.inventory.remove(id)) {
            return;
        }
        this.player.clearCharge();
        this.player.hp = Math.min(this.player.hp, this.player.stats.maxHp);
        this.player.refreshLook();
        this.hud.setItems(this.player.inventory.items);
        this.hud.setStats(this.player.stats);
        this.hud.update(this.player.hp, this.kills, this.player.stats.maxHp);
    }

    private gmToggleInvincible(): boolean {
        this.player.godMode = !this.player.godMode;
        return this.player.godMode;
    }

    private gmJumpToBoss(): void {
        this.level = Math.max(1, Math.min(FINAL_LEVEL, this.level));
        this.spawnGrace = 0;
        this.hitStop = 0;
        this.dungeon = Dungeon.generate(this.level);
        this.enterRoom(this.dungeon.boss, null);
        this.refreshHud();
        this.hud.setStats(this.player.stats);
        this.hud.update(this.player.hp, this.kills, this.player.stats.maxHp);
    }

    private gmAddAllItems(): number {
        let added = 0;
        for (const item of ITEMS) {
            if (!this.player.inventory.items.some((owned) => owned.id === item.id)) {
                this.player.inventory.add(item);
                added += 1;
            }
        }
        if (added > 0) {
            this.player.refreshLook();
            this.hud.setItems(this.player.inventory.items);
            this.hud.setStats(this.player.stats);
            this.hud.update(this.player.hp, this.kills, this.player.stats.maxHp);
        }
        return added;
    }

    private settlementStats(): {
        kills: number;
        items: string[];
        seconds: number;
        level: number;
        rooms: number;
        totalRooms: number;
        bosses: number;
    } {
        return {
            kills: this.kills,
            items: this.player.inventory.items.map((item) => item.name),
            seconds: this.runTime,
            level: this.level,
            rooms: this.dungeon.rooms.filter((room) => room.visited).length,
            totalRooms: this.dungeon.rooms.length,
            bosses: this.bossKills,
        };
    }

    private goToMenu(): void {
        this.inputManager.setEnabled(false);
        this.cameras.main.fadeOut(160, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('MainMenuScene');
        });
    }

    private readonly onEndMenuKey = (): void => {
        if (this.dead || this.victory) {
            this.goToMenu();
        }
    };

    /** Enemies and the boss are homing / turret targets. */
    private homingTargets(): Array<{ x: number; y: number; dead?: boolean; rock?: boolean }> {
        const targets: Array<{ x: number; y: number; dead?: boolean; rock?: boolean }> =
            this.enemies.map((enemy) => ({ x: enemy.x, y: enemy.y, dead: enemy.dead }));
        if (this.boss && !this.boss.dead) {
            targets.push({ x: this.boss.x, y: this.boss.y });
        }
        // Breakable rocks are valid light-assist targets (the strong homing
        // item ignores them; see TearManager.steer).
        for (const solid of this.roomView.solids) {
            const rock = solid as Phaser.GameObjects.Image;
            if (rock.active && rock.getData && rock.getData('rockHp') !== undefined) {
                targets.push({ x: rock.x, y: rock.y, rock: true });
            }
        }
        return targets;
    }

    private muzzleFlash(x: number, y: number): void {
        const glow = this.add
            .image(x, y, TEX.glow)
            .setDepth(59)
            .setBlendMode('ADD')
            .setTint(0x9ad8f0)
            .setScale(0.35)
            .setAlpha(0.5);
        this.tweens.add({
            targets: glow,
            alpha: 0,
            scale: 0.7,
            duration: 90,
            ease: 'Cubic.easeOut',
            onComplete: () => glow.destroy(),
        });
    }

    /** Short freeze frame; ignores new requests while already frozen. */
    private freeze(seconds: number): void {
        if (!settings.hitStop) {
            return;
        }
        this.hitStop = Math.max(this.hitStop, seconds);
    }

    /** Small pixel burst; used for hits, kills, pickups and explosions. */
    private burst(x: number, y: number, tint: number, count = 6, distance = 26, size = 0.4): void {
        for (let i = 0; i < count; i += 1) {
            const dot = this.add
                .image(x, y, TEX.tear)
                .setDepth(43)
                .setTint(tint)
                .setScale(size)
                .setAlpha(0.95)
                .setBlendMode('ADD');
            const angle = Math.random() * Math.PI * 2;
            const reach = distance * (0.5 + Math.random() * 0.7);
            this.tweens.add({
                targets: dot,
                x: x + Math.cos(angle) * reach,
                y: y + Math.sin(angle) * reach + 4,
                alpha: 0,
                scale: size * 0.2,
                duration: 190 + Math.random() * 140,
                ease: 'Cubic.easeOut',
                onComplete: () => dot.destroy(),
            });
        }
    }

    /** Normal-room spawn window: enemies materialise with a ring and scale up. */
    private beginSpawnGrace(): void {
        this.spawnGrace = 0.7;
        for (const enemy of this.enemies) {
            const baseX = enemy.sprite.scaleX;
            const baseY = enemy.sprite.scaleY;
            enemy.sprite.setScale(baseX * 0.35, baseY * 0.35).setAlpha(1);
            this.tweens.add({
                targets: enemy.sprite,
                scaleX: baseX,
                scaleY: baseY,
                duration: 640,
                ease: 'Cubic.easeOut',
            });
            this.spawnRing(enemy.x, enemy.y, 18, 700);
            this.spawnRing(enemy.x, enemy.y, 12, 520);
        }
    }

    /** Expanding white ring used by the enemy / boss entrance animation. */
    private spawnRing(x: number, y: number, radius: number, duration: number): void {
        const ring = this.add
            .circle(x, y, 5, 0xfff0c8, 0)
            .setStrokeStyle(1.5, 0xfff0c8, 0.9)
            .setDepth(29)
            .setBlendMode('ADD');
        this.tweens.add({
            targets: ring,
            radius,
            alpha: 0,
            duration,
            ease: 'Cubic.easeOut',
            onComplete: () => ring.destroy(),
        });
    }

    /**
     * Keeps the player inside the playable rect. Only an open door leading to a
     * neighbour may pass the wall band; knockback can no longer shove the player
     * into the brickwork (or visually outside the room).
     */
    private roomBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
        const padX = 13;
        const padTop = 16;
        const padBottom = 17;
        let minX = PLAY_X + padX;
        let maxX = PLAY_RIGHT - padX;
        let minY = PLAY_Y + padTop;
        let maxY = PLAY_BOTTOM - padBottom;

        if (this.room.cleared) {
            const nearDoorX = Math.abs(this.player.x - ROOM_CX) < 22;
            const nearDoorY = Math.abs(this.player.y - ROOM_CY) < 22;
            if (nearDoorX && this.room.doors.includes('up')) {
                minY = -24;
            }
            if (nearDoorX && this.room.doors.includes('down')) {
                maxY = GAME_H + 24;
            }
            if (nearDoorY && this.room.doors.includes('left')) {
                minX = -24;
            }
            if (nearDoorY && this.room.doors.includes('right')) {
                maxX = GAME_W + 24;
            }
        }
        return { minX, maxX, minY, maxY };
    }

    private keepPlayerInRoom(): void {
        const bounds = this.roomBounds();
        this.player.clampInside(bounds.minX, bounds.maxX, bounds.minY, bounds.maxY);
    }

    /** Dark red floor stains left by kills and hits. */
    private addBlood(x: number, y: number, scale = 1): void {
        if (this.bloodSplats >= 140) {
            return;
        }
        this.bloodSplats += 1;
        const g = this.blood;
        const blobs = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < blobs; i += 1) {
            const rx = x + (Math.random() - 0.5) * 26 * scale;
            const ry = y + 8 + (Math.random() - 0.5) * 8 * scale;
            g.fillStyle(i === 0 ? 0x5a1412 : 0x3a0d0c, i === 0 ? 0.5 : 0.34);
            g.fillEllipse(
                rx,
                ry,
                (7 + Math.random() * 13) * scale,
                (3 + Math.random() * 6) * scale
            );
        }
        for (let i = 0; i < 3; i += 1) {
            const rx = x + (Math.random() - 0.5) * 34 * scale;
            const ry = y + 8 + (Math.random() - 0.5) * 14 * scale;
            g.fillStyle(0x6a1a16, 0.5);
            g.fillRect(Math.round(rx), Math.round(ry), 1, 1);
        }
    }

    /** Enemy death: blood pool, spreading ring, flash, dust and shake. */
    private enemyDeathFx(x: number, y: number, radius: number): void {
        this.addBlood(x, y, 0.9 + radius / 24);
        const ring = this.add
            .circle(x, y, 5, 0xe0503a, 0.42)
            .setDepth(40)
            .setBlendMode('ADD');
        this.tweens.add({
            targets: ring,
            radius: 26 + radius * 1.5,
            alpha: 0,
            duration: 340,
            ease: 'Cubic.easeOut',
            onComplete: () => ring.destroy(),
        });
        const flash = this.add
            .circle(x, y, 7, 0xffe6c8, 0.7)
            .setDepth(41)
            .setBlendMode('ADD');
        this.tweens.add({
            targets: flash,
            radius: 2,
            alpha: 0,
            duration: 170,
            onComplete: () => flash.destroy(),
        });
        // A wisp of soot rising off the corpse.
        const soul = this.add
            .image(x, y - 4, TEX.glow)
            .setDepth(57)
            .setBlendMode('ADD')
            .setTint(0xffb060)
            .setScale(0.5)
            .setAlpha(0.75);
        this.tweens.add({
            targets: soul,
            y: y - 32,
            scale: 0.15,
            alpha: 0,
            duration: 650,
            ease: 'Cubic.easeOut',
            onComplete: () => soul.destroy(),
        });
        // Chunky spray: warm sparks plus dark blood drops.
        this.burst(x, y, 0xffd0a8, 9, 30, 0.5);
        this.burst(x, y, 0x8f2a22, 15, 40, 0.55);
        for (let i = 0; i < 3; i += 1) {
            const puff = this.add
                .image(
                    x + (Math.random() - 0.5) * 14,
                    y + (Math.random() - 0.5) * 10,
                    TEX.glow
                )
                .setDepth(39)
                .setBlendMode('ADD')
                .setTint(0x8a3a2c)
                .setScale(0.45)
                .setAlpha(0.5);
            this.tweens.add({
                targets: puff,
                scale: 1.25,
                alpha: 0,
                duration: 300 + i * 70,
                ease: 'Cubic.easeOut',
                onComplete: () => puff.destroy(),
            });
        }
        shakeCamera(this, 60, 0.0026);
    }

    /** Area damage used by explosive tears, item hooks and retaliation. */
    private blastAt = (x: number, y: number, radius: number, damage: number): void => {
        if (damage <= 0) {
            return;
        }
        for (const enemy of [...this.enemies]) {
            if (enemy.dead) {
                continue;
            }
            if (Math.hypot(enemy.x - x, enemy.y - y) <= radius + enemy.radius) {
                enemy.takeDamage(damage, x, y);
            }
        }
        const boss = this.boss;
        if (boss && !boss.dead && !boss.entering && Math.hypot(boss.x - x, boss.y - y) < radius + 20) {
            boss.takeDamage(damage, x, y);
        }
        this.sfx.play('explode', 0.16, 0.09);
        this.burst(x, y, 0xffa060, 8, 26, 0.45);
        this.freeze(0.04);
    };

    /** Charged beam: hits everything on the ray. */
    private fireBeam(x: number, y: number, dir: Dir, damage: number, length: number): void {
        const dx = dirX(dir);
        const dy = dirY(dir);
        const onRay = (tx: number, ty: number, radius: number): boolean => {
            const px = tx - x;
            const py = ty - y;
            const along = px * dx + py * dy;
            if (along < -radius || along > length + radius) {
                return false;
            }
            return Math.abs(px * dy - py * dx) <= radius + 6;
        };
        for (const enemy of [...this.enemies]) {
            if (!enemy.dead && onRay(enemy.x, enemy.y, enemy.radius)) {
                enemy.takeDamage(damage, x, y);
            }
        }
        const boss = this.boss;
        if (boss && !boss.dead && !boss.entering && onRay(boss.x, boss.y, 22)) {
            boss.takeDamage(damage, x, y);
        }
        // The charged beam also cracks rocks in its path.
        for (const solid of [...this.roomView.solids]) {
            const rock = solid as Phaser.GameObjects.Image;
            if (
                rock.data &&
                rock.active &&
                rock.getData('rockHp') !== undefined &&
                onRay(rock.x, rock.y, 9)
            ) {
                this.hitRock(rock, rock.x, rock.y, 2);
            }
        }

        const endX = x + dx * length;
        const endY = y + dy * length;
        this.sfx.play('beam', 0.24);
        this.burst(endX, endY, 0xff5a3a, 12, 30, 0.5);
        this.freeze(0.05);
        // Layered red plasma: soft outer bloom, hot red body, white-hot core.
        const beam = this.add.graphics().setDepth(60).setBlendMode('ADD');
        for (const [width, color, alpha] of [
            [26, 0xff1a10, 0.1],
            [16, 0xff2a18, 0.22],
            [9, 0xff4028, 0.6],
            [4.5, 0xffd8c0, 0.95],
            [1.8, 0xffffff, 1],
        ] as const) {
            beam.lineStyle(width, color, alpha);
            beam.lineBetween(x, y, endX, endY);
        }
        const muzzle = this.add
            .image(x, y, TEX.glow)
            .setDepth(61)
            .setBlendMode('ADD')
            .setTint(0xff4020)
            .setScale(1.2)
            .setAlpha(0.95);
        const impact = this.add
            .image(endX, endY, TEX.glow)
            .setDepth(61)
            .setBlendMode('ADD')
            .setTint(0xff7050)
            .setScale(0.9)
            .setAlpha(0.9);
        const ring = this.add
            .circle(x, y, 6, 0xff4020, 0)
            .setStrokeStyle(2, 0xffa080, 0.9)
            .setDepth(61);
        this.tweens.add({
            targets: beam,
            alpha: 0,
            duration: 200,
            ease: 'Cubic.easeOut',
            onComplete: () => beam.destroy(),
        });
        this.tweens.add({
            targets: [muzzle, impact],
            alpha: 0,
            scale: 1.8,
            duration: 180,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                muzzle.destroy();
                impact.destroy();
            },
        });
        this.tweens.add({
            targets: ring,
            radius: 18,
            alpha: 0,
            duration: 220,
            ease: 'Cubic.easeOut',
            onComplete: () => ring.destroy(),
        });
    }

    private updateAura(dt: number): void {
        const aura = this.player.stats.aura;
        if (aura <= 0) {
            this.auraCd = 0;
            return;
        }
        this.auraCd -= dt;
        if (this.auraCd > 0) {
            return;
        }
        this.auraCd = 0.45;
        const x = this.player.x;
        const y = this.player.y - 4;
        for (const enemy of [...this.enemies]) {
            if (!enemy.dead && Math.hypot(enemy.x - x, enemy.y - y) < 46) {
                enemy.takeTrueDamage(aura * 0.45);
            }
        }
        const boss = this.boss;
        if (boss && !boss.dead && !boss.entering && Math.hypot(boss.x - x, boss.y - y) < 54) {
            boss.takeDamage(aura * 0.45, x, y);
        }
        const ring = this.add
            .image(x, y, TEX.glow)
            .setDepth(29)
            .setBlendMode('ADD')
            .setTint(0xff9060)
            .setScale(0.9)
            .setAlpha(0.3);
        this.tweens.add({
            targets: ring,
            alpha: 0,
            scale: 1.4,
            duration: 360,
            onComplete: () => ring.destroy(),
        });
    }

    private updateTurrets(dt: number): void {
        const turrets = Math.round(this.player.stats.turrets);
        if (turrets <= 0 || this.player.orbiters.length === 0) {
            return;
        }
        this.turretCd -= dt;
        if (this.turretCd > 0) {
            return;
        }
        this.turretCd = 0.9;
        const targets = this.homingTargets().filter((target) => !target.dead);
        for (const orb of this.player.orbiters) {
            let best: { x: number; y: number } | undefined;
            let bestDist = 260;
            for (const target of targets) {
                const dist = Math.hypot(target.x - orb.x, target.y - orb.y);
                if (dist < bestDist) {
                    bestDist = dist;
                    best = target;
                }
            }
            if (!best) {
                continue;
            }
            const angle = Math.atan2(best.y - orb.y, best.x - orb.x);
            const speed = 300;
            this.playerTears.spawnVelocity(
                orb.x,
                orb.y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                this.player.stats.damage * 0.45,
                true,
                0.7,
                undefined,
                0.7
            );
        }
    }

    private ensurePickupTextures(): void {
        if (!this.textures.exists('pickup_coin')) {
            const g = this.add.graphics();
            g.fillStyle(0x7a4a10, 1);
            g.fillCircle(4, 4, 3.6);
            g.fillStyle(0xffcf4a, 1);
            g.fillCircle(4, 4, 3);
            g.fillStyle(0xfff0b0, 1);
            g.fillRect(3, 2, 2, 2);
            g.generateTexture('pickup_coin', 8, 8);
            g.destroy();
        }
        if (!this.textures.exists('pickup_bomb')) {
            const g = this.add.graphics();
            g.fillStyle(0x1a1210, 1);
            g.fillCircle(6, 8, 5.2);
            g.fillStyle(0x4a3c30, 1);
            g.fillCircle(4.5, 6.5, 2.6);
            g.fillStyle(0x8a6a3a, 1);
            g.fillRect(6, 2, 2, 4);
            g.fillStyle(0xffd060, 1);
            g.fillCircle(7, 2, 1.6);
            g.generateTexture('pickup_bomb', 12, 14);
            g.destroy();
        }
        if (!this.textures.exists('pickup_key')) {
            const g = this.add.graphics();
            g.lineStyle(2, 0xe8c870, 1);
            g.strokeCircle(4, 5, 3);
            g.lineBetween(6, 8, 11, 12);
            g.fillStyle(0xe8c870, 1);
            g.fillRect(10, 11, 2, 2);
            g.fillRect(8, 12, 2, 2);
            g.generateTexture('pickup_key', 12, 14);
            g.destroy();
        }
    }

    private loadAudioSettings(): void {
        try {
            this.muted = localStorage.getItem('soot-muted') === '1';
            const saved = Number(localStorage.getItem('soot-volume'));
            if (Number.isFinite(saved) && saved > 0 && saved <= 1) {
                this.masterVolume = saved;
            }
        } catch {
            // Storage can be unavailable in private mode; keep defaults.
        }
        this.sound.mute = this.muted;
        this.sound.volume = this.masterVolume;
        this.hud.setAudio(this.muted, this.masterVolume);
    }

    private saveAudioSettings(): void {
        try {
            localStorage.setItem('soot-muted', this.muted ? '1' : '0');
            localStorage.setItem('soot-volume', String(this.masterVolume));
        } catch {
            // Ignore storage failures.
        }
    }

    /** Re-apply persisted settings once the browser unlocks audio. */
    private readonly reapplyAudio = (): void => {
        this.sound.mute = this.muted;
        this.sound.volume = this.masterVolume;
        this.hud.setAudio(this.muted, this.masterVolume);
        // A WebAudio play() issued while the context was locked can be dropped;
        // retry as soon as the first user gesture unlocks it.
        if (this.bgm && !this.bgm.isPlaying) {
            this.bgm.play();
        }
    };

    /** Shows the resume hint if a floor checkpoint exists. */
    private offerContinue(): void {
        this.activeSlot = this.saveSlots.findIndex((slot) => !slot);
        if (this.activeSlot < 0) {
            this.activeSlot = 0;
        }

        let best = -1;
        for (let i = 0; i < this.saveSlots.length; i += 1) {
            const slot = this.saveSlots[i];
            if (slot && (best < 0 || slot.level > (this.saveSlots[best] as SaveData).level)) {
                best = i;
            }
        }
        if (best < 0) {
            return;
        }
        this.saveData = this.saveSlots[best];
        const label = this.saveSlots
            .map((slot, index) => (slot ? `${index + 1}) B${slot.level}` : null))
            .filter((entry) => entry !== null)
            .join('  ');
        this.hud.showContinueHint(label, () => this.continueRun(best));
    }

    private refreshSaveSlots(): void {
        this.saveSlots = readSlots();
    }

    /** Exposed for the save smoke test; delegates to the shared save module. */
    readSlot(slot: number): SaveData | null {
        return readSlot(slot);
    }

    writeSlot(slot: number, data: SaveData): void {
        writeSlot(slot, data);
    }

    /** Checkpoint at the start of each descended floor, in the active slot. */
    private saveRun(): void {
        if (this.level < 2 || this.dead || this.victory) {
            return;
        }
        const data: SaveData = {
            v: 1,
            level: this.level,
            hp: this.player.hp,
            kills: this.kills,
            coins: this.coins,
            bombs: this.bombs,
            keys: this.keys,
            runTime: this.runTime,
            items: this.player.inventory.items.map((item) => item.id),
            heartBonus: this.player.inventory.extraHearts,
        };
        this.saveData = data;
        this.saveSlots[this.activeSlot] = data;
        this.writeSlot(this.activeSlot, data);
    }

    private clearSave(): void {
        this.saveData = null;
        this.saveSlots[this.activeSlot] = null;
        removeSlot(this.activeSlot);
        this.hud.hideContinueHint();
    }

    private continueRun(slot = this.activeSlot): void {
        if (!this.saveSlots[slot]) {
            this.refreshSaveSlots();
        }
        const data = this.saveSlots[slot];
        if (!data) {
            this.hud.showToast('没有存档', 700);
            return;
        }
        this.activeSlot = slot;
        this.saveData = null;
        this.hud.hideContinueHint();

        this.level = data.level;
        this.kills = data.kills;
        // One boss per cleared floor; the checkpoint only stores the floor.
        this.bossKills = Math.max(0, data.level - 1);
        this.coins = data.coins;
        this.bombs = data.bombs;
        this.keys = data.keys;
        this.runTime = data.runTime;
        this.dead = false;
        this.victory = false;

        const player = this.player;
        player.inventory.reset();
        for (const id of data.items) {
            const item = itemById(id);
            if (item) {
                player.inventory.add(item);
            }
        }
        player.inventory.addHeartBonus(data.heartBonus);
        player.reset(ROOM_CX, PLAY_BOTTOM - 48);
        player.hp = Math.max(1, Math.min(data.hp, player.stats.maxHp));

        this.dungeon = Dungeon.generate(this.level);
        this.enterRoom(this.dungeon.start, null);
        this.player.onRoomEnter();
        this.hud.setConsumables(this.bombs, this.keys);
        this.hud.showToast(`继续 B${data.level}（槽 ${slot + 1}）`, 1200);
    }

    private continueSlot(slot: number): void {
        if (this.level !== 1 || this.room.type !== 'start' || this.dead || this.victory) {
            return;
        }
        if (!this.saveSlots[slot]) {
            this.hud.showToast(`槽 ${slot + 1} 没有存档`, 800);
            return;
        }
        this.continueRun(slot);
    }

    private readonly onContinueKey = (): void => {
        if (this.level !== 1 || this.room.type !== 'start' || this.dead || this.victory) {
            return;
        }
        if (!this.saveData) {
            return;
        }
        this.continueRun(this.activeSlot);
    };

    private readonly onSlotOne = (): void => this.continueSlot(0);

    private readonly onSlotTwo = (): void => this.continueSlot(1);

    private readonly onSlotThree = (): void => this.continueSlot(2);

    private startMusic(): void {
        if (!this.cache.audio.exists(MUSIC.loop)) {
            return;
        }
        const existing = this.sound.get(MUSIC.loop);
        if (existing) {
            this.bgm = existing;
            if (!existing.isPlaying) {
                existing.play();
            }
            return;
        }
        this.bgm = this.sound.add(MUSIC.loop, { loop: true, volume: 0.7 });
        this.bgm.play();
    }

    private readonly onMuteKey = (): void => {
        this.toggleMuteSilent();
        if (!this.pausedByUser) {
            this.hud.showToast(
                this.muted ? '已静音（M 恢复）' : `声音已开 ${Math.round(this.masterVolume * 100)}%`,
                900
            );
        }
    };

    private toggleMuteSilent(): void {
        this.muted = !this.muted;
        this.sound.mute = this.muted;
        this.saveAudioSettings();
        this.hud.setAudio(this.muted, this.masterVolume);
        this.pauseMuteText?.setText(this.muted ? '静音：开' : '静音：关');
    }

    toggleShakeSetting(): void {
        settings.shake = !settings.shake;
        saveSettings();
    }

    toggleHitStopSetting(): void {
        settings.hitStop = !settings.hitStop;
        saveSettings();
    }

    private readonly onVolumeDown = (): void => this.changeVolume(-0.1, this.pausedByUser);

    private readonly onVolumeUp = (): void => this.changeVolume(0.1, this.pausedByUser);

    private readonly onPauseKey = (): void => {
        if (this.gmOpen) {
            this.hud.closeGm();
            return;
        }
        this.togglePause();
    };

    /** Freeze gameplay and show the pause panel. */
    private togglePause(): void {
        if (this.dead || this.victory || this.transitioning || this.gmOpen) {
            return;
        }
        this.pausedByUser = !this.pausedByUser;
        if (this.pausedByUser) {
            this.physics.world.pause();
            this.tweens.pauseAll();
            this.time.paused = true;
            this.hud.hideContinueHint();
            this.buildPause();
        } else {
            this.hidePause();
            this.physics.world.resume();
            this.tweens.resumeAll();
            this.time.paused = false;
            if (this.level === 1 && this.room.type === 'start' && !this.dead) {
                this.offerContinue();
            }
        }
    }

    private buildPause(): void {
        const layer = this.add.container(0, 0).setDepth(180);
        const shade = this.add
            .rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.66)
            .setOrigin(0)
            .setInteractive();
        const panel = this.add
            .rectangle(GAME_W / 2, GAME_H / 2, 348, 288, 0x140d09, 0.97)
            .setStrokeStyle(2, 0x6b4a2c);
        const title = this.add
            .text(GAME_W / 2, 62, 'PAUSED', {
                fontFamily: 'Consolas, monospace',
                fontSize: '22px',
                fontStyle: 'bold',
                color: '#f0cf7a',
            })
            .setOrigin(0.5)
            .setResolution(2);
        this.pauseVolumeText = this.add
            .text(GAME_W / 2, 96, `音量 ${Math.round(this.masterVolume * 100)}%`, {
                fontFamily: 'Microsoft YaHei, Consolas, monospace',
                fontSize: '11px',
                color: '#e8d2a8',
            })
            .setOrigin(0.5)
            .setResolution(2);

        // Volume slider.
        const left = 224;
        const right = 416;
        const sliderY = 118;
        const track = this.add.graphics();
        const knob = this.add
            .rectangle(left + (right - left) * this.masterVolume, sliderY, 12, 16, 0xf0d6a0)
            .setInteractive({ useHandCursor: true });
        this.input.setDraggable(knob);
        const sliderHit = this.add
            .rectangle((left + right) / 2, sliderY, right - left + 12, 20, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });
        sliderHit.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.setVolume((pointer.worldX - left) / (right - left));
        });
        knob.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number) => {
            this.setVolume((dragX - left) / (right - left));
        });
        this.pauseSlider = { track, knob, left, right, y: sliderY };
        this.updatePauseSlider();

        this.pauseMuteText = this.pauseButton(
            GAME_W / 2,
            152,
            this.muted ? '静音：开' : '静音：关',
            () => this.toggleMuteSilent()
        );
        const shake = this.pauseButton(
            GAME_W / 2,
            184,
            `震屏：${settings.shake ? '开' : '关'}`,
            () => {
                this.toggleShakeSetting();
                shake.setText(`震屏：${settings.shake ? '开' : '关'}`);
            }
        );
        const hitStop = this.pauseButton(
            GAME_W / 2,
            216,
            `命中停顿：${settings.hitStop ? '开' : '关'}`,
            () => {
                this.toggleHitStopSetting();
                hitStop.setText(`命中停顿：${settings.hitStop ? '开' : '关'}`);
            }
        );
        const resume = this.pauseButton(GAME_W / 2, 252, '继续游戏', () => this.togglePause());
        const menu = this.pauseButton(GAME_W / 2, 284, '返回主界面', () => this.returnToMenu());
        layer.add([
            shade,
            panel,
            title,
            this.pauseVolumeText,
            track,
            sliderHit,
            knob,
            this.pauseMuteText,
            shake,
            hitStop,
            resume,
            menu,
        ]);
        crispContainer(layer);
        this.pauseLayer = layer;
    }

    private pauseButton(
        x: number,
        y: number,
        label: string,
        onClick: () => void
    ): Phaser.GameObjects.Text {
        const button = this.add
            .text(x, y, label, {
                fontFamily: 'Microsoft YaHei, Consolas, monospace',
                fontSize: '11px',
                color: '#f0e0c0',
                backgroundColor: 'rgba(46,30,18,0.95)',
                padding: { x: 14, y: 6 },
            })
            .setOrigin(0.5)
            .setDepth(181)
            .setInteractive({ useHandCursor: true })
            .setResolution(2);
        button.on('pointerdown', onClick);
        return button;
    }

    /** Leave the run untouched and go back to the title screen. */
    private returnToMenu(): void {
        this.pausedByUser = false;
        this.hidePause();
        this.physics.world.resume();
        this.tweens.resumeAll();
        this.time.paused = false;
        this.sfx.play('door', 0.2);
        this.cameras.main.fadeOut(140, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('MainMenuScene');
        });
    }

    private hidePause(): void {
        this.pauseLayer?.destroy(true);
        this.pauseLayer = undefined;
        this.pauseVolumeText = undefined;
        this.pauseMuteText = undefined;
        this.pauseSlider = undefined;
    }

    private setVolume(value: number, silent = false): void {
        const next = Math.max(0, Math.min(1, Math.round(value * 100) / 100));
        this.masterVolume = next;
        this.muted = next === 0;
        this.sound.mute = this.muted;
        this.sound.volume = next;
        this.saveAudioSettings();
        this.hud.setAudio(this.muted, this.masterVolume);
        this.pauseVolumeText?.setText(`音量 ${Math.round(next * 100)}%`);
        this.pauseMuteText?.setText(this.muted ? '静音：开' : '静音：关');
        this.updatePauseSlider();
        if (!silent) {
            this.hud.showToast(`音量 ${Math.round(next * 100)}%`, 700);
        }
    }

    private changeVolume(delta: number, silent = false): void {
        this.setVolume(this.masterVolume + delta, silent);
    }

    private updatePauseSlider(): void {
        const slider = this.pauseSlider;
        if (!slider) {
            return;
        }
        const { track, knob, left, right, y } = slider;
        track.clear();
        track.fillStyle(0x2a1d12, 1);
        track.fillRoundedRect(left, y - 3, right - left, 6, 3);
        track.fillStyle(0xc49352, 1);
        track.fillRoundedRect(left, y - 3, Math.max(4, (right - left) * this.masterVolume), 6, 3);
        knob.setX(left + (right - left) * this.masterVolume);
    }

    private placeBomb(): void {
        if (this.player.dead) {
            return;
        }
        if (this.bombs <= 0) {
            this.hud.showToast('没有炸弹了', 700);
            return;
        }
        this.bombs -= 1;
        this.hud.setConsumables(this.bombs, this.keys);
        const x = this.player.x;
        const y = this.player.y + 4;
        const bomb = this.add.image(x, y, 'pickup_bomb').setDepth(17).setScale(1.5);
        this.sfx.play('shoot', 0.1);
        this.tweens.add({
            targets: bomb,
            scale: 1.85,
            duration: 140,
            yoyo: true,
            repeat: 9,
            ease: 'Sine.easeInOut',
        });
        this.time.delayedCall(1350, () => {
            if (!bomb.active) {
                return;
            }
            bomb.destroy();
            this.explodeBomb(x, y);
        });
    }

    private explodeBomb(x: number, y: number): void {
        const radius = 62;
        this.sfx.play('explode', 0.3);
        this.freeze(0.06);
        shakeCamera(this, 160, 0.007);
        this.burst(x, y, 0xffb060, 18, 52, 0.6);
        const ring = this.add
            .circle(x, y, 14, 0xffb060, 0.35)
            .setDepth(41)
            .setBlendMode('ADD');
        this.tweens.add({
            targets: ring,
            radius,
            alpha: 0,
            duration: 260,
            onComplete: () => ring.destroy(),
        });
        for (const enemy of [...this.enemies]) {
            if (!enemy.dead && Math.hypot(enemy.x - x, enemy.y - y) <= radius + enemy.radius) {
                enemy.takeDamage(14, x, y);
            }
        }
        const boss = this.boss;
        if (boss && !boss.dead && Math.hypot(boss.x - x, boss.y - y) <= radius + 22) {
            boss.takeDamage(14, x, y);
        }
        for (const solid of [...this.roomView.solids]) {
            const rock = solid as Phaser.GameObjects.Image;
            if (
                rock.data &&
                rock.active &&
                rock.getData('rockHp') !== undefined &&
                Math.hypot(rock.x - x, rock.y - y) <= radius
            ) {
                rock.setData('rockHp', 1);
                this.hitRock(rock, rock.x, rock.y);
            }
        }
        if (Math.hypot(this.player.x - x, this.player.y - y) < radius * 0.8) {
            this.player.takeDamage(1, x, y);
        }
    }

    /** One pickup: coin, heart, half heart or item. */
    private addPickup(
        kind: PickupKind,
        x: number,
        y: number,
        value = 1,
        item?: ItemDef
    ): void {
        if (kind === 'item' && !item) {
            return;
        }
        const texture =
            kind === 'coin'
                ? 'pickup_coin'
                : kind === 'bomb'
                  ? 'pickup_bomb'
                  : kind === 'key'
                    ? 'pickup_key'
                    : kind === 'heart'
                      ? TEX.heartFull
                      : kind === 'halfHeart'
                        ? TEX.heartHalf
                        : TEX.tear;
        const sprite = this.add.image(x, y, texture).setDepth(16);
        let glowScale = 0.45;
        let glowAlpha = 0.3;
        let glowTint = 0xff6a5a;
        if (kind === 'coin') {
            sprite.setScale(1.5);
            glowTint = 0xffd060;
        } else if (kind === 'heart' || kind === 'halfHeart') {
            sprite.setScale(1.6);
        } else if (kind === 'bomb') {
            sprite.setScale(1.4);
            glowTint = 0xff9060;
        } else if (kind === 'key') {
            sprite.setScale(1.4);
            glowTint = 0xffd070;
        } else {
            sprite.setScale(1.5).setTint(item?.color ?? 0xffffff);
            glowTint = item?.color ?? 0xffffff;
            glowScale = 0.75;
            glowAlpha = 0.45;
        }
        const glow = this.add
            .image(x, y, TEX.glow)
            .setDepth(15)
            .setBlendMode('ADD')
            .setTint(glowTint)
            .setScale(glowScale)
            .setAlpha(glowAlpha);
        this.tweens.add({
            targets: glow,
            alpha: glowAlpha + 0.25,
            scale: glowScale * 1.2,
            duration: 700,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
        this.pickups.push({ kind, value, item, sprite, glow });
    }

    private dropItem(x: number, y: number, item?: ItemDef): void {
        this.addPickup('item', x, y, 1, item);
    }

    private spawnCoin(x: number, y: number, value = 1): void {
        this.addPickup('coin', x, y, value);
    }

    private scatterPickups(
        kind: 'coin' | 'heart' | 'halfHeart',
        count: number,
        cx: number,
        cy: number,
        minRadius = 26
    ): void {
        for (let i = 0; i < count; i += 1) {
            const angle = Math.random() * Math.PI * 2;
            const radius = minRadius + Math.random() * 46;
            this.addPickup(
                kind,
                cx + Math.cos(angle) * radius,
                cy + Math.sin(angle) * radius * 0.6
            );
        }
    }

    /** Clear rewards: a few coins and sometimes a half heart. */
    private rewardRoomClear(): void {
        if (Math.random() < 0.55) {
            const count = 1 + (this.level >= 5 && Math.random() < 0.45 ? 1 : 0);
            this.scatterPickups('coin', count, ROOM_CX, ROOM_CY, 30);
        }
        if (Math.random() < 0.16) {
            this.addPickup('halfHeart', ROOM_CX + 34, ROOM_CY + 22);
        }
        if (Math.random() < 0.09) {
            this.addPickup(Math.random() < 0.5 ? 'bomb' : 'key', ROOM_CX - 34, ROOM_CY + 22);
        }
    }

    private updatePickups(dt: number): void {
        const magnet = this.player.stats.magnet;
        for (const pickup of [...this.pickups]) {
            const dx = this.player.x - pickup.sprite.x;
            const dy = this.player.y - pickup.sprite.y;
            const dist = Math.hypot(dx, dy);
            if (magnet > 0 && dist < magnet && dist > 1) {
                const step = Math.min(dist, 200 * dt);
                const nx = pickup.sprite.x + (dx / dist) * step;
                const ny = pickup.sprite.y + (dy / dist) * step;
                pickup.sprite.setPosition(nx, ny);
                pickup.glow.setPosition(nx, ny);
            }
            if (dist < 16) {
                this.collectPickup(pickup);
            }
        }
    }

    private collectPickup(pickup: Pickup): void {
        if (pickup.kind === 'heart' || pickup.kind === 'halfHeart') {
            if (this.player.hp >= this.player.stats.maxHp) {
                return;
            }
            this.player.heal(pickup.kind === 'heart' ? 2 : 1);
            this.sfx.play('heart', 0.2, 0.06);
            this.burst(pickup.sprite.x, pickup.sprite.y, 0xff6a5a, 5, 18, 0.36);
            this.hud.showToast(pickup.kind === 'heart' ? '拾得红心' : '拾得半心', 700);
        } else if (pickup.kind === 'coin') {
            this.coins += pickup.value;
            this.hud.setCoins(this.coins);
            this.sfx.play('coin', 0.18, 0.04);
            this.burst(pickup.sprite.x, pickup.sprite.y, 0xffd060, 4, 14, 0.3);
        } else if (pickup.kind === 'bomb') {
            this.bombs += 1;
            this.hud.setConsumables(this.bombs, this.keys);
            this.sfx.play('item', 0.2);
            this.burst(pickup.sprite.x, pickup.sprite.y, 0xff9060, 5, 16, 0.35);
        } else if (pickup.kind === 'key') {
            this.keys += 1;
            this.hud.setConsumables(this.bombs, this.keys);
            this.sfx.play('coin', 0.18, 0.04);
            this.burst(pickup.sprite.x, pickup.sprite.y, 0xffd070, 5, 16, 0.35);
        } else if (pickup.item) {
            this.player.addItem(pickup.item);
            this.hud.setItems(this.player.inventory.items);
            this.sfx.play('item', 0.24);
            this.burst(pickup.sprite.x, pickup.sprite.y, pickup.item.color, 10, 26, 0.45);
            this.hud.showToast(`拾得「${pickup.item.name}」· ${pickup.item.desc}`);
            this.cameras.main.flash(90, 60, 40, 16);
        }
        this.pickups = this.pickups.filter((other) => other !== pickup);
        pickup.sprite.destroy();
        pickup.glow.destroy();
        this.hud.update(this.player.hp, this.kills, this.player.stats.maxHp);
    }

    private readonly onRestartKey = (): void => {
        if (this.dead || this.victory || this.gmOpen) {
            this.restart();
        }
    };

    private restart(): void {
        if (!this.canRestart) {
            return;
        }
        this.scene.restart();
    }

    private readonly onVisibility = (): void => {
        this.paused = document.hidden || !document.hasFocus();
    };

    private readonly onShutdown = (): void => {
        this.inputManager?.destroy();
        this.bgm?.stop();
        this.bgm = undefined;
        if (this.roomView) {
            this.roomView.destroy();
        }
        this.hud?.destroy();
        this.input.keyboard?.off('keydown-R', this.onRestartKey, this);
        this.input.keyboard?.off('keydown-C', this.onContinueKey, this);
        this.input.keyboard?.off('keydown-ONE', this.onSlotOne, this);
        this.input.keyboard?.off('keydown-TWO', this.onSlotTwo, this);
        this.input.keyboard?.off('keydown-THREE', this.onSlotThree, this);
        this.input.keyboard?.off('keydown-M', this.onMuteKey, this);
        this.input.keyboard?.off('keydown-ESC', this.onPauseKey, this);
        this.input.keyboard?.off('keydown-ESC', this.onEndMenuKey, this);
        this.input.keyboard?.off('keydown-P', this.onPauseKey, this);
        this.input.keyboard?.off('keydown-OPEN_BRACKET', this.onVolumeDown, this);
        this.input.keyboard?.off('keydown-CLOSED_BRACKET', this.onVolumeUp, this);
        this.sound.off('unlocked', this.reapplyAudio, this);
        document.removeEventListener('visibilitychange', this.onVisibility);
        window.removeEventListener('blur', this.onVisibility);
        window.removeEventListener('focus', this.onVisibility);
        for (const collider of this.solidColliders) {
            collider.destroy();
        }
        delete (window as unknown as { __soot?: unknown }).__soot;
        delete (window as unknown as { __sootScene?: unknown }).__sootScene;
    };

    private debugState(): unknown {
        return {
            level: this.level,
            kills: this.kills,
            coins: this.coins,
            bombs: this.bombs,
            keys: this.keys,
            victory: this.victory,
            pausedByUser: this.pausedByUser,
            runTime: Math.round(this.runTime),
            continueLevel: this.saveData ? this.saveData.level : null,
            activeSlot: this.activeSlot,
            saveSlots: this.saveSlots.map((slot) => (slot ? slot.level : null)),
            settings: { shake: settings.shake, hitStop: settings.hitStop },
            dead: this.dead,
            transitioning: this.transitioning,
            hp: this.player.hp,
            room: {
                gx: this.room.gx,
                gy: this.room.gy,
                type: this.room.type,
                cleared: this.room.cleared,
                doors: this.room.doors,
                layout: this.room.layout,
                obstacles: this.room.obstacles.length,
                itemTaken: this.room.itemTaken,
                trapdoor: this.room.trapdoor,
                chest: this.room.chest ?? null,
                shopStock: this.room.shopStock ?? null,
            },
            rooms: this.dungeon.rooms.map((room) => ({
                gx: room.gx,
                gy: room.gy,
                type: room.type,
                cleared: room.cleared,
                seen: room.seen,
                visited: room.visited,
                doors: room.doors.length,
            })),
            enemies: this.enemies.map((enemy) => ({
                kind: enemy.kind,
                hp: enemy.hp,
                x: Math.round(enemy.x),
                y: Math.round(enemy.y),
                dead: enemy.dead,
            })),
            tears: this.playerTears.group.getLength(),
            enemyTears: this.enemyTears.group.getLength(),
            pickups: this.pickups.map((pickup) => pickup.kind),
            items: this.player.inventory.items.map((item) => item.id),
            visuals: Array.from(this.player.inventory.visuals),
            stats: this.player.stats,
            boss: this.boss
                ? {
                      kind: this.boss.kind,
                      hp: this.boss.hp,
                      maxHp: this.boss.maxHp,
                      aggro: this.boss.aggro,
                      phase: this.boss.phase,
                  }
                : null,
            player: { x: Math.round(this.player.x), y: Math.round(this.player.y) },
        };
    }
}
