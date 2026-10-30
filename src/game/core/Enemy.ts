import { TintModes } from 'phaser';
import type * as Phaser from 'phaser';
import type { EnemyKind } from '../types';
import { ENEMY_STATS, PLAY_BOTTOM, PLAY_RIGHT, PLAY_X, PLAY_Y, TEX } from '../const';
import { actorDepth } from '../view/depth';
import type { Player } from './Player';

export interface EnemyContext {
    scene: Phaser.Scene;
    getPlayer: () => Player;
    fireTear: (x: number, y: number, vx: number, vy: number, damage: number, size?: number) => void;
    onDeath: (enemy: Enemy) => void;
}

function approach(current: number, target: number, maxDelta: number): number {
    if (current < target) {
        return Math.min(current + maxDelta, target);
    }
    return Math.max(current - maxDelta, target);
}

function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value;
}

function normalizeAngle(angle: number): number {
    let value = angle;
    while (value > Math.PI) {
        value -= Math.PI * 2;
    }
    while (value < -Math.PI) {
        value += Math.PI * 2;
    }
    return value;
}

const TEXTURE: Readonly<Record<EnemyKind, string>> = {
    grub: TEX.grub,
    moth: TEX.moth,
    spitter: TEX.spitter,
    rat: TEX.rat,
    hop: TEX.hop,
    boomMoth: TEX.boomMoth,
    toad: TEX.toad,
    maw: TEX.maw,
    doll: TEX.doll,
    mask: TEX.mask,
    vis: TEX.vis,
    shadeMoth: TEX.shadeMoth,
    splitGrub: TEX.splitGrub,
    thornRoll: TEX.thornRoll,
};

const SHADOW_SCALE: Partial<Record<EnemyKind, number>> = {
    moth: 0.8,
    boomMoth: 0.85,
    maw: 0.85,
    vis: 0.7,
    shadeMoth: 0.8,
    splitGrub: 1.05,
    thornRoll: 0.95,
};

export class Enemy {
    readonly kind: EnemyKind;
    readonly sprite: Phaser.Physics.Arcade.Sprite;
    readonly shadow: Phaser.GameObjects.Image;
    readonly radius: number;
    readonly contact: number;
    readonly flying: boolean;
    readonly maxHp: number;

    hp: number;
    dead = false;

    private readonly baseSpeed: number;
    private slowT = 0;
    private slowFactor = 1;
    private poisonDps = 0;
    private poisonT = 0;
    private poisonAcc = 0;
    private awake = false;
    private cd = 0.8 + Math.random() * 0.8;
    private tell = 0;
    private strafe = Math.random() * Math.PI * 2;
    private timer = 0.6;
    private leap = 0;
    private charge = 0;
    private lockOn = 0;
    private aim = 0;
    private turnCd = 0;
    private revived = false;
    private laserAngle = 0;
    private tele = 0;
    private idleTween?: Phaser.Tweens.Tween;

    constructor(
        private readonly ctx: EnemyContext,
        kind: EnemyKind,
        x: number,
        y: number,
        hpScale = 1
    ) {
        const stats = ENEMY_STATS[kind];
        this.kind = kind;
        this.radius = stats.radius;
        this.contact = stats.contact;
        this.flying = stats.flying;
        this.baseSpeed = stats.speed;
        this.hp = Math.round(stats.hp * hpScale);
        this.maxHp = this.hp;

        const scene = ctx.scene;
        this.shadow = scene.add
            .image(x, y + 10, TEX.shadow)
            .setDepth(19)
            .setScale(SHADOW_SCALE[kind] ?? 1)
            .setAlpha(0.7);

        this.sprite = scene.physics.add.sprite(x, y, TEXTURE[kind]);
        this.sprite.setDepth(25);
        const body = this.sprite.body as Phaser.Physics.Arcade.Body;
        const w = this.sprite.width;
        const h = this.sprite.height;
        body.setCircle(this.radius, w / 2 - this.radius, h / 2 - this.radius);
        body.setAllowGravity(false);
        body.setDrag(0, 0);

        if (kind === 'rat' || kind === 'boomMoth' || kind === 'thornRoll') {
            body.setBounce(1, 1);
        }
        if (kind === 'boomMoth') {
            const angle = Math.random() * Math.PI * 2;
            body.setVelocity(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);
        }
        if (kind === 'mask') {
            this.aim = Math.random() * Math.PI * 2;
        }
        this.startIdleMotion();
    }

    /** Plays the generated 3-frame loop; the spiked ball also spins. */
    private startIdleMotion(): void {
        const key = `anim_${TEXTURE[this.kind]}`;
        if (this.ctx.scene.anims.exists(key)) {
            this.sprite.play(key);
        }
        if (this.kind === 'thornRoll') {
            this.idleTween = this.ctx.scene.tweens.add({
                targets: this.sprite,
                angle: 360,
                duration: 1500,
                repeat: -1,
                ease: 'Linear',
            });
        }
    }
    private stopIdleMotion(): void {
        this.sprite.anims.stop();
        this.idleTween?.stop();
        this.idleTween = undefined;
        this.sprite.setAngle(0);
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

    private get speed(): number {
        return this.baseSpeed * (this.slowT > 0 ? this.slowFactor : 1);
    }

    applyPoison(dps: number, time: number): void {
        this.poisonDps = Math.max(this.poisonDps, dps);
        this.poisonT = Math.max(this.poisonT, time);
    }

    applySlow(factor: number, time: number): void {
        this.slowFactor = Math.min(this.slowFactor, factor);
        this.slowT = Math.max(this.slowT, time);
    }

    update(dt: number): void {
        this.sprite.setDepth(actorDepth(this.y + 8));
        if (this.dead) {
            return;
        }
        this.slowT = Math.max(0, this.slowT - dt);
        if (this.slowT <= 0) {
            this.slowFactor = 1;
        }
        this.tickPoison(dt);
        if (!this.body.enable) {
            this.body.setVelocity(0, 0);
            return;
        }
        const player = this.ctx.getPlayer();
        if (!player || player.dead) {
            this.body.setVelocity(0, 0);
            return;
        }
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const distance = Math.hypot(dx, dy) || 1;
        const nx = dx / distance;
        const ny = dy / distance;

        this.cd = Math.max(0, this.cd - dt);
        if (this.kind === 'moth' || this.kind === 'spitter') {
            this.updateTell(dt, nx, ny);
        }

        switch (this.kind) {
            case 'grub':
                this.updateGrub(dt, nx, ny, distance);
                break;
            case 'moth':
                this.updateMoth(dt, nx, ny, distance);
                break;
            case 'spitter':
                this.updateSpitter(dt, nx, ny, distance);
                break;
            case 'rat':
                this.updateRat(dt, nx, ny);
                break;
            case 'hop':
                this.updateHop(dt, nx, ny, distance);
                break;
            case 'boomMoth':
                break;
            case 'toad':
                this.updateToad(dt, nx, ny);
                break;
            case 'maw':
                this.updateMaw(dt, nx, ny, distance);
                break;
            case 'doll':
                this.updateDoll(dt, nx, ny);
                break;
            case 'mask':
                this.updateMask(dt, nx, ny);
                break;
            case 'vis':
                this.updateVis(dt, nx, ny, distance);
                break;
            case 'shadeMoth':
                this.updateShadeMoth(dt, nx, ny);
                break;
            case 'splitGrub':
                this.updateSplitGrub(dt, nx, ny);
                break;
            case 'thornRoll':
                this.updateThornRoll(dt, nx, ny);
                break;
        }

        this.sprite.setFlipX(nx < -0.2 && this.kind !== 'spitter' && this.kind !== 'vis');
        this.shadow.setPosition(this.x, this.y + (this.flying ? 14 : 10));
    }

    private updateGrub(dt: number, nx: number, ny: number, distance: number): void {
        if (!this.awake && distance < 230) {
            this.awake = true;
        }
        const speed = this.awake ? this.speed * 1.35 : this.speed * 0.55;
        const body = this.body;
        body.setVelocity(
            approach(body.velocity.x, nx * speed, 320 * dt),
            approach(body.velocity.y, ny * speed, 320 * dt)
        );
    }

    private updateMoth(dt: number, nx: number, ny: number, distance: number): void {
        const want = distance < 78 ? -1 : distance > 126 ? 1 : 0;
        this.strafe += dt * 1.7;
        const sx = -ny * Math.sin(this.strafe) * 32;
        const sy = nx * Math.sin(this.strafe) * 32;
        const body = this.body;
        body.setVelocity(
            approach(body.velocity.x, nx * this.speed * want + sx, 260 * dt),
            approach(body.velocity.y, ny * this.speed * want + sy, 260 * dt)
        );
        const clampedX = clamp(this.sprite.x, PLAY_X + this.radius, PLAY_RIGHT - this.radius);
        const clampedY = clamp(this.sprite.y, PLAY_Y + this.radius, PLAY_BOTTOM - this.radius);
        if (clampedX !== this.sprite.x || clampedY !== this.sprite.y) {
            const vx = body.velocity.x;
            const vy = body.velocity.y;
            body.reset(clampedX, clampedY);
            body.setVelocity(vx, vy);
        }

        if (this.cd <= 0 && this.tell <= 0 && distance < 260) {
            this.tell = 0.45;
        }
    }

    private updateSpitter(dt: number, nx: number, ny: number, distance: number): void {
        const body = this.body;
        body.velocity.scale(1 - 3 * dt);
        void dt;
        void nx;
        void ny;
        if (this.cd <= 0 && this.tell <= 0 && distance < 260) {
            this.tell = 0.55;
        }
    }

    /** Tin rat: bursts of speed, ricochets off walls. */
    private updateRat(dt: number, nx: number, ny: number): void {
        this.timer -= dt;
        if (this.timer > 0) {
            return;
        }
        this.timer = 0.38 + Math.random() * 0.3;
        const angle = Math.atan2(ny, nx) + (Math.random() - 0.5) * 2.4;
        this.body.setVelocity(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);
    }

    /** Hop scab: slow hops toward the player, aimed four-way volleys. */
    private updateHop(dt: number, nx: number, ny: number, distance: number): void {
        if (this.leap > 0) {
            this.leap -= dt;
            return;
        }
        this.body.velocity.scale(1 - 6 * dt);
        this.timer -= dt;
        if (this.timer <= 0) {
            this.timer = 1.1;
            this.leap = 0.3;
            this.body.setVelocity(nx * 210, ny * 210);
        }
        if (this.cd <= 0 && distance < 320) {
            this.cd = 2.6;
            const base = Math.atan2(ny, nx);
            for (let i = 0; i < 4; i += 1) {
                const angle = base + (i * Math.PI) / 2;
                this.ctx.fireTear(
                    this.x,
                    this.y,
                    Math.cos(angle) * 150,
                    Math.sin(angle) * 150,
                    1
                );
            }
        }
    }

    /** Spring toad: crouch telegraph, then a big leap; no knockback mid-air. */
    private updateToad(dt: number, nx: number, ny: number): void {
        if (this.leap > 0) {
            this.leap -= dt;
            return;
        }
        this.body.velocity.scale(1 - 5 * dt);

        if (this.tell > 0) {
            this.tell -= dt;
            this.sprite.setTint(Math.floor(this.tell * 16) % 2 === 0 ? 0xffd0a0 : 0xffffff);
            if (this.tell <= 0) {
                this.sprite.clearTint();
                this.leap = 0.34;
                this.body.setVelocity(nx * 300, ny * 300);
            }
            return;
        }

        this.timer -= dt;
        if (this.timer <= 0) {
            this.timer = 1.7;
            this.tell = 0.5;
        }
    }

    /** Hangmaw: hovers at range, charges, then spits a fat 2-damage tear. */
    private updateMaw(dt: number, nx: number, ny: number, distance: number): void {
        if (this.charge > 0) {
            this.charge -= dt;
            this.body.velocity.scale(1 - 3 * dt);
            this.sprite.setTint(Math.floor(this.charge * 14) % 2 === 0 ? 0xffd0a0 : 0xffffff);
            if (this.charge <= 0) {
                this.sprite.clearTint();
                const angle = Math.atan2(ny, nx);
                this.ctx.fireTear(
                    this.x,
                    this.y + 4,
                    Math.cos(angle) * 130,
                    Math.sin(angle) * 130,
                    2,
                    2.2
                );
                this.cd = 3 + Math.random() * 0.5;
            }
            return;
        }

        const want = distance < 130 ? -1 : distance > 200 ? 1 : 0;
        this.strafe += dt * 1.2;
        const body = this.body;
        body.setVelocity(
            approach(body.velocity.x, nx * this.speed * want, 120 * dt),
            approach(body.velocity.y, ny * this.speed * want + Math.sin(this.strafe) * 18, 120 * dt)
        );
        if (this.cd <= 0 && distance < 340) {
            this.charge = 1;
        }
    }

    /** Mud doll: plain chase; revives once as goo. */
    private updateDoll(dt: number, nx: number, ny: number): void {
        const body = this.body;
        body.setVelocity(
            approach(body.velocity.x, nx * this.speed, 220 * dt),
            approach(body.velocity.y, ny * this.speed, 220 * dt)
        );
    }

    /** Iron mask: turns in steps, only walks when already facing the player. */
    private updateMask(dt: number, nx: number, ny: number): void {
        this.turnCd -= dt;
        const target = Math.atan2(ny, nx);
        if (this.turnCd <= 0) {
            this.turnCd = 0.65;
            this.aim += clamp(normalizeAngle(target - this.aim), -1, 1);
        }
        const aligned = Math.cos(normalizeAngle(target - this.aim)) > 0.5;
        const speed = aligned ? this.speed : this.speed * 0.15;
        const body = this.body;
        body.setVelocity(
            approach(body.velocity.x, Math.cos(this.aim) * speed, 200 * dt),
            approach(body.velocity.y, Math.sin(this.aim) * speed, 200 * dt)
        );
    }

    /** Bloodwire: slow crawl, locks on, then a full-room laser. */
    private updateVis(dt: number, nx: number, ny: number, distance: number): void {
        if (this.lockOn > 0) {
            this.lockOn -= dt;
            this.body.velocity.scale(1 - 6 * dt);
            this.sprite.setTint(Math.floor(this.lockOn * 18) % 2 === 0 ? 0xff9a86 : 0xffffff);
            if (this.lockOn <= 0) {
                this.sprite.clearTint();
                this.fireLaser();
                this.cd = 3.6;
            }
            return;
        }

        const body = this.body;
        body.setVelocity(
            approach(body.velocity.x, nx * this.speed, 160 * dt),
            approach(body.velocity.y, ny * this.speed, 160 * dt)
        );
        if (this.cd <= 0 && distance < 360) {
            this.laserAngle = Math.atan2(ny, nx);
            this.lockOn = 0.85;
        }
    }

    /** Shade moth: slow drift, then blinks out and reappears near the player. */
    private updateShadeMoth(dt: number, nx: number, ny: number): void {
        if (this.tele > 0) {
            this.tele -= dt;
            this.body.setVelocity(0, 0);
            this.sprite.setAlpha(Math.floor(this.tele * 22) % 2 === 0 ? 0.25 : 0.9);
            if (this.tele <= 0) {
                const player = this.ctx.getPlayer();
                if (player) {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = 68 + Math.random() * 42;
                    const tx = clamp(player.x + Math.cos(angle) * dist, PLAY_X + 14, PLAY_RIGHT - 14);
                    const ty = clamp(player.y + Math.sin(angle) * dist, PLAY_Y + 14, PLAY_BOTTOM - 14);
                    this.body.reset(tx, ty);
                    this.sprite.setPosition(tx, ty);
                }
                this.sprite.setAlpha(1).clearTint();
            }
            return;
        }
        const speed = this.speed * 0.75;
        this.body.setVelocity(
            approach(this.body.velocity.x, nx * speed, 110 * dt),
            approach(this.body.velocity.y, ny * speed, 110 * dt)
        );
        if (this.cd <= 0) {
            this.cd = 2.4 + Math.random() * 0.8;
            this.tele = 0.42;
            this.sprite.setTint(0x8a5ad0);
        }
    }

    /** Split grub: slow waddling chase; GameScene splits it into two when it dies. */
    private updateSplitGrub(dt: number, nx: number, ny: number): void {
        const wobble = Math.sin(this.ctx.scene.time.now / 240 + this.strafe) * 0.4;
        const speed = this.speed;
        this.body.setVelocity(
            approach(this.body.velocity.x, nx * speed - ny * speed * wobble, 100 * dt),
            approach(this.body.velocity.y, ny * speed + nx * speed * wobble, 100 * dt)
        );
    }

    /** Thorn roller: keeps its speed and slowly curves towards the player. */
    private updateThornRoll(dt: number, nx: number, ny: number): void {
        const speed = Math.hypot(this.body.velocity.x, this.body.velocity.y) || this.speed;
        const angle = Math.atan2(this.body.velocity.y, this.body.velocity.x);
        const wanted = Math.atan2(ny, nx);
        const turn = clamp(normalizeAngle(wanted - angle), -0.7 * dt, 0.7 * dt);
        const next = angle + turn;
        this.body.setVelocity(Math.cos(next) * speed, Math.sin(next) * speed);
        this.sprite.rotation += dt * 2.4;
    }

    private updateTell(dt: number, nx: number, ny: number): void {
        if (this.tell <= 0) {
            return;
        }
        this.tell -= dt;
        if (this.tell <= 0) {
            this.fire(nx, ny);
            this.cd = this.kind === 'moth' ? 2.0 + Math.random() * 0.4 : 2.4 + Math.random() * 0.5;
            this.sprite.clearTint();
        } else if (Math.floor(this.tell * 20) % 2 === 0) {
            this.sprite.setTint(0xffd2a0);
        } else {
            this.sprite.clearTint();
        }
    }

    private fire(nx: number, ny: number): void {
        if (this.kind === 'spitter') {
            const base = Math.atan2(ny, nx);
            for (const offset of [-0.22, 0, 0.22]) {
                const angle = base + offset;
                this.ctx.fireTear(this.x, this.y + 4, Math.cos(angle) * 175, Math.sin(angle) * 175, 1);
            }
        } else {
            this.ctx.fireTear(this.x, this.y + 4, nx * 175, ny * 175, 1);
        }
    }

    private fireLaser(): void {
        const scene = this.ctx.scene;
        const length = 900;
        const endX = this.x + Math.cos(this.laserAngle) * length;
        const endY = this.y + Math.sin(this.laserAngle) * length;

        const beam = scene.add.graphics().setDepth(28);
        beam.lineStyle(5, 0x8c2a22, 0.55);
        beam.lineBetween(this.x, this.y, endX, endY);
        beam.lineStyle(2, 0xffb090, 0.95);
        beam.lineBetween(this.x, this.y, endX, endY);
        scene.tweens.add({
            targets: beam,
            alpha: 0,
            duration: 320,
            ease: 'Cubic.easeOut',
            onComplete: () => beam.destroy(),
        });

        const player = this.ctx.getPlayer();
        if (player.dead) {
            return;
        }
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const along = dx * Math.cos(this.laserAngle) + dy * Math.sin(this.laserAngle);
        const perp = Math.abs(-dx * Math.sin(this.laserAngle) + dy * Math.cos(this.laserAngle));
        if (along > 0 && along < 640 && perp < 12) {
            player.takeDamage(1, this.x, this.y);
        }
    }

    /** Boom moth: ring volley + close-range blast on death. */
    private explode(): void {
        for (let i = 0; i < 8; i += 1) {
            const angle = (Math.PI * 2 * i) / 8;
            this.ctx.fireTear(
                this.x,
                this.y,
                Math.cos(angle) * 150,
                Math.sin(angle) * 150,
                1
            );
        }
        const scene = this.ctx.scene;
        const ring = scene.add
            .image(this.x, this.y, TEX.glow)
            .setDepth(24)
            .setBlendMode('ADD')
            .setTint(0xff8a4a)
            .setScale(0.4)
            .setAlpha(0.9);
        scene.tweens.add({
            targets: ring,
            scale: 2.4,
            alpha: 0,
            duration: 320,
            onComplete: () => ring.destroy(),
        });

        const player = this.ctx.getPlayer();
        if (!player.dead && Math.hypot(player.x - this.x, player.y - this.y) < 58) {
            player.takeDamage(2, this.x, this.y);
        }
    }

    private revive(): void {
        this.stopIdleMotion();
        this.body.enable = false;
        this.sprite.setTint(0x6f8a58);
        this.ctx.scene.tweens.add({
            targets: this.sprite,
            scaleY: 0.35,
            duration: 220,
            ease: 'Cubic.easeOut',
        });
        this.ctx.scene.time.delayedCall(2400, () => {
            if (!this.sprite.active || this.dead) {
                return;
            }
            this.hp = Math.ceil(this.maxHp * 0.5);
            this.sprite.clearTint();
            this.sprite.setScale(1);
            this.sprite.setAlpha(1);
            this.body.enable = true;
            this.body.reset(this.x, this.y);
            this.startIdleMotion();
        });
    }

    private tickPoison(dt: number): void {
        if (this.poisonT <= 0) {
            this.poisonDps = 0;
            return;
        }
        this.poisonT -= dt;
        this.poisonAcc += dt;
        if (this.poisonAcc < 0.4) {
            return;
        }
        this.poisonAcc -= 0.4;
        this.sprite.setTint(0x7fd06a);
        this.ctx.scene.time.delayedCall(90, () => {
            if (this.sprite.active && !this.dead) {
                this.sprite.clearTint();
            }
        });
        this.takeTrueDamage(this.poisonDps * 0.4);
    }

    takeTrueDamage(amount: number): void {
        if (this.dead || !this.body.enable) {
            return;
        }
        this.hp -= amount;
        if (this.hp <= 0) {
            this.die();
        }
    }

    takeDamage(amount: number, fromX: number, fromY: number): void {
        if (this.dead || !this.body.enable) {
            return;
        }

        let applied = amount;
        if (this.kind === 'mask') {
            const angleToSource = Math.atan2(fromY - this.y, fromX - this.x);
            if (Math.abs(normalizeAngle(angleToSource - this.aim)) < Math.PI * 0.6) {
                applied *= 0.35;
            }
        }

        this.hp -= applied;
        this.sprite.setTint(0xffffff);
        this.ctx.scene.time.delayedCall(70, () => {
            if (this.sprite.active && !this.dead) {
                this.sprite.clearTint();
            }
        });

        if (this.leap <= 0) {
            const dx = this.x - fromX;
            const dy = this.y - fromY;
            const length = Math.hypot(dx, dy) || 1;
            this.body.velocity.x += (dx / length) * 120;
            this.body.velocity.y += (dy / length) * 120;
        }

        if (this.hp <= 0) {
            this.die();
        }
    }

    private die(): void {
        if (this.kind === 'doll' && !this.revived) {
            this.revived = true;
            this.hp = 0;
            this.revive();
            return;
        }

        this.stopIdleMotion();
        this.dead = true;
        this.body.enable = false;
        if (this.kind === 'boomMoth') {
            this.explode();
        }
        this.sprite.setTint(0xffe2c0).setTintMode(TintModes.FILL);
        this.ctx.scene.time.delayedCall(50, () => {
            if (this.sprite.active) {
                this.sprite.clearTint();
            }
        });
        this.ctx.scene.tweens.add({
            targets: [this.sprite, this.shadow],
            alpha: 0,
            scale: 0.6,
            duration: 260,
            ease: 'Cubic.easeIn',
            onComplete: () => {
                this.sprite.destroy();
                this.shadow.destroy();
            },
        });
        for (let i = 0; i < 5; i += 1) {
            const drop = this.ctx.scene.add
                .image(this.x, this.y, TEX.tear)
                .setDepth(39)
                .setTint(0x9a3a34)
                .setScale(0.35)
                .setAlpha(0.9);
            const angle = Math.random() * Math.PI * 2;
            const distance = 6 + Math.random() * 14;
            this.ctx.scene.tweens.add({
                targets: drop,
                x: this.x + Math.cos(angle) * distance,
                y: this.y + Math.sin(angle) * distance + 4,
                alpha: 0,
                duration: 300,
                onComplete: () => drop.destroy(),
            });
        }
        this.ctx.onDeath(this);
    }

    destroy(): void {
        this.ctx.scene.tweens.killTweensOf([this.sprite, this.shadow]);
        this.sprite.destroy();
        this.shadow.destroy();
    }
}
