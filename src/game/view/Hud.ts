import type * as Phaser from 'phaser';
import { GAME_H, GAME_W, PLAYER, TEX } from '../const';
import type { Dir, RoomType } from '../types';
import { ITEMS, type ItemDef } from '../core/items';
import type { Stats } from '../core/stats';
import { BASE_STATS } from '../core/stats';
import { itemIconKey, makePixelIcon } from './itemIcon';
import { crispContainer, crispText } from './crispText';

export interface MapRoom {
    gx: number;
    gy: number;
    type: RoomType;
    cleared: boolean;
    seen: boolean;
    doors?: Dir[];
}

/** Chapter names shown next to the floor number, three floors each. */
const FLOOR_SECTORS: readonly string[] = [
    '灰烬地下室',
    '煤渣回廊',
    '锈铁深井',
    '锅炉腹地',
    '无光之底',
];

/** 10x10 masks for the little stat icons on the left-hand panel. */
const STAT_MASKS: Record<string, readonly string[]> = {
    speed: [
        '..........',
        '...oo.....',
        '...o+o....',
        '...o+o....',
        '...o+o....',
        '...o+o....',
        '...o+oo...',
        '...o+oo...',
        '...ooooo..',
        '..........',
    ],
    fire: [
        '..........',
        '....oo....',
        '...oooo...',
        '...o+oo...',
        '..oo+ooo..',
        '..oo+ooo..',
        '..oooooo..',
        '...oooo...',
        '....oo....',
        '..........',
    ],
    damage: [
        '..........',
        '....o.....',
        '.o..o..o..',
        '..o.o.o...',
        '...ooo....',
        '..oo+oo...',
        '...ooo....',
        '..o.o.o...',
        '.o..o..o..',
        '....o.....',
    ],
    range: [
        '..........',
        '..........',
        '...o......',
        '....o.....',
        'oooooooo..',
        '....o.....',
        '...o......',
        '..........',
        '..........',
        '..........',
    ],
    shotSpeed: [
        '..........',
        '..........',
        '..o..o....',
        '...o..o...',
        '....o..o..',
        '...o..o...',
        '..o..o....',
        '..........',
        '..........',
        '..........',
    ],
    luck: [
        '..........',
        '....o.....',
        '...o+o....',
        '..o+o+o...',
        '.o+o+o+o..',
        '..o+o+o...',
        '...o+o....',
        '....o.....',
        '..........',
        '..........',
    ],
};

const STAT_ROWS: ReadonlyArray<{ id: string; label: string; color: number }> = [
    { id: 'speed', label: '速度', color: 0xc8b088 },
    { id: 'fire', label: '射速', color: 0x9ad8f0 },
    { id: 'damage', label: '伤害', color: 0xd86a50 },
    { id: 'range', label: '射程', color: 0xe8d2a8 },
    { id: 'shotSpeed', label: '弹速', color: 0x9ac8e8 },
    { id: 'luck', label: '幸运', color: 0x8fc46a },
];

function floorLabel(level: number): string {
    const sector = FLOOR_SECTORS[Math.min(FLOOR_SECTORS.length - 1, Math.floor((level - 1) / 3))];
    return `${sector} · B${level}`;
}

function formatClock(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60);
    return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const MAP_PAD = 6;

const FILL: Record<RoomType, number> = {
    start: 0x3a464e,
    normal: 0x3a2b1e,
    boss: 0x4a1512,
    treasure: 0x4a3a16,
    shop: 0x162a36,
};

const EDGE: Record<RoomType, number> = {
    start: 0x7a9aa8,
    normal: 0x9a8258,
    boss: 0xc8443c,
    treasure: 0xe0b050,
    shop: 0x4a8aa8,
};

const ICON_FOR: Partial<Record<RoomType, readonly string[]>> = {
    boss: ['.###.', '#####', '#.#.#', '#####', '.#.#.'],
    treasure: ['..#..', '.###.', '#####', '.###.', '..#..'],
    shop: ['..#..', '.###.', '#####', '#.#.#', '.###.'],
};

const ICON_COLOR: Partial<Record<RoomType, number>> = {
    boss: 0xe8786a,
    treasure: 0xffd97a,
    shop: 0x9ed0ff,
};

export interface SettlementStats {
    kills: number;
    items: string[];
    seconds: number;
    level: number;
    rooms: number;
    totalRooms: number;
    bosses: number;
}

export interface SettlementHandlers {
    onRestart: () => void;
    onMenu: () => void;
}

/** Hooks the debug panel uses to mutate the running game. */
export interface GmCallbacks {
    canOpen: () => boolean;
    getLevel: () => number;
    getMaxLevel: () => number;
    setLevel: (level: number) => void;
    addItem: (item: ItemDef) => void;
    addAllItems: () => number;
    removeItem: (id: string) => void;
    hasItem: (id: string) => boolean;
    isInvincible: () => boolean;
    toggleInvincible: () => boolean;
    jumpToBoss: () => void;
    onOpen: () => void;
    onClose: () => void;
}

export class Hud {
    private readonly hearts: Phaser.GameObjects.Image[] = [];
    private readonly floorText: Phaser.GameObjects.Text;
    private readonly killCount: Phaser.GameObjects.Text;
    private readonly coinCount: Phaser.GameObjects.Text;
    private readonly bombCount: Phaser.GameObjects.Text;
    private readonly keyCount: Phaser.GameObjects.Text;
    private readonly timeText: Phaser.GameObjects.Text;
    private readonly gmButton: Phaser.GameObjects.Text;
    private readonly gmLayer: Phaser.GameObjects.Container;
    private gmCallbacks?: GmCallbacks;
    private gmPage = 0;
    private gmOpen = false;
    private gmStatus?: Phaser.GameObjects.Text;
    private readonly statsPanel: Phaser.GameObjects.Container;
    private readonly statValues: Phaser.GameObjects.Text[] = [];
    private readonly audioText: Phaser.GameObjects.Text;
    private readonly clearText: Phaser.GameObjects.Text;
    private readonly map: Phaser.GameObjects.Graphics;
    private readonly deathLayer: Phaser.GameObjects.Container;
    private readonly victoryLayer: Phaser.GameObjects.Container;
    private readonly itemPlate: Phaser.GameObjects.Graphics;
    private readonly barPlate: Phaser.GameObjects.Graphics;
    private readonly itemIcons: Phaser.GameObjects.Image[] = [];
    private readonly barIcons: Phaser.GameObjects.Image[] = [];
    private readonly parts: Phaser.GameObjects.GameObject[] = [];
    private itemTip?: Phaser.GameObjects.Text;
    private toast?: Phaser.GameObjects.Text;
    private continueHint?: Phaser.GameObjects.Text;
    private bossName?: Phaser.GameObjects.Text;
    private bossBar?: Phaser.GameObjects.Graphics;

    private mapRooms: MapRoom[] = [];
    private mapCurrent: { gx: number; gy: number } | null = null;
    private readonly pinned: Array<{
        obj: Phaser.GameObjects.GameObject;
        bx: number;
        by: number;
    }> = [];
    private visibilityBeforeHide: Array<{
        obj: Phaser.GameObjects.GameObject;
        visible: boolean;
    }> | null = null;

    constructor(private readonly scene: Phaser.Scene) {
        this.barPlate = scene.add.graphics().setDepth(99);
        this.ensureHearts(PLAYER.maxHp / 2);
        this.ensureBarIcons();

        this.floorText = scene.add
            .text(GAME_W / 2, 3, floorLabel(1), {
                fontFamily: 'Consolas, Microsoft YaHei, monospace',
                fontSize: '11px',
                fontStyle: 'bold',
                color: '#e8d2a8',
            })
            .setOrigin(0.5, 0)
            .setDepth(100)
            .setResolution(2);

        // Counters sit on one tight row; hearts live directly below it.
        this.coinCount = this.counterText(24, 11, '0');
        this.killCount = this.counterText(76, 11, '0');
        this.bombCount = this.counterText(128, 11, '0');
        this.keyCount = this.counterText(178, 11, '0');

        this.audioText = scene.add
            .text(GAME_W - 10, 352, '', {
                fontFamily: 'Consolas, monospace',
                fontSize: '8px',
                color: '#8a7054',
            })
            .setOrigin(1, 1)
            .setDepth(100)
            .setResolution(2);

        this.map = scene.add.graphics().setDepth(100);

        this.itemPlate = scene.add.graphics().setDepth(100);

        this.clearText = scene.add
            .text(GAME_W / 2, 60, 'ROOM CLEAR', {
                fontFamily: 'Consolas, monospace',
                fontSize: '10px',
                color: '#f0cf7a',
            })
            .setOrigin(0.5)
            .setDepth(100)
            .setAlpha(0)
            .setResolution(2);

        this.timeText = scene.add
            .text(16, 38, '时间：00:00', {
                fontFamily: 'Consolas, Microsoft YaHei, monospace',
                fontSize: '9px',
                color: '#c8b088',
            })
            .setOrigin(0, 0)
            .setDepth(100)
            .setResolution(2);

        this.gmLayer = scene.add.container(0, 0).setDepth(150).setVisible(false);
        this.gmButton = scene.add
            .text(GAME_W - 10, 338, 'GM', {
                fontFamily: 'Consolas, monospace',
                fontSize: '8px',
                color: '#c8a87c',
            })
            .setOrigin(1, 1)
            .setDepth(101)
            .setInteractive({ useHandCursor: true });
        this.gmButton.on('pointerover', () => this.gmButton.setColor('#e8c870'));
        this.gmButton.on('pointerout', () => this.gmButton.setColor('#c8a87c'));
        this.gmButton.on('pointerdown', () => this.openGm());

        this.deathLayer = scene.add.container(0, 0).setDepth(200).setVisible(false);
        this.victoryLayer = scene.add.container(0, 0).setDepth(200).setVisible(false);

        // Isaac-style stat column on the left, vertically centred, no plate.
        this.statsPanel = scene.add.container(0, 0).setDepth(100);
        STAT_ROWS.forEach((row, index) => {
            const y = 140 + index * 14;
            const icon = scene.add
                .image(
                    12,
                    y,
                    makePixelIcon(scene, `stat_${row.id}`, STAT_MASKS[row.id] ?? [], row.color)
                )
                .setScale(0.8);
            const label = scene.add
                .text(22, y, row.label, {
                    fontFamily: 'Microsoft YaHei, Consolas, monospace',
                    fontSize: '7px',
                    color: '#a89070',
                    shadow: { offsetX: 0, offsetY: 1, color: '#000000', blur: 2, fill: true },
                })
                .setOrigin(0, 0.5)
                .setResolution(2);
            const value = scene.add
                .text(40, y, '—', {
                    fontFamily: 'Consolas, Microsoft YaHei, monospace',
                    fontSize: '9px',
                    fontStyle: 'bold',
                    color: '#ecd6a8',
                    shadow: { offsetX: 0, offsetY: 1, color: '#000000', blur: 2, fill: true },
                })
                .setOrigin(0, 0.5)
                .setResolution(2);
            this.statsPanel.add([icon, label, value]);
            this.statValues.push(value);
        });
        this.setStats(BASE_STATS);

        this.parts.push(
            ...this.hearts,
            this.floorText,
            this.killCount,
            this.coinCount,
            this.bombCount,
            this.keyCount,
            this.timeText,
            this.statsPanel,
            this.gmButton,
            this.gmLayer,
            this.audioText,
            this.clearText,
            this.map,
            this.itemPlate,
            this.barPlate,
            ...this.barIcons
        );

        for (const part of this.parts) {
            this.pin(part);
        }
        this.pin(this.deathLayer);
        this.pin(this.victoryLayer);
        this.pin(this.gmLayer);

        for (const child of scene.children.list) {
            if ((child as { type?: string }).type === 'Text') {
                crispText(child as Phaser.GameObjects.Text);
            }
        }
        crispContainer(this.deathLayer);
        crispContainer(this.victoryLayer);
    }

    /** Screen-space UI: the door transition slides the world, not the HUD. */
    shift(dx: number, dy: number): void {
        for (const entry of this.pinned) {
            const transform = entry.obj as unknown as { x: number; y: number };
            transform.x = entry.bx + dx;
            transform.y = entry.by + dy;
        }
    }

    /** Hides the HUD while the transition snapshot is captured. */
    setVisible(visible: boolean): void {
        if (!visible) {
            this.visibilityBeforeHide = [];
            const objects: Array<Phaser.GameObjects.GameObject | undefined> = [
                ...this.parts,
                ...this.itemIcons,
                this.itemTip,
                this.toast,
                this.continueHint,
            ];
            for (const obj of objects) {
                if (!obj) {
                    continue;
                }
                const view = obj as unknown as { visible: boolean; setVisible: (v: boolean) => void };
                this.visibilityBeforeHide.push({ obj, visible: view.visible });
                view.setVisible(false);
            }
            return;
        }
        if (!this.visibilityBeforeHide) {
            return;
        }
        for (const entry of this.visibilityBeforeHide) {
            (entry.obj as unknown as { setVisible: (v: boolean) => void }).setVisible(entry.visible);
        }
        this.visibilityBeforeHide = null;
    }

    private pin(obj: Phaser.GameObjects.GameObject | undefined): void {
        if (!obj || this.pinned.some((entry) => entry.obj === obj)) {
            return;
        }
        const transform = obj as unknown as { x?: number; y?: number };
        this.pinned.push({ obj, bx: transform.x ?? 0, by: transform.y ?? 0 });
    }

    private unpin(obj: Phaser.GameObjects.GameObject): void {
        const index = this.pinned.findIndex((entry) => entry.obj === obj);
        if (index >= 0) {
            this.pinned.splice(index, 1);
        }
    }

    private counterText(x: number, y: number, value: string): Phaser.GameObjects.Text {
        return this.scene.add
            .text(x, y, value, {
                fontFamily: 'Consolas, monospace',
                fontSize: '10px',
                color: '#e8d8b8',
            })
            .setOrigin(0, 0.5)
            .setDepth(100)
            .setResolution(2);
    }

    update(hp: number, kills: number, maxHp: number): void {
        this.ensureHearts(Math.ceil(maxHp / 2));
        for (let i = 0; i < this.hearts.length; i += 1) {
            const remaining = hp - i * 2;
            const key =
                remaining >= 2 ? TEX.heartFull : remaining >= 1 ? TEX.heartHalf : TEX.heartEmpty;
            this.hearts[i].setTexture(key);
        }
        this.killCount.setText(String(kills));
    }

    setCoins(coins: number): void {
        this.coinCount.setText(String(coins));
    }

    setConsumables(bombs: number, keys: number): void {
        this.bombCount.setText(String(bombs));
        this.keyCount.setText(String(keys));
    }

    setAudio(muted: boolean, volume: number): void {
        this.audioText.setText(muted ? 'MUTE' : `VOL ${Math.round(volume * 100)}%`);
    }

    setTime(seconds: number): void {
        this.timeText.setText(`时间：${formatClock(seconds)}`);
    }

    /** Refreshes the left-hand stat column. */
    setStats(stats: Readonly<Stats>): void {
        const values = [
            String(Math.round(stats.speed)),
            stats.fireRate.toFixed(2),
            stats.damage.toFixed(1),
            stats.range.toFixed(0),
            stats.shotSpeed.toFixed(0),
            stats.luck.toFixed(1),
        ];
        values.forEach((value, index) => this.statValues[index]?.setText(value));
    }

    setGmCallbacks(callbacks: GmCallbacks): void {
        this.gmCallbacks = callbacks;
    }

    isGmOpen(): boolean {
        return this.gmOpen;
    }

    private openGm(): void {
        if (this.gmOpen || !this.gmCallbacks || !this.gmCallbacks.canOpen()) {
            return;
        }
        this.gmOpen = true;
        this.gmPage = 0;
        this.buildGmPanel();
        this.gmLayer.setVisible(true);
        this.gmCallbacks.onOpen();
    }

    closeGm(): void {
        if (!this.gmOpen) {
            return;
        }
        this.gmOpen = false;
        this.gmLayer.setVisible(false);
        this.gmCallbacks?.onClose();
    }

    private gmText(x: number, y: number, text: string, size: string, color: string): Phaser.GameObjects.Text {
        return this.scene.add
            .text(x, y, text, {
                fontFamily: 'Microsoft YaHei, Consolas, monospace',
                fontSize: size,
                color,
            })
            .setResolution(2);
    }

    private buildGmPanel(): void {
        this.gmLayer.removeAll(true);
        const scene = this.scene;
        const level = this.gmCallbacks?.getLevel() ?? 1;
        const maxLevel = this.gmCallbacks?.getMaxLevel() ?? 15;
        const children: Phaser.GameObjects.GameObject[] = [];
        children.push(
            scene.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.97).setOrigin(0)
        );
        children.push(this.gmText(20, 10, 'GM 调试', '12px', '#e8c870'));
        children.push(this.gmText(20, 54, '点击道具直接加入背包；切换楼层会重新生成该层', '7px', '#8a7054'));
        const close = this.gmText(GAME_W - 14, 8, '×', '16px', '#c8a87c')
            .setOrigin(1, 0)
            .setInteractive({ useHandCursor: true });
        close.on('pointerdown', () => this.closeGm());
        children.push(close);

        children.push(this.gmText(20, 31, '楼层', '8px', '#a89070'));
        for (let n = 1; n <= maxLevel; n += 1) {
            const cx = 92 + (n - 1) * 34;
            const active = n === level;
            children.push(
                scene.add
                    .rectangle(cx, 36, 30, 16, active ? 0x4a2e18 : 0x120c08, 0.92)
                    .setStrokeStyle(1, active ? 0xc49352 : 0x3a2a1c, 0.9)
            );
            children.push(
                this.gmText(cx, 36, `B${n}`, '7px', active ? '#f0d08a' : '#b8a084').setOrigin(0.5)
            );
            const hit = scene.add
                .rectangle(cx, 36, 30, 16, 0xffffff, 0.001)
                .setInteractive({ useHandCursor: true });
            hit.on('pointerdown', () => {
                this.gmCallbacks?.setLevel(n);
                this.buildGmPanel();
            });
            children.push(hit);
        }

        const perPage = 35;
        const totalPages = Math.max(1, Math.ceil(ITEMS.length / perPage));
        this.gmPage = Math.max(0, Math.min(totalPages - 1, this.gmPage));
        const invincible = this.gmCallbacks?.isInvincible() ?? false;
        children.push(
            scene.add
                .rectangle(356, 54, 104, 16, invincible ? 0x1f3a18 : 0x120c08, 0.95)
                .setStrokeStyle(1, invincible ? 0x6a9a4c : 0x3a2a1c, 0.9)
        );
        children.push(
            this.gmText(356, 54, `无敌：${invincible ? '开' : '关'}`, '8px', invincible ? '#a8e080' : '#b8a084').setOrigin(0.5)
        );
        const invHit = scene.add
            .rectangle(356, 54, 104, 16, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });
        invHit.on('pointerdown', () => {
            const on = this.gmCallbacks?.toggleInvincible() ?? false;
            this.buildGmPanel();
            this.gmStatus?.setText(on ? '无敌：开' : '无敌：关');
        });
        children.push(invHit);

        children.push(
            scene.add
                .rectangle(470, 54, 104, 16, 0x120c08, 0.95)
                .setStrokeStyle(1, 0x8a3a2c, 0.9)
        );
        children.push(this.gmText(470, 54, '跳到 Boss', '8px', '#ff9a7a').setOrigin(0.5));
        const bossHit = scene.add
            .rectangle(470, 54, 104, 16, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });
        bossHit.on('pointerdown', () => {
            this.closeGm();
            this.gmCallbacks?.jumpToBoss();
        });
        children.push(bossHit);

        children.push(this.gmText(20, 62, `道具（${ITEMS.length}）`, '8px', '#a89070'));
        const all = this.gmText(GAME_W - 24, 62, '全部加', '8px', '#e8c870')
            .setOrigin(1, 0)
            .setInteractive({ useHandCursor: true });
        all.on('pointerdown', () => {
            const added = this.gmCallbacks?.addAllItems() ?? 0;
            this.buildGmPanel();
            this.gmStatus?.setText(added > 0 ? '已全部加入' : '已全部拥有');
        });
        children.push(all);

        const cells = scene.add.graphics();
        children.push(cells);
        const start = this.gmPage * perPage;
        for (let i = 0; i < perPage; i += 1) {
            const item = ITEMS[start + i];
            if (!item) {
                break;
            }
            const owned = this.gmCallbacks?.hasItem(item.id) ?? false;
            const col = i % 5;
            const row = Math.floor(i / 5);
            const cx = 16 + col * 122;
            const cy = 76 + row * 36;
            cells.fillStyle(owned ? 0x14200f : 0x17100b, 0.92);
            cells.fillRoundedRect(cx, cy, 118, 32, 3);
            cells.lineStyle(1, owned ? 0x3f5a2c : 0x3a2a1c, 0.85);
            cells.strokeRoundedRect(cx + 0.5, cy + 0.5, 117, 31, 3);
            children.push(
                scene.add
                    .image(cx + 9, cy + 16, itemIconKey(scene, item))
                    .setScale(0.9)
                    .setAlpha(owned ? 0.35 : 1)
            );
            children.push(
                this.gmText(cx + 20, cy + 5, item.name, '8px', owned ? '#7a6a54' : '#e8d2a8')
            );
            children.push(this.gmText(cx + 20, cy + 17, item.tag, '6px', '#8a7054'));
            if (owned) {
                children.push(
                    this.gmText(cx + 108, cy + 4, '✓', '10px', '#8fc46a').setOrigin(1, 0)
                );
            }
            const hit = scene.add
                .rectangle(cx + 59, cy + 16, 118, 32, 0xffffff, 0.001)
                .setInteractive({ useHandCursor: true });
            hit.on('pointerdown', () => {
                if (this.gmCallbacks?.hasItem(item.id)) {
                    this.gmCallbacks.removeItem(item.id);
                    this.buildGmPanel();
                    this.gmStatus?.setText(`已移除 ${item.name}`);
                    return;
                }
                this.gmCallbacks?.addItem(item);
                this.buildGmPanel();
                this.gmStatus?.setText(`已加入 ${item.name}`);
            });
            children.push(hit);
        }

        const status = this.gmText(16, 330, '', '8px', '#8fc46a');
        this.gmStatus = status;
        children.push(status);
        const prev = this.gmText(250, 330, '◀', '10px', this.gmPage > 0 ? '#c8a87c' : '#4a3a2c');
        prev.setInteractive({ useHandCursor: true });
        prev.on('pointerdown', () => {
            if (this.gmPage > 0) {
                this.gmPage -= 1;
                this.buildGmPanel();
            }
        });
        const pageLabel = this.gmText(
            320,
            330,
            `${this.gmPage + 1} / ${totalPages}`,
            '8px',
            '#a89070'
        ).setOrigin(0.5, 0);
        const next = this.gmText(390, 330, '▶', '10px', this.gmPage < totalPages - 1 ? '#c8a87c' : '#4a3a2c');
        next.setInteractive({ useHandCursor: true });
        next.on('pointerdown', () => {
            if (this.gmPage < totalPages - 1) {
                this.gmPage += 1;
                this.buildGmPanel();
            }
        });
        children.push(prev, pageLabel, next);
        this.gmLayer.add(children);
        crispContainer(this.gmLayer);
    }

    showVictory(stats: SettlementStats, handlers: SettlementHandlers): void {
        this.showSettlement(this.victoryLayer, {
            title: 'ESCAPED',
            color: '#e8c870',
            subtitle: '你走出了煤与泪',
            restartLabel: '再来一局',
            stats,
            handlers,
        });
    }

    private showSettlement(
        layer: Phaser.GameObjects.Container,
        opts: {
            title: string;
            color: string;
            subtitle: string;
            restartLabel: string;
            stats: SettlementStats;
            handlers: SettlementHandlers;
        }
    ): void {
        layer.removeAll(true);
        layer.setVisible(true).setAlpha(0);

        const scene = this.scene;
        const shade = scene.add.rectangle(0, 0, GAME_W, GAME_H, 0x000000, 0.82).setOrigin(0);
        const title = scene.add
            .text(GAME_W / 2, 34, opts.title, {
                fontFamily: 'Consolas, monospace',
                fontSize: '27px',
                fontStyle: 'bold',
                color: opts.color,
            })
            .setOrigin(0.5);
        const subtitle = scene.add
            .text(GAME_W / 2, 60, opts.subtitle, {
                fontFamily: 'Microsoft YaHei, Consolas, monospace',
                fontSize: '10px',
                color: '#c8a87c',
            })
            .setOrigin(0.5);
        const boxes = scene.add.graphics();
        const entries: Array<[string, string]> = [
            ['击杀数', String(opts.stats.kills)],
            ['拾取道具', String(opts.stats.items.length)],
            ['存活时间', formatClock(opts.stats.seconds)],
            ['到达层数', `${opts.stats.level} / 15`],
            ['探索房间', `${opts.stats.rooms} / ${opts.stats.totalRooms}`],
            ['击败 BOSS', String(opts.stats.bosses)],
        ];
        const children: Phaser.GameObjects.GameObject[] = [shade, title, subtitle, boxes];
        entries.forEach(([label, value], index) => {
            const col = index % 3;
            const row = Math.floor(index / 3);
            const cx = 190 + col * 130;
            const cy = 96 + row * 46;
            boxes.fillStyle(0x1a120d, 0.92);
            boxes.fillRoundedRect(cx - 57, cy - 19, 114, 38, 4);
            boxes.lineStyle(1, 0x5a4630, 0.9);
            boxes.strokeRoundedRect(cx - 56.5, cy - 18.5, 113, 37, 4);
            children.push(
                scene.add
                    .text(cx, cy - 9, label, {
                        fontFamily: 'Microsoft YaHei, Consolas, monospace',
                        fontSize: '8px',
                        color: '#a89070',
                    })
                    .setOrigin(0.5),
                scene.add
                    .text(cx, cy + 7, value, {
                        fontFamily: 'Consolas, Microsoft YaHei, monospace',
                        fontSize: '13px',
                        fontStyle: 'bold',
                        color: '#f0d08a',
                    })
                    .setOrigin(0.5)
            );
        });
        const names = opts.stats.items.length
            ? opts.stats.items.slice(0, 8).join(' · ') +
              (opts.stats.items.length > 8 ? ' …' : '')
            : '无';
        children.push(
            scene.add
                .text(GAME_W / 2, 178, `道具（${opts.stats.items.length}）`, {
                    fontFamily: 'Microsoft YaHei, Consolas, monospace',
                    fontSize: '8px',
                    color: '#8a7054',
                })
                .setOrigin(0.5),
            scene.add
                .text(GAME_W / 2, 190, names, {
                    fontFamily: 'Microsoft YaHei, Consolas, monospace',
                    fontSize: '9px',
                    color: '#d8c8a8',
                    align: 'center',
                    lineSpacing: 3,
                    wordWrap: { width: 430 },
                })
                .setOrigin(0.5, 0)
        );
        children.push(...this.settlementButton(236, 246, 150, 30, opts.restartLabel, opts.handlers.onRestart, true));
        children.push(...this.settlementButton(404, 246, 150, 30, '返回主界面', opts.handlers.onMenu, false));
        layer.add(children);
        crispContainer(layer);
        this.scene.tweens.add({
            targets: layer,
            alpha: 1,
            duration: 260,
        });
    }

    private settlementButton(
        x: number,
        y: number,
        width: number,
        height: number,
        label: string,
        onClick: () => void,
        primary: boolean
    ): Phaser.GameObjects.GameObject[] {
        const scene = this.scene;
        const bg = scene.add.graphics().setPosition(x, y);
        bg.fillStyle(primary ? 0x402814 : 0x241812, 0.96);
        bg.fillRoundedRect(-width / 2, -height / 2, width, height, 5);
        bg.lineStyle(1, primary ? 0xc49352 : 0x6b4a2c, 0.9);
        bg.strokeRoundedRect(-width / 2 + 0.5, -height / 2 + 0.5, width - 1, height - 1, 5);
        const text = scene.add
            .text(x, y, label, {
                fontFamily: 'Microsoft YaHei, Consolas, monospace',
                fontSize: '11px',
                fontStyle: primary ? 'bold' : 'normal',
                color: primary ? '#f6e2b6' : '#e0d0b0',
            })
            .setOrigin(0.5);
        const hit = scene.add
            .rectangle(x, y, width, height, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: true });
        hit.on('pointerdown', onClick);
        return [bg, text, hit];
    }

    /** Persistent pickups get a real pixel icon, laid out above the bottom bar. */
    setItems(items: ReadonlyArray<ItemDef>): void {
        for (const icon of this.itemIcons) {
            this.unpin(icon);
            icon.destroy();
        }
        this.itemIcons.length = 0;
        this.itemPlate.clear();

        const startX = 14;
        const startY = 326;
        const stepX = 15;
        const stepY = 16;
        const perRow = 10;

        items.forEach((item, index) => {
            const col = index % perRow;
            const row = Math.floor(index / perRow);
            const x = startX + col * stepX;
            const y = startY - row * stepY;
            this.itemPlate.fillStyle(0x0b0806, 0.62);
            this.itemPlate.fillRect(x - 7, y - 7, 14, 14);
            this.itemPlate.lineStyle(1, 0x3a2a1c, 0.85);
            this.itemPlate.strokeRect(x - 6.5, y - 6.5, 13, 13);
            const icon = this.scene.add
                .image(x, y, itemIconKey(this.scene, item))
                .setDepth(101)
                .setInteractive({ useHandCursor: true });
            icon.on('pointerover', () => this.showItemTip(item));
            icon.on('pointerout', () => this.hideItemTip());
            this.itemIcons.push(icon);
            this.pin(icon);
        });
    }

    private showItemTip(item: ItemDef): void {
        if (!this.itemTip) {
            this.itemTip = crispText(
                this.scene.add
                    .text(GAME_W / 2, 282, '', {
                        fontFamily: 'Microsoft YaHei, Consolas, monospace',
                        fontSize: '10px',
                        color: '#f2dca6',
                        backgroundColor: 'rgba(20,14,10,0.9)',
                        padding: { x: 6, y: 3 },
                    })
                    .setOrigin(0.5, 1)
                    .setDepth(130)
            );
            this.pin(this.itemTip);
        }
        this.itemTip
            .setText(`${item.name} · ${item.desc}`)
            .setVisible(true);
    }

    private hideItemTip(): void {
        this.itemTip?.setVisible(false);
    }

    private ensureHearts(count: number): void {
        while (this.hearts.length < count) {
            const heart = this.scene.add
                .image(16, 27, TEX.heartEmpty)
                .setDepth(100)
                .setOrigin(0.5);
            this.hearts.push(heart);
            this.parts.push(heart);
        }
        for (let i = 0; i < this.hearts.length; i += 1) {
            const heart = this.hearts[i];
            heart.setPosition(16 + (i % 10) * 12, 27 + Math.floor(i / 10) * 12);
            heart.setVisible(i < count);
        }
        const rows = Math.max(1, Math.ceil(count / 10));
        this.timeText?.setY(27 + (rows - 1) * 12 + 11);
    }

    /** Top-left counter row: coin, skull, bomb, key on small ink plates. */
    private ensureBarIcons(): void {
        const scene = this.scene;
        const skull = [
            '..........',
            '..oooooo..',
            '.oooooooo.',
            '.oo=oo=oo.',
            '.oo=oo=oo.',
            '.oooooooo.',
            '..oooooo..',
            '..o.o.o...',
            '..oooooo..',
            '..........',
        ];
        const coin = [
            '..........',
            '...oooo...',
            '..oooooo..',
            '.oo+ooooo.',
            '.oo+ooooo.',
            '.oooooooo.',
            '..oooooo..',
            '...oooo...',
            '..........',
            '..........',
        ];
        const bomb = [
            '..........',
            '......x...',
            '.....xxx..',
            '...oooo...',
            '..oooooo..',
            '.o+oooooo.',
            '.o+oooooo.',
            '..oooooo..',
            '...oooo...',
            '..........',
        ];
        const key = [
            '..........',
            '..oooo....',
            '.oo..oo...',
            '.oo..oo...',
            '..oooo....',
            '....oo....',
            '.....oo...',
            '....oooo..',
            '.....oo...',
            '..........',
        ];
        makePixelIcon(scene, 'hud_skull', skull, 0xd6c8ac);
        makePixelIcon(scene, 'hud_coin', coin, 0xe0b040);
        makePixelIcon(scene, 'hud_bomb', bomb, 0x40342a, 0xffcf5a);
        makePixelIcon(scene, 'hud_key', key, 0xe0c060);

        const layout: Array<[string, number]> = [
            ['hud_coin', 14],
            ['hud_skull', 66],
            ['hud_bomb', 118],
            ['hud_key', 168],
        ];
        for (const [key2, x] of layout) {
            this.barPlate.fillStyle(0x0b0806, 0.55);
            this.barPlate.fillRect(x - 7, 4, 14, 14);
            this.barPlate.lineStyle(1, 0x2a1d12, 0.85);
            this.barPlate.strokeRect(x - 6.5, 4.5, 13, 13);
            const icon = scene.add.image(x, 11, key2).setDepth(100).setOrigin(0.5);
            this.barIcons.push(icon);
        }
    }

    setMap(
        rooms: MapRoom[],
        current: { gx: number; gy: number } | null,
        level: number
    ): void {
        this.mapRooms = rooms;
        this.mapCurrent = current;
        this.floorText.setText(floorLabel(level));
        this.drawMap();
    }

    flashClear(): void {
        this.clearText.setAlpha(1).setScale(0.9);
        this.scene.tweens.add({
            targets: this.clearText,
            alpha: 0,
            scale: 1.15,
            delay: 700,
            duration: 500,
            ease: 'Cubic.easeIn',
        });
    }

    /** Offers to resume one of the saved floor checkpoints. */
    showContinueHint(label: string, onClick: () => void): void {
        if (!this.continueHint) {
            this.continueHint = crispText(
                this.scene.add
                    .text(320, 330, '', {
                        fontFamily: 'Microsoft YaHei, Consolas, monospace',
                        fontSize: '9px',
                        color: '#e8d2a8',
                        backgroundColor: 'rgba(20,14,10,0.85)',
                        padding: { x: 6, y: 3 },
                    })
                    .setOrigin(0.5)
                    .setDepth(110)
                    .setInteractive({ useHandCursor: true })
            );
            this.pin(this.continueHint);
            this.continueHint.on('pointerdown', onClick);
            this.parts.push(this.continueHint);
        }
        this.continueHint
            .setText(`有存档 ${label} · C 继续 / 1-3 选槽 / 点这里`)
            .setVisible(true);
    }

    hideContinueHint(): void {
        this.continueHint?.setVisible(false);
    }

    showToast(message: string, duration = 1400): void {
        if (!this.toast) {
            this.toast = crispText(
                this.scene.add
                    .text(320, 298, '', {
                        fontFamily: 'Consolas, Microsoft YaHei, monospace',
                        fontSize: '10px',
                        color: '#f2dca6',
                        backgroundColor: 'rgba(20,14,10,0.85)',
                        padding: { x: 6, y: 3 },
                    })
                    .setOrigin(0.5)
                    .setDepth(120)
            );
            this.pin(this.toast);
        }
        this.toast.setText(message).setAlpha(1);
        this.scene.tweens.killTweensOf(this.toast);
        this.scene.tweens.add({
            targets: this.toast,
            alpha: 0,
            delay: duration,
            duration: 400,
            ease: 'Cubic.easeIn',
        });
    }

    /** Boss name plate + health bar, centred above the bottom bar. */
    setBoss(name: string, hp: number, maxHp: number): void {
        if (!this.bossName || !this.bossBar) {
            this.bossName = crispText(
                this.scene.add
                    .text(GAME_W / 2, 306, '', {
                        fontFamily: 'Consolas, Microsoft YaHei, monospace',
                        fontSize: '9px',
                        color: '#e8a888',
                    })
                    .setOrigin(0.5, 0)
                    .setDepth(100)
            );
            this.pin(this.bossName);
            this.bossBar = this.scene.add.graphics().setDepth(100);
            this.pin(this.bossBar);
            this.parts.push(this.bossName, this.bossBar);
        }
        const label = this.bossName;
        const bar = this.bossBar;
        label.setText(name).setVisible(true);
        bar.setVisible(true).clear();
        bar.fillStyle(0x1a100c, 0.9);
        bar.fillRect(220, 320, 200, 6);
        bar.fillStyle(0xb04838, 1);
        bar.fillRect(221, 321, Math.max(0, Math.round(198 * (hp / maxHp))), 4);
    }

    clearBoss(): void {
        this.bossName?.setVisible(false);
        this.bossBar?.setVisible(false);
    }

    showDeath(stats: SettlementStats, handlers: SettlementHandlers): void {
        this.showSettlement(this.deathLayer, {
            title: 'YOU DIED',
            color: '#d85040',
            subtitle: '煤灰落定，你没能走出这里',
            restartLabel: '再来一次',
            stats,
            handlers,
        });
    }

    destroy(): void {
        this.deathLayer.destroy(true);
        this.victoryLayer.destroy(true);
        this.toast?.destroy();
        this.itemTip?.destroy();
        for (const icon of this.itemIcons) {
            icon.destroy();
        }
        for (const part of this.parts) {
            part.destroy();
        }
    }

    private drawMap(): void {
        this.map.clear();
        if (this.mapRooms.length === 0) {
            return;
        }

        // Trim the map to the cells this floor actually uses instead of always
        // reserving the full 9x8 dungeon grid.
        let minGx = Infinity;
        let minGy = Infinity;
        let maxGx = -Infinity;
        let maxGy = -Infinity;
        for (const room of this.mapRooms) {
            minGx = Math.min(minGx, room.gx);
            maxGx = Math.max(maxGx, room.gx);
            minGy = Math.min(minGy, room.gy);
            maxGy = Math.max(maxGy, room.gy);
        }
        const spanX = maxGx - minGx + 1;
        const spanY = maxGy - minGy + 1;
        // Bigger cells when the floor is compact; shrink once the map sprawls so
        // it never eats into the playfield.
        const span = Math.max(spanX, spanY);
        const cellW = span >= 7 ? 9 : span >= 5 ? 10 : 12;
        const cellH = Math.round(cellW * 0.75);
        const gap = cellW >= 12 ? 3 : 2;
        const innerW = spanX * cellW + (spanX - 1) * gap;
        const innerH = spanY * cellH + (spanY - 1) * gap;
        const w = innerW + MAP_PAD * 2;
        const h = innerH + MAP_PAD * 2;
        const x0 = GAME_W - 10 - w;
        const y0 = 8;

        this.map.fillStyle(0x0b0806, 0.7);
        this.map.fillRoundedRect(x0, y0, w, h, 5);
        this.map.lineStyle(1, 0x6b4a2c, 0.95);
        this.map.strokeRoundedRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1, 5);
        this.map.lineStyle(1, 0x2a1d12, 0.9);
        this.map.strokeRoundedRect(x0 + 2.5, y0 + 2.5, w - 5, h - 5, 4);

        const cellX = (gx: number) => x0 + MAP_PAD + (gx - minGx) * (cellW + gap);
        const cellY = (gy: number) => y0 + MAP_PAD + (gy - minGy) * (cellH + gap);

        const seenAt = new Map<string, MapRoom>();
        for (const room of this.mapRooms) {
            if (room.seen) {
                seenAt.set(`${room.gx},${room.gy}`, room);
            }
        }
        const dirStep: Record<Dir, [number, number]> = {
            up: [0, -1],
            down: [0, 1],
            left: [-1, 0],
            right: [1, 0],
        };

        // Connections first so the room cells sit on top of them.
        this.map.lineStyle(1, 0xa88a5c, 0.7);
        for (const room of this.mapRooms) {
            if (!room.seen || !room.doors) {
                continue;
            }
            for (const dir of room.doors) {
                const [dx, dy] = dirStep[dir];
                if (!seenAt.has(`${room.gx + dx},${room.gy + dy}`)) {
                    continue;
                }
                const cx = cellX(room.gx) + cellW / 2;
                const cy = cellY(room.gy) + cellH / 2;
                this.map.lineBetween(
                    cx + (dx * cellW) / 2,
                    cy + (dy * cellH) / 2,
                    cx + dx * (cellW / 2 + gap),
                    cy + dy * (cellH / 2 + gap)
                );
            }
        }

        for (const room of this.mapRooms) {
            if (!room.seen) {
                continue;
            }
            const x = cellX(room.gx);
            const y = cellY(room.gy);
            const isCurrent =
                this.mapCurrent !== null &&
                this.mapCurrent.gx === room.gx &&
                this.mapCurrent.gy === room.gy;
            const visited = room.cleared || room.type !== 'normal' || isCurrent;

            this.map.fillStyle(FILL[room.type], visited ? 0.95 : 0.72);
            this.map.fillRect(x, y, cellW, cellH);
            this.map.lineStyle(1, EDGE[room.type], visited ? 0.95 : 0.6);
            this.map.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH - 1);

            const glyph = ICON_FOR[room.type];
            const color = ICON_COLOR[room.type];
            const glyphX = x + Math.floor((cellW - 5) / 2);
            const glyphY = y + Math.floor((cellH - 5) / 2);
            if (glyph && color !== undefined) {
                this.drawGlyph(glyph, glyphX, glyphY, color);
            } else if (visited) {
                const dot = Math.max(3, Math.round(cellW * 0.3));
                this.map.fillStyle(room.cleared ? 0xd8c8a0 : 0xb05040, 0.9);
                this.map.fillRect(
                    x + Math.floor((cellW - dot) / 2),
                    y + Math.floor((cellH - dot) / 2),
                    dot,
                    dot
                );
            }

            if (isCurrent) {
                this.map.lineStyle(1, 0xf6ecd2, 1);
                this.map.strokeRect(x - 1.5, y - 1.5, cellW + 3, cellH + 3);
            }
        }
    }

    private drawGlyph(rows: readonly string[], x: number, y: number, color: number): void {
        this.map.fillStyle(color, 1);
        rows.forEach((row, ry) => {
            for (let rx = 0; rx < row.length; rx += 1) {
                if (row[rx] === '#') {
                    this.map.fillRect(x + rx, y + ry, 1, 1);
                }
            }
        });
    }
}
