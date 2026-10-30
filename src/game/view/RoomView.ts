import type * as Phaser from 'phaser';
import type { Dir, RoomType } from '../types';
import {
    PLAY_BOTTOM,
    PLAY_RIGHT,
    PLAY_X,
    PLAY_Y,
    ROOM_CX,
    ROOM_CY,
    ROOM_H,
    ROOM_W,
    ROOM_X,
    ROOM_Y,
    TEX,
    WALL,
} from '../const';
import type { RoomDef } from '../core/Dungeon';
import { itemById } from '../core/items';
import { itemIconKey } from './itemIcon';
import { actorDepth } from './depth';
import { floorTheme } from './themes';

export interface DoorTarget {
    type: RoomType;
    cleared: boolean;
}

interface DoorSprite {
    image: Phaser.GameObjects.Image;
    block: Phaser.GameObjects.Rectangle;
}

const DOOR_TINT: Partial<Record<RoomType, number>> = {
    boss: 0xff8a74,
    treasure: 0xffd27a,
    shop: 0x9ed0ff,
};

const FLOOR_TINT: Partial<Record<RoomType, number>> = {
    boss: 0xffc3ae,
    treasure: 0xffeec0,
    shop: 0xbfd8ee,
};

const ICON_COLOR: Partial<Record<RoomType, number>> = {
    boss: 0xff9a86,
    treasure: 0xffd97a,
    shop: 0x9ed0ff,
};

/** 7x7 pixel glyphs used as door markers. */
const ICONS: Partial<Record<RoomType, readonly string[]>> = {
    treasure: [
        '...#...',
        '..###..',
        '#######',
        '.#####.',
        '..###..',
        '.##.##.',
        '.#...#.',
    ],
    shop: [
        '..###..',
        '.#...#.',
        '.#.....',
        '..###..',
        '.....#.',
        '.#...#.',
        '..###..',
    ],
    boss: [
        '.#####.',
        '#######',
        '##.#.##',
        '##.#.##',
        '#######',
        '.#.#.#.',
        '..###..',
    ],
};

/** Static room shell for one room: floor, walls, doors, torches, obstacles. */
export class RoomView {
    readonly solids: Phaser.GameObjects.GameObject[] = [];
    /** Pits block walking but not tears, so they get their own body list. */
    readonly pits: Phaser.GameObjects.GameObject[] = [];
    readonly spikes: Array<{ x: number; y: number }> = [];
    readonly shelves: Array<{ x: number; y: number; price: number }> = [];
    /** Where the treasure item sits; undefined once looted. */
    itemPoint?: { x: number; y: number };
    /** Where the chest sits; undefined once opened. */
    chestPoint?: { x: number; y: number };

    private readonly objects: Phaser.GameObjects.GameObject[] = [];
    private readonly doors = new Map<Dir, DoorSprite>();
    private readonly tweens: Phaser.Tweens.Tween[] = [];
    private itemNodes: Phaser.GameObjects.GameObject[] = [];
    private bobTween?: Phaser.Tweens.Tween;
    private shelfArt: Array<{
        glyph: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image;
        price: Phaser.GameObjects.Text;
    }> = [];
    private chestArt: Phaser.GameObjects.GameObject[] = [];
    private chestLid?: Phaser.GameObjects.Graphics;

    constructor(
        private readonly scene: Phaser.Scene,
        readonly room: RoomDef,
        targets: Partial<Record<Dir, DoorTarget>>,
        private readonly level = 1
    ) {
        this.buildFloor();
        this.buildWalls();
        for (const dir of room.doors) {
            const target = targets[dir];
            if (target) {
                this.buildDoor(dir, target);
            }
        }
        this.buildTorches();
        this.buildObstacles();
        this.addAsh();
        if (room.type === 'treasure') {
            this.buildTreasurePedestal(!room.itemTaken);
        } else if (room.type === 'shop') {
            this.buildShop();
        }
        if (room.chest && !room.chest.opened) {
            this.buildChest(room.chest.kind);
        }
    }

    /** Slow motes of soot so every room feels alive. */
    private addAsh(): void {
        for (let i = 0; i < 7; i += 1) {
            const x = PLAY_X + 10 + Math.random() * (PLAY_RIGHT - PLAY_X - 20);
            const y = PLAY_Y + 20 + Math.random() * (PLAY_BOTTOM - PLAY_Y - 40);
            const mote = this.track(
                this.scene.add
                    .image(x, y, TEX.glow)
                    .setDepth(9)
                    .setBlendMode('ADD')
                    .setTint(floorTheme(this.level).ash)
                    .setScale(0.1)
                    .setAlpha(0.09)
            );
            this.tweens.push(
                this.scene.tweens.add({
                    targets: mote,
                    y: y - 22 - Math.random() * 18,
                    alpha: { from: 0.09, to: 0 },
                    duration: 3200 + Math.random() * 2600,
                    delay: Math.random() * 2600,
                    repeat: -1,
                    onRepeat: () => {
                        mote.x = x;
                        mote.y = y;
                        mote.alpha = 0.09;
                    },
                })
            );
        }
    }

    setDoorsOpen(open: boolean): void {
        for (const dir of this.doors.keys()) {
            this.setDoorOpen(dir, open);
        }
    }

    setDoorOpen(dir: Dir, open: boolean): void {
        const door = this.doors.get(dir);
        if (!door) {
            return;
        }
        door.image.setTexture(open ? TEX.doorOpen : TEX.doorClosed);
        const body = door.block.body as Phaser.Physics.Arcade.StaticBody | null;
        if (body) {
            body.enable = !open;
        }
    }

    destroy(): void {
        for (const tween of this.tweens) {
            tween.stop();
        }
        this.tweens.length = 0;
        this.bobTween = undefined;
        this.itemNodes = [];
        this.itemPoint = undefined;
        this.shelves.length = 0;
        this.shelfArt = [];
        this.chestArt = [];
        this.chestPoint = undefined;
        for (const object of this.objects) {
            object.destroy();
        }
        this.objects.length = 0;
        this.solids.length = 0;
        this.pits.length = 0;
        this.spikes.length = 0;
        this.doors.clear();
    }

    private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
        this.objects.push(object);
        return object;
    }

    private buildFloor(): void {
        const floor = this.scene.add
            .image(PLAY_X, PLAY_Y, TEX.floorBaked)
            .setOrigin(0, 0)
            .setDepth(5);
        const special =
            this.room.type === 'treasure' || this.room.type === 'shop'
                ? FLOOR_TINT[this.room.type]
                : undefined;
        floor.setTint(special ?? floorTheme(this.level).floor);
        this.track(floor);
    }

    private buildWalls(): void {
        const doors = this.room.doors;
        const wallTint = floorTheme(this.level).wall;
        const addWallStrip = (x: number, y: number, w: number, h: number, key: string) => {
            this.track(
                this.scene.add
                    .tileSprite(x, y, w, h, key)
                    .setOrigin(0, 0)
                    .setDepth(8)
                    .setTint(wallTint)
            );
        };
        addWallStrip(ROOM_X, ROOM_Y, ROOM_W, WALL, TEX.wall);
        addWallStrip(ROOM_X, ROOM_Y + ROOM_H - WALL, ROOM_W, WALL, TEX.wall);
        addWallStrip(ROOM_X, ROOM_Y, WALL, ROOM_H, TEX.wallV);
        addWallStrip(ROOM_X + ROOM_W - WALL, ROOM_Y, WALL, ROOM_H, TEX.wallV);

        this.horizontalWall(ROOM_Y + WALL / 2, doors.includes('up'));
        this.horizontalWall(ROOM_Y + ROOM_H - WALL / 2, doors.includes('down'));
        this.verticalWall(ROOM_X + WALL / 2, doors.includes('left'));
        this.verticalWall(ROOM_X + ROOM_W - WALL / 2, doors.includes('right'));
    }

    private horizontalWall(centerY: number, hasDoor: boolean): void {
        if (!hasDoor) {
            this.addSolid(ROOM_X + ROOM_W / 2, centerY, ROOM_W, WALL);
            return;
        }
        const leftWidth = ROOM_CX - 24 - ROOM_X;
        const rightWidth = ROOM_X + ROOM_W - (ROOM_CX + 24);
        this.addSolid(ROOM_X + leftWidth / 2, centerY, leftWidth, WALL);
        this.addSolid(ROOM_X + ROOM_W - rightWidth / 2, centerY, rightWidth, WALL);
    }

    private verticalWall(centerX: number, hasDoor: boolean): void {
        if (!hasDoor) {
            this.addSolid(centerX, ROOM_Y + ROOM_H / 2, WALL, ROOM_H);
            return;
        }
        const topHeight = ROOM_CY - 24 - ROOM_Y;
        const bottomHeight = ROOM_Y + ROOM_H - (ROOM_CY + 24);
        this.addSolid(centerX, ROOM_Y + topHeight / 2, WALL, topHeight);
        this.addSolid(centerX, ROOM_Y + ROOM_H - bottomHeight / 2, WALL, bottomHeight);
    }

    private addSolid(
        x: number,
        y: number,
        width: number,
        height: number
    ): Phaser.GameObjects.Rectangle {
        const rect = this.scene.add.rectangle(x, y, width, height, 0xff0000, 0);
        this.scene.physics.add.existing(rect, true);
        this.solids.push(rect);
        this.objects.push(rect);
        return rect;
    }

    private doorCenter(dir: Dir): { x: number; y: number } {
        const x =
            dir === 'left'
                ? ROOM_X + WALL / 2
                : dir === 'right'
                  ? ROOM_X + ROOM_W - WALL / 2
                  : ROOM_CX;
        const y =
            dir === 'up'
                ? ROOM_Y + WALL / 2
                : dir === 'down'
                  ? ROOM_Y + ROOM_H - WALL / 2
                  : ROOM_CY;
        return { x, y };
    }

    private buildDoor(dir: Dir, target: DoorTarget): void {
        const { x, y } = this.doorCenter(dir);

        const image = this.scene.add.image(x, y, TEX.doorClosed).setDepth(9);
        if (dir === 'down') {
            image.setRotation(Math.PI);
        } else if (dir === 'left') {
            image.setRotation(Math.PI / 2);
        } else if (dir === 'right') {
            image.setRotation(-Math.PI / 2);
        }
        const tint = DOOR_TINT[target.type];
        if (tint) {
            image.setTint(tint);
        }
        this.track(image);

        const block =
            dir === 'up' || dir === 'down'
                ? this.addSolid(x, y, 48, WALL)
                : this.addSolid(x, y, WALL, 48);

        this.doors.set(dir, { image, block });
        this.buildDoorIcon(dir, target);
    }

    private buildDoorIcon(dir: Dir, target: DoorTarget): void {
        const rows = ICONS[target.type];
        const color = ICON_COLOR[target.type];
        if (!rows || color === undefined) {
            return;
        }
        const { x, y } = this.doorCenter(dir);

        const graphics = this.scene.add.graphics().setDepth(13).setAlpha(0.95);
        graphics.fillStyle(color, 1);
        rows.forEach((row, ry) => {
            for (let rx = 0; rx < row.length; rx += 1) {
                if (row[rx] === '#') {
                    graphics.fillRect(Math.round(x) + rx - 3, Math.round(y) + ry - 3, 1, 1);
                }
            }
        });
        this.track(graphics);
    }

    private buildTorches(): void {
        const torchTint = floorTheme(this.level).torch;
        for (const x of [150, 490]) {
            const glow = this.scene.add
                .image(x, ROOM_Y + 18, TEX.glow)
                .setDepth(7)
                .setBlendMode('ADD')
                .setAlpha(0.6)
                .setScale(1.6)
                .setTint(torchTint);
            const torch = this.scene.add
                .image(x, ROOM_Y + 14, TEX.torch)
                .setDepth(10)
                .setTint(torchTint);
            this.track(glow);
            this.track(torch);
            this.tweens.push(
                this.scene.tweens.add({
                    targets: glow,
                    alpha: 0.85,
                    scale: 1.75,
                    duration: 420 + Math.random() * 160,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut',
                }),
                this.scene.tweens.add({
                    targets: torch,
                    scaleY: 1.05,
                    duration: 280,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut',
                })
            );
        }
    }

    private drawPedestal(x: number, y: number): void {
        const stone = this.track(this.scene.add.graphics().setDepth(11));
        stone.fillStyle(0x241812, 1);
        stone.fillRect(x - 20, y + 4, 40, 8);
        stone.fillStyle(0x5a4630, 1);
        stone.fillRect(x - 15, y - 8, 30, 14);
        stone.fillStyle(0x7d6244, 1);
        stone.fillRect(x - 15, y - 10, 30, 3);
        stone.fillStyle(0x3a2a1c, 1);
        stone.fillRect(x - 15, y + 6, 30, 2);
    }

    private buildTreasurePedestal(withItem: boolean): void {
        const x = ROOM_CX;
        const y = ROOM_CY + 6;
        this.drawPedestal(x, y);
        if (!withItem) {
            return;
        }
        this.itemPoint = { x, y };
        const glow = this.track(
            this.scene.add
                .image(x, y - 26, TEX.glow)
                .setDepth(14)
                .setBlendMode('ADD')
                .setTint(0xff8a4a)
                .setAlpha(0.35)
                .setScale(1.05)
        );
        const shard = this.track(this.scene.add.graphics().setDepth(16));
        shard.fillStyle(itemById(this.room.itemId)?.color ?? 0xe07048, 1);
        shard.fillTriangle(x, y - 34, x - 7, y - 26, x, y - 16);
        shard.fillTriangle(x, y - 34, x + 7, y - 26, x, y - 16);
        shard.fillStyle(0xffd0a0, 1);
        shard.fillRect(x - 2, y - 30, 2, 5);

        this.itemNodes = [glow, shard];
        this.bobTween = this.scene.tweens.add({
            targets: [glow, shard],
            y: '-=5',
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
        this.tweens.push(this.bobTween);
    }

    private buildShop(): void {
        const stock = this.room.shopStock ?? [];
        stock.forEach((slot, index) => {
            const x = ROOM_CX + (index - 1) * 136;
            const y = ROOM_CY + 8;
            this.drawPedestal(x, y);
            this.shelves.push({ x, y, price: slot.price });
            if (slot.sold) {
                return;
            }
            const color =
                slot.kind === 'heart'
                    ? 0xd85040
                    : (itemById(slot.itemId)?.color ?? 0x8fc46a);
            let glyph: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image;
            if (slot.kind === 'heart') {
                const heart = this.track(this.scene.add.graphics().setDepth(16));
                heart.fillStyle(color, 1);
                heart.fillCircle(x - 3, y - 19, 3);
                heart.fillCircle(x + 3, y - 19, 3);
                heart.fillTriangle(x - 6, y - 17, x + 6, y - 17, x, y - 10);
                glyph = heart;
            } else {
                const def = itemById(slot.itemId);
                if (def) {
                    // Show the actual item icon instead of a generic coloured orb.
                    glyph = this.track(
                        this.scene.add
                            .image(x, y - 19, itemIconKey(this.scene, def))
                            .setDepth(16)
                            .setScale(1.35)
                    );
                } else {
                    const orb = this.track(this.scene.add.graphics().setDepth(16));
                    orb.fillStyle(color, 1);
                    orb.fillCircle(x, y - 18, 5);
                    orb.fillStyle(0xfff0c0, 1);
                    orb.fillRect(x - 2, y - 21, 2, 2);
                    glyph = orb;
                }
            }
            const price = this.track(
                this.scene.add
                    .text(x, y + 18, `${slot.price}`, {
                        fontFamily: 'Consolas, monospace',
                        fontSize: '8px',
                        color: '#e8c070',
                    })
                    .setOrigin(0.5, 0)
                    .setDepth(20)
                    .setResolution(2)
            );
            // Name + description float above the pedestal, so the player knows
            // what the coloured orb actually does before stepping on it.
            const def = slot.kind === 'item' ? itemById(slot.itemId) : undefined;
            const name = slot.kind === 'heart' ? '生命上限 +1 心' : (def?.name ?? '神秘道具');
            const desc = slot.kind === 'heart' ? '回满血量' : (def?.desc ?? '效果未知');
            this.track(
                this.scene.add
                    .text(x, y - 58, name, {
                        fontFamily: 'Microsoft YaHei, Consolas, monospace',
                        fontSize: '9px',
                        fontStyle: 'bold',
                        color: '#f0d8a8',
                        align: 'center',
                        wordWrap: { width: 116 },
                    })
                    .setOrigin(0.5, 0)
                    .setDepth(20)
                    .setResolution(2)
            );
            this.track(
                this.scene.add
                    .text(x, y - 44, desc, {
                        fontFamily: 'Microsoft YaHei, Consolas, monospace',
                        fontSize: '7px',
                        color: '#b8a084',
                        align: 'center',
                        lineSpacing: 2,
                        wordWrap: { width: 116 },
                    })
                    .setOrigin(0.5, 0)
                    .setDepth(20)
                    .setResolution(2)
            );
            this.shelfArt[index] = { glyph, price };
        });
    }

    /** Marks a purchased shelf so it cannot be bought twice. */
    markSold(index: number): void {
        const art = this.shelfArt[index];
        if (!art) {
            return;
        }
        art.glyph.setVisible(false);
        art.price.setText('SOLD').setColor('#6b5a44');
    }

    private buildChest(kind: 'wood' | 'gold'): void {
        const x = ROOM_CX;
        const y = ROOM_CY + 10;
        this.chestPoint = { x, y };
        const gold = kind === 'gold';
        const chestBase = actorDepth(y + 12);
        const chest = this.track(this.scene.add.graphics().setDepth(chestBase));
        chest.fillStyle(0x1a0f08, 1);
        chest.fillRoundedRect(x - 19, y - 13, 38, 28, 4);
        chest.fillStyle(gold ? 0xb8862a : 0x6a3f22, 1);
        chest.fillRoundedRect(x - 17, y - 8, 34, 21, 3);
        chest.fillStyle(0x241408, 1);
        chest.fillRect(x - 2, y - 2, 4, 9);
        chest.fillStyle(gold ? 0xffe9a0 : 0xc08040, 1);
        chest.fillRect(x - 1, y - 1, 2, 4);
        this.chestArt.push(chest);

        const lid = this.track(this.scene.add.graphics().setDepth(chestBase + 0.02));
        lid.setPosition(x, y - 11);
        lid.fillStyle(0x1a0f08, 1);
        lid.fillRoundedRect(-19, 0, 38, 10, 4);
        lid.fillStyle(gold ? 0xe8c862 : 0x9a6034, 1);
        lid.fillRoundedRect(-17, 1, 34, 7, 3);
        lid.fillStyle(gold ? 0xffe9a0 : 0xc08040, 1);
        lid.fillRect(-2, 2, 4, 3);
        this.chestArt.push(lid);
        this.chestLid = lid;

        if (gold) {
            // Locked gold chest: a padlock the player has to open with a key.
            chest.fillStyle(0x1a1208, 1);
            chest.fillCircle(x, y + 4, 4.5);
            chest.fillStyle(0xe8c870, 1);
            chest.fillCircle(x, y + 4, 3);
            chest.fillStyle(0x1a1208, 1);
            chest.fillRect(x - 1, y + 4, 2, 3);

            const glow = this.track(
                this.scene.add
                    .image(x, y - 4, TEX.glow)
                    .setDepth(chestBase - 0.05)
                    .setBlendMode('ADD')
                    .setTint(0xffd060)
                    .setScale(0.9)
                    .setAlpha(0.28)
            );
            this.tweens.push(
                this.scene.tweens.add({
                    targets: glow,
                    alpha: 0.5,
                    duration: 900,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut',
                })
            );
            this.chestArt.push(glow);
        }
    }

    /** Opened chest: the lid flips back and everything fades. */
    openChest(): void {
        this.chestPoint = undefined;
        const lid = this.chestLid;
        if (lid) {
            this.scene.tweens.add({
                targets: lid,
                angle: -56,
                y: lid.y - 7,
                duration: 220,
                ease: 'Back.easeOut',
            });
        }
        this.scene.tweens.add({
            targets: this.chestArt,
            alpha: 0,
            scaleX: 1.15,
            scaleY: 1.15,
            delay: 140,
            duration: 240,
            ease: 'Cubic.easeOut',
            onComplete: () =>
                this.chestArt.forEach((art) =>
                    (art as Phaser.GameObjects.Image).setVisible(false)
                ),
        });
        this.chestArt = [];
        this.chestLid = undefined;
    }

    /** Flies the item into the player and clears the pedestal. */
    takeItem(targetX: number, targetY: number): void {
        this.itemPoint = undefined;
        this.bobTween?.stop();
        this.bobTween = undefined;
        for (const node of this.itemNodes) {
            this.scene.tweens.add({
                targets: node,
                x: targetX,
                y: targetY,
                alpha: 0,
                scaleX: 0.3,
                scaleY: 0.3,
                duration: 320,
                ease: 'Cubic.easeIn',
                onComplete: () => node.destroy(),
            });
        }
        this.itemNodes = [];
    }

    private buildObstacles(): void {
        const pitArt = this.track(this.scene.add.graphics().setDepth(6));
        const spikeArt = this.track(this.scene.add.graphics().setDepth(7));

        for (const obstacle of this.room.obstacles) {
            if (obstacle.kind === 'rock') {
                const rock = this.scene.physics.add.staticImage(
                    obstacle.x,
                    obstacle.y,
                    TEX.rock
                );
                rock.setDepth(actorDepth(rock.y + 9));
                // Match the sprite, so the player's feet stop at the rock's edge
                // instead of visually standing inside it.
                (rock.body as Phaser.Physics.Arcade.StaticBody).setSize(22, 18);
                rock.setData('rockHp', 3);
                rock.setData('obstacle', obstacle);
                this.solids.push(rock);
                this.objects.push(rock);
            } else if (obstacle.kind === 'wall') {
                const wall = this.scene.add
                    .image(obstacle.x, obstacle.y, TEX.wall)
                    .setDepth(8)
                    .setTint(floorTheme(this.level).wall);
                this.scene.physics.add.existing(wall, true);
                (wall.body as Phaser.Physics.Arcade.StaticBody).setSize(24, 24);
                wall.setData('obstacle', obstacle);
                this.solids.push(wall);
                this.objects.push(wall);
            } else if (obstacle.kind === 'pit') {
                pitArt.fillStyle(0x2a1c12, 1);
                pitArt.fillEllipse(obstacle.x, obstacle.y, 32, 24);
                pitArt.fillStyle(0x040202, 1);
                pitArt.fillEllipse(obstacle.x, obstacle.y + 1, 25, 17);
                pitArt.lineStyle(1, 0x100906, 1);
                pitArt.strokeEllipse(obstacle.x, obstacle.y + 2, 18, 11);
                this.addPitSolid(obstacle.x, obstacle.y);
            } else {
                spikeArt.fillStyle(0x1a100b, 1);
                spikeArt.fillRect(obstacle.x - 12, obstacle.y + 3, 24, 9);
                for (let i = 0; i < 4; i += 1) {
                    const sx = obstacle.x - 9 + i * 6;
                    spikeArt.fillStyle(0x9a8f82, 1);
                    spikeArt.fillTriangle(
                        sx,
                        obstacle.y + 8,
                        sx + 4,
                        obstacle.y + 8,
                        sx + 2,
                        obstacle.y - 8
                    );
                }
                this.spikes.push({ x: obstacle.x, y: obstacle.y });
            }
        }
    }

    private addPitSolid(x: number, y: number): void {
        const rect = this.scene.add.rectangle(x, y, 26, 18, 0xff0000, 0);
        this.scene.physics.add.existing(rect, true);
        this.pits.push(rect);
        this.objects.push(rect);
    }
}
