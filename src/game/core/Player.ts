import type * as Phaser from 'phaser';
import type { Dir, InputState } from '../types';
import { PLAYER, TEX } from '../const';
import { Inventory } from './Inventory';
import type { ItemDef } from './items';
import type { Stats } from './stats';
import { shakeCamera } from './settings';
import { actorDepth } from '../view/depth';

/** Everything one tear of a volley needs. */
export interface ShotSpec {
    damage: number;
    range: number;
    speed: number;
    angle: number;
    size: number;
    pierce: number;
    bounces: number;
    homing: number;
    splits: number;
    poison: number;
    slow: number;
    ghost: boolean;
    crit: number;
    blast: number;
    boomerang: boolean;
    farBonus: number;
}

export interface PlayerContext {
    scene: Phaser.Scene;
    fireTear: (x: number, y: number, dir: Dir, spec: ShotSpec) => void;
    fireBeam: (x: number, y: number, dir: Dir, damage: number, length: number) => void;
    onDeath: () => void;
    onDamaged?: () => void;
    onBlocked?: () => void;
    /** Fired when a revive item saves the player from a lethal hit. */
    onRevive?: () => void;
}

function approach(current: number, target: number, maxDelta: number): number {
    if (current < target) {
        return Math.min(current + maxDelta, target);
    }
    return Math.max(current - maxDelta, target);
}

const CHARGE_TIME = 0.9;

export class Player {
    readonly sprite: Phaser.Physics.Arcade.Sprite;
    readonly shadow: Phaser.GameObjects.Image;
    readonly inventory = new Inventory();
    /** Positions of the orbiting turrets (scene reads these to fire). */
    readonly orbiters: Array<{ x: number; y: number }> = [];

    hp: number = PLAYER.maxHp;
    dead = false;
    /** Debug-only: ignore every damage source until switched off. */
    godMode = false;
    facing: Dir = 'down';

    /** Which boundary/axis stopped the player on the previous frame. */
    private moveBounds: { minX: number; maxX: number; minY: number; maxY: number } | null = null;

    private invuln = 0;
    private hitStun = 0;
    private fireCd = 0;
    private shieldsLeft = 0;
    private revivesUsed = 0;
    private roomShots = 0;
    private charge = 0;
    private chargeDir: Dir = 'down';
    private chargeRing?: Phaser.GameObjects.Graphics;
    private idleTween?: Phaser.Tweens.Tween;
    private dustCd = 0;

    private wings: Phaser.GameObjects.Image[] = [];
    private halo?: Phaser.GameObjects.Image;
    private bubble?: Phaser.GameObjects.Graphics;
    private orbs: Phaser.GameObjects.Image[] = [];
    private turretImgs: Phaser.GameObjects.Image[] = [];
    private trackTimer = 0;

    constructor(
        private readonly ctx: PlayerContext,
        x: number,
        y: number
    ) {
        const scene = ctx.scene;
        this.shadow = scene.add
            .image(x, y + 16, TEX.shadow)
            .setDepth(18)
            .setScale(1.1)
            .setAlpha(0.75);

        this.sprite = scene.physics.add.sprite(x, y, TEX.hero('down', 0));
        this.sprite.setDepth(30);
        this.sprite.setCollideWorldBounds(false);
        const body = this.sprite.body as Phaser.Physics.Arcade.Body;
        // The hitbox sits on the feet, not the middle of the sprite, so the
        // visible feet cannot slide through rocks or into the wall band.
        body.setCircle(PLAYER.bodyRadius, 13 - PLAYER.bodyRadius, 26 - PLAYER.bodyRadius);
        body.setDrag(0, 0);
        body.setMaxVelocity(260, 260);
    }

    get x(): number {
        return this.sprite.x;
    }

    get y(): number {
        return this.sprite.y;
    }

    get body(): Phaser.Physics.Arcade.Body {
        return this.sprite.body as Phaser.Physics.Arcade.Body;
    }

    get stats(): Stats {
        return this.inventory.stats;
    }

    addItem(item: ItemDef): void {
        const before = this.stats.maxHp;
        this.inventory.add(item);
        const gained = this.stats.maxHp - before;
        if (gained > 0) {
            this.hp += gained;
        }
        this.hp = Math.min(this.hp, this.stats.maxHp);
        this.rebuildLook();
    }

    /** Rebuilds cosmetic attachments after the inventory was changed directly. */
    refreshLook(): void {
        this.rebuildLook();
    }

    heal(amount: number): void {
        this.hp = Math.min(this.stats.maxHp, this.hp + amount);
    }

    /** Shop / chest heart container: +1 heart of max HP, then full heal. */
    addHeartContainer(): void {
        this.inventory.addHeartBonus(2);
        this.hp = this.stats.maxHp;
    }

    /** Called on every room entry: shields refill, first-shot bonus resets. */
    onRoomEnter(): void {
        this.shieldsLeft = this.stats.shields;
        this.roomShots = 0;
        this.charge = 0;
        this.sprite.setScale(this.inventory.visuals.has('bigBody') ? 1.18 : 1);
    }

    update(dt: number, input: InputState): void {
        if (this.dead) {
            return;
        }
        this.invuln = Math.max(0, this.invuln - dt);
        this.hitStun = Math.max(0, this.hitStun - dt);
        this.fireCd = Math.max(0, this.fireCd - dt);

        const body = this.body;
        let targetX = input.mx * this.stats.speed;
        let targetY = input.my * this.stats.speed;

        // Pressing into a wall used to re-accelerate every frame, which made the
        // sprite jitter against the boundary. Kill that axis and idle instead.
        const bounds = this.moveBounds;
        const footProbeX = input.mx !== 0 && this.isFootwayBlocked(Math.sign(input.mx) * 7, 0);
        const footProbeY = input.my !== 0 && this.isFootwayBlocked(0, Math.sign(input.my) * 7);
        const blockedX =
            footProbeX ||
            (targetX < 0 && ((bounds !== null && this.x <= bounds.minX + 0.5) || body.blocked.left)) ||
            (targetX > 0 && ((bounds !== null && this.x >= bounds.maxX - 0.5) || body.blocked.right));
        const blockedY =
            footProbeY ||
            (targetY < 0 && ((bounds !== null && this.y <= bounds.minY + 0.5) || body.blocked.up)) ||
            (targetY > 0 && ((bounds !== null && this.y >= bounds.maxY - 0.5) || body.blocked.down));
        if (blockedX) {
            targetX = 0;
            body.velocity.x = 0;
        }
        if (blockedY) {
            targetY = 0;
            body.velocity.y = 0;
        }
        const moving = targetX !== 0 || targetY !== 0;

        if (this.hitStun > 0) {
            body.velocity.scale(1 - 4 * dt);
        } else {
            const accel = moving ? PLAYER.accel : PLAYER.decel;
            body.setVelocity(
                approach(body.velocity.x, targetX, accel * dt),
                approach(body.velocity.y, targetY, accel * dt)
            );
        }

        if (input.shootDir) {
            this.facing = input.shootDir;
        } else if (Math.abs(body.velocity.x) > Math.abs(body.velocity.y) + 8) {
            this.facing = body.velocity.x > 0 ? 'right' : 'left';
        } else if (Math.abs(body.velocity.y) > 8) {
            this.facing = body.velocity.y > 0 ? 'down' : 'up';
        }

        if (this.stats.beam) {
            this.updateBeam(dt, input);
        } else if (input.shootDir && this.fireCd <= 0) {
            this.fireVolley(input.shootDir);
            this.fireCd = 1 / Math.max(0.2, this.stats.fireRate);
        }

        this.animate(moving);
        this.shadow.setPosition(this.x, this.y + (this.inventory.visuals.has('float') ? 21 : 16));
        this.sprite.setDepth(actorDepth(this.y + 16));
        this.updateLook(dt, moving);
        this.dustCd = Math.max(0, this.dustCd - dt);
        if (moving && this.dustCd <= 0) {
            this.dustCd = 0.1;
            this.spawnDust();
        }

        if (this.invuln > 0) {
            const visible = Math.floor(this.invuln * 18) % 2 === 0;
            this.sprite.setAlpha(visible ? 0.35 : 1);
        } else {
            this.sprite.setAlpha(1);
        }
    }

    private buildSpec(angle: number): ShotSpec {
        const stats = this.stats;
        let damage = stats.damage;
        if (this.roomShots === 0 && stats.firstBonus > 0) {
            damage *= 1 + stats.firstBonus;
        }
        return {
            damage,
            range: stats.range,
            speed: stats.shotSpeed,
            angle,
            size: stats.tearSize,
            pierce: stats.pierce,
            bounces: stats.bounces,
            homing: stats.homing,
            splits: stats.splits,
            poison: stats.poison,
            slow: stats.slow,
            ghost: stats.ghost,
            crit: stats.crit,
            blast: stats.blast,
            boomerang: stats.boomerang,
            farBonus: stats.farBonus,
        };
    }

    private fireVolley(dir: Dir): void {
        const stats = this.stats;
        const count = Math.max(1, 1 + Math.round(stats.tears));
        const step = count > 1 ? stats.spread / (count - 1) : 0;
        const start = (-step * (count - 1)) / 2;
        const x = this.x + dirX(dir) * 10;
        const y = this.y - 6 + dirY(dir) * 8;
        for (let i = 0; i < count; i += 1) {
            this.ctx.fireTear(x, y, dir, this.buildSpec(start + step * i));
        }
        this.roomShots += 1;
    }

    private updateBeam(dt: number, input: InputState): void {
        if (input.shootDir) {
            this.chargeDir = input.shootDir;
            this.charge = Math.min(CHARGE_TIME, this.charge + dt);
            this.showCharge(this.charge / CHARGE_TIME);
            if (this.charge >= CHARGE_TIME) {
                // Full ring: release automatically, then start the next charge.
                this.fireChargedBeam();
                this.charge = 0;
                this.showCharge(0);
            }
            return;
        }
        // Released early: cancel without firing. The ring only fires when full.
        this.charge = 0;
        this.showCharge(0);
    }

    private fireChargedBeam(): void {
        this.ctx.fireBeam(
            this.x,
            this.y - 6,
            this.chargeDir,
            this.stats.damage * 2.4,
            300
        );
        this.roomShots += 1;
        const flash = this.ctx.scene.add
            .circle(this.x, this.y - 13, 13, 0xffe0a0, 0.2)
            .setDepth(56)
            .setStrokeStyle(2, 0xfff0c0, 0.95);
        this.ctx.scene.tweens.add({
            targets: flash,
            radius: 22,
            alpha: 0,
            duration: 180,
            ease: 'Cubic.easeOut',
            onComplete: () => flash.destroy(),
        });
    }

    private showCharge(ratio: number): void {
        if (ratio <= 0) {
            this.chargeRing?.clear().setVisible(false);
            return;
        }
        if (!this.chargeRing) {
            this.chargeRing = this.ctx.scene.add.graphics().setDepth(55);
        }
        const ring = this.chargeRing;
        const cx = this.x;
        const cy = this.y - 13;
        const radius = 13;
        ring.clear().setVisible(true);
        ring.lineStyle(2.5, 0x1a120c, 0.85);
        ring.strokeCircle(cx, cy, radius);
        ring.fillStyle(0xffb060, 0.08 * ratio);
        ring.fillCircle(cx, cy, radius - 2);
        ring.lineStyle(2.5, ratio >= 0.999 ? 0xfff0c0 : 0xffb060, 0.95);
        ring.beginPath();
        ring.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio, false);
        ring.strokePath();
    }

    /** Drops any in-progress beam charge (used by the debug item toggle). */
    clearCharge(): void {
        this.charge = 0;
        this.showCharge(0);
    }

    private updateLook(dt: number, moving: boolean): void {
        const visuals = this.inventory.visuals;
        const stats = this.stats;

        if (this.halo) {
            this.halo.setPosition(this.x, this.y - 19);
            this.halo.rotation += dt * 1.4;
        }
        if (this.wings.length === 2) {
            const flap = Math.sin(this.ctx.scene.time.now / 90) * 8;
            this.wings[0].setPosition(this.x - 11, this.y - 4).setAngle(-18 + flap);
            this.wings[1].setPosition(this.x + 11, this.y - 4).setAngle(18 - flap);
        }
        if (this.bubble) {
            this.bubble.clear();
            this.bubble.lineStyle(1, 0xa8dcff, 0.55);
            this.bubble.strokeCircle(this.x, this.y - 4, 17);
            this.bubble.fillStyle(0xa8dcff, 0.06);
            this.bubble.fillCircle(this.x, this.y - 4, 17);
        }
        if (visuals.has('tracks') && moving) {
            this.trackTimer -= dt;
            if (this.trackTimer <= 0) {
                this.trackTimer = 0.17;
                const print = this.ctx.scene.add
                    .image(this.x, this.y + 14, TEX.shadow)
                    .setDepth(17)
                    .setScale(0.75)
                    .setAlpha(0.3)
                    .setTint(0x9a8f84);
                this.ctx.scene.tweens.add({
                    targets: print,
                    alpha: 0,
                    duration: 420,
                    onComplete: () => print.destroy(),
                });
            }
        }

        this.orbiters.length = 0;
        const turrets = Math.max(0, Math.round(stats.turrets));
        const orbitAll = [...this.orbs, ...this.turretImgs];
        const now = this.ctx.scene.time.now / 1000;
        for (let i = 0; i < orbitAll.length; i += 1) {
            const angle = now * 2.2 + (i * Math.PI * 2) / Math.max(1, orbitAll.length);
            const radius = 27;
            const ox = this.x + Math.cos(angle) * radius;
            const oy = this.y - 4 + Math.sin(angle) * radius * 0.55;
            orbitAll[i].setPosition(ox, oy);
            if (i >= this.orbs.length) {
                this.orbiters.push({ x: ox, y: oy });
            }
        }
        if (turrets === 0) {
            this.orbiters.length = 0;
        }
    }

    private rebuildLook(): void {
        const scene = this.ctx.scene;
        const visuals = this.inventory.visuals;
        const stats = this.stats;

        for (const wing of this.wings) {
            wing.destroy();
        }
        this.wings = [];
        this.halo?.destroy();
        this.halo = undefined;
        this.bubble?.destroy();
        this.bubble = undefined;
        for (const orb of this.orbs) {
            orb.destroy();
        }
        this.orbs = [];
        for (const turret of this.turretImgs) {
            turret.destroy();
        }
        this.turretImgs = [];

        this.sprite.setScale(visuals.has('bigBody') ? 1.18 : 1);
        this.shadow.setScale(visuals.has('bigBody') ? 1.3 : 1.1);

        if (visuals.has('wings')) {
            for (let i = 0; i < 2; i += 1) {
                this.wings.push(
                    scene.add
                        .image(this.x, this.y, TEX.glow)
                        .setDepth(29)
                        .setScale(0.42, 0.26)
                        .setTint(0xd8d0c0)
                        .setAlpha(0.55)
                );
            }
        }
        if (visuals.has('halo')) {
            this.halo = scene.add
                .image(this.x, this.y - 19, TEX.glow)
                .setDepth(31)
                .setScale(0.5, 0.22)
                .setTint(0xffd090)
                .setAlpha(0.6)
                .setBlendMode('ADD');
        } else if (visuals.has('darkHalo')) {
            this.halo = scene.add
                .image(this.x, this.y - 19, TEX.glow)
                .setDepth(31)
                .setScale(0.5, 0.22)
                .setTint(0x8a5ad0)
                .setAlpha(0.6)
                .setBlendMode('ADD');
        }
        if (visuals.has('bubble')) {
            this.bubble = scene.add.graphics().setDepth(32);
        }
        if (visuals.has('orbit')) {
            for (let i = 0; i < 2; i += 1) {
                this.orbs.push(
                    scene.add
                        .image(this.x, this.y, TEX.glow)
                        .setDepth(33)
                        .setScale(0.16)
                        .setTint(0x90e0ff)
                        .setAlpha(0.85)
                        .setBlendMode('ADD')
                );
            }
        }
        const turrets = Math.max(0, Math.round(stats.turrets));
        for (let i = 0; i < turrets; i += 1) {
            this.turretImgs.push(
                scene.add
                    .image(this.x, this.y, TEX.glow)
                    .setDepth(33)
                    .setScale(0.22)
                    .setTint(0x80e0d0)
                    .setAlpha(0.9)
                    .setBlendMode('ADD')
            );
        }
    }

    private animate(moving: boolean): void {
        if (!moving) {
            this.sprite.anims.stop();
            this.sprite.setTexture(TEX.hero(this.facing, 0));
            if (!this.idleTween) {
                this.sprite.setScale(1, 1);
                // Subtle breathing loop so standing still is not a frozen frame.
                this.idleTween = this.ctx.scene.tweens.add({
                    targets: this.sprite,
                    scaleY: 1.045,
                    scaleX: 0.99,
                    duration: 850,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut',
                });
            }
            return;
        }
        this.stopIdle();
        const key = `walk_${this.facing}`;
        if (!this.sprite.anims.isPlaying || this.sprite.anims.currentAnim?.key !== key) {
            this.sprite.anims.play(key, true);
        }
    }

    private stopIdle(): void {
        if (this.idleTween) {
            this.idleTween.stop();
            this.idleTween = undefined;
        }
        this.sprite.setScale(1, 1);
    }

    private spawnDust(): void {
        const scene = this.ctx.scene;
        const vx = this.body.velocity.x;
        const vy = this.body.velocity.y;
        const len = Math.hypot(vx, vy) || 1;
        const backX = -vx / len;
        const backY = -vy / len;
        for (let i = 0; i < 3; i += 1) {
            const dust = scene.add
                .circle(
                    this.x + backX * 12 + (Math.random() - 0.5) * 10,
                    this.y + 13 + backY * 8 + (Math.random() - 0.5) * 4,
                    2,
                    0xd8c0a0,
                    0.5
                )
                .setDepth(19);
            scene.tweens.add({
                targets: dust,
                radius: 5,
                alpha: 0,
                x: dust.x + (Math.random() - 0.5) * 4,
                y: dust.y - 3,
                duration: 320,
                ease: 'Cubic.easeOut',
                onComplete: () => dust.destroy(),
            });
        }
    }

    takeDamage(amount: number, srcX?: number, srcY?: number): boolean {
        if (this.dead || this.invuln > 0 || this.godMode) {
            return false;
        }

        if (this.shieldsLeft > 0) {
            this.shieldsLeft -= 1;
            this.invuln = 0.6;
            this.hitStun = 0.12;
            this.shieldFlash();
            this.ctx.onBlocked?.();
            return true;
        }

        const damage = Math.max(0.5, amount - this.stats.armor);
        this.hp = Math.max(0, this.hp - damage);
        this.invuln = PLAYER.invuln;
        this.hitStun = PLAYER.hitStun;

        if (srcX !== undefined && srcY !== undefined) {
            const dx = this.x - srcX;
            const dy = this.y - srcY;
            const length = Math.hypot(dx, dy) || 1;
            this.body.setVelocity((dx / length) * 250, (dy / length) * 250);
        }

        shakeCamera(this.ctx.scene, 90, 0.004);
        this.sprite.setTint(0xff6a6a);
        this.ctx.scene.time.delayedCall(120, () => {
            if (this.sprite.active) {
                this.sprite.clearTint();
            }
        });

        if (this.hp <= 0) {
            if (this.revivesUsed < this.stats.revives) {
                this.revivesUsed += 1;
                this.hp = Math.ceil(this.stats.maxHp / 2);
                this.invuln = 2.5;
                this.hitStun = 0;
                this.sprite.setTint(0xa0a8d8);
                this.ctx.scene.cameras.main.flash(220, 40, 60, 120);
                this.ctx.onRevive?.();
                this.ctx.scene.time.delayedCall(400, () => {
                    if (this.sprite.active) {
                        this.sprite.clearTint();
                    }
                });
            } else {
                this.die();
            }
        } else {
            this.ctx.onDamaged?.();
        }
        return true;
    }

    private shieldFlash(): void {
        const ring = this.ctx.scene.add
            .circle(this.x, this.y - 4, 12, 0xb0e0ff, 0.35)
            .setDepth(34)
            .setBlendMode('ADD');
        this.ctx.scene.tweens.add({
            targets: ring,
            radius: 26,
            alpha: 0,
            duration: 220,
            onComplete: () => ring.destroy(),
        });
    }

    private die(): void {
        this.dead = true;
        this.charge = 0;
        this.showCharge(0);
        this.stopIdle();
        this.body.enable = false;
        this.sprite.setTint(0xff5a5a);
        this.ctx.scene.tweens.add({
            targets: [this.sprite, this.shadow],
            alpha: 0,
            angle: 70,
            y: `+=10`,
            duration: 700,
            ease: 'Cubic.easeIn',
        });
        this.ctx.onDeath();
    }

    reset(x: number, y: number): void {
        this.hp = this.stats.maxHp;
        this.dead = false;
        this.revivesUsed = 0;
        this.shieldsLeft = this.stats.shields;
        this.roomShots = 0;
        this.invuln = 0;
        this.hitStun = 0;
        this.fireCd = 0;
        this.facing = 'down';
        this.body.enable = true;
        this.body.reset(x, y);
        this.sprite.setAlpha(1);
        this.sprite.clearTint();
        this.sprite.setAngle(0);
        this.sprite.setTexture(TEX.hero('down', 0));
        this.sprite.setDepth(actorDepth(y + 16));
        this.stopIdle();
        this.shadow.setPosition(x, y + 16);
        this.shadow.setAlpha(0.75);
        this.rebuildLook();
    }

    /** Reposition without healing — used when walking through a door. */
    placeAt(x: number, y: number): void {
        this.hitStun = 0;
        this.fireCd = 0;
        this.body.enable = true;
        this.body.reset(x, y);
        this.sprite.anims.stop();
        this.sprite.setTexture(TEX.hero(this.facing, 0));
        this.sprite.setDepth(actorDepth(y + 16));
        this.stopIdle();
        this.sprite.setAlpha(1);
        this.sprite.clearTint();
        this.sprite.setAngle(0);
        this.shadow.setPosition(x, y + 16);
        this.shadow.setAlpha(0.75);
    }

    /** Bounds the player may not walk past this frame (door gaps excluded). */
    setBounds(minX: number, maxX: number, minY: number, maxY: number): void {
        this.moveBounds = { minX, maxX, minY, maxY };
    }

    /**
     * Checks a small rect just ahead of the feet against static room bodies
     * (walls, rocks, pits). Keeps the visible feet from sliding into them and
     * lets the player resume the instant the obstacle is gone.
     */
    private isFootwayBlocked(dx: number, dy: number): boolean {
        const footX = this.x + dx;
        const footY = this.y + 9 + dy;
        const bodies = this.ctx.scene.physics.overlapRect(
            footX - 2,
            footY - 2,
            4,
            4,
            false,
            true
        ) as Phaser.Physics.Arcade.StaticBody[];
        return bodies.some((body) => body.enable && !body.checkCollision.none);
    }

    /** Hard clamp to a rect, so knockback cannot shove the body through walls. */
    clampInside(minX: number, maxX: number, minY: number, maxY: number): boolean {
        const nx = Math.max(minX, Math.min(maxX, this.x));
        const ny = Math.max(minY, Math.min(maxY, this.y));
        const clampedX = nx !== this.x;
        const clampedY = ny !== this.y;
        if (!clampedX && !clampedY) {
            return false;
        }
        const body = this.body;
        const vx = body.velocity.x;
        const vy = body.velocity.y;
        body.reset(nx, ny);
        body.setVelocity(clampedX ? 0 : vx, clampedY ? 0 : vy);
        this.shadow.setPosition(nx, ny + (this.inventory.visuals.has('float') ? 21 : 16));
        return true;
    }

    destroy(): void {
        this.sprite.destroy();
        this.shadow.destroy();
    }
}

export function dirX(dir: Dir): number {
    return dir === 'left' ? -1 : dir === 'right' ? 1 : 0;
}

export function dirY(dir: Dir): number {
    return dir === 'up' ? -1 : dir === 'down' ? 1 : 0;
}
