import type * as Phaser from 'phaser';
import type { Dir } from '../types';
import { TEX } from '../const';

const ANGLE: Readonly<Record<Dir, number>> = {
    up: 0,
    right: 90,
    down: 180,
    left: 270,
};

export interface TearOptions {
    damage: number;
    range: number;
    speed: number;
    /** Degrees added to the shot direction (multishot fan). */
    angle?: number;
    size?: number;
    pierce?: number;
    bounces?: number;
    homing?: number;
    splits?: number;
    poison?: number;
    slow?: number;
    ghost?: boolean;
    crit?: number;
    blast?: number;
    boomerang?: boolean;
    farBonus?: number;
}

export interface TearTarget {
    x: number;
    y: number;
    dead?: boolean;
    /** Breakable scenery, only used by the light aim assist. */
    rock?: boolean;
}

function turnTo(current: number, target: number, maxDelta: number): number {
    let delta = target - current;
    while (delta > Math.PI) {
        delta -= Math.PI * 2;
    }
    while (delta < -Math.PI) {
        delta += Math.PI * 2;
    }
    return current + Math.max(-maxDelta, Math.min(maxDelta, delta));
}

export class TearManager {
    readonly group: Phaser.Physics.Arcade.Group;
    /** Scene-provided area damage used by explosive tears. */
    onBlast?: (x: number, y: number, radius: number, damage: number) => void;

    constructor(private readonly scene: Phaser.Scene) {
        this.group = scene.physics.add.group({
            allowGravity: false,
            immovable: false,
        });
    }

    spawn(
        x: number,
        y: number,
        dir: Dir,
        opts: TearOptions
    ): Phaser.Physics.Arcade.Sprite {
        const speed = opts.speed;
        const angle = ANGLE[dir] + (opts.angle ?? 0);
        const rad = ((angle - 90) * Math.PI) / 180;
        return this.spawnVelocity(
            x,
            y,
            Math.cos(rad) * speed,
            Math.sin(rad) * speed,
            opts.damage,
            true,
            opts.range / speed,
            angle,
            opts.size ?? 1,
            opts
        );
    }

    spawnVelocity(
        x: number,
        y: number,
        vx: number,
        vy: number,
        damage: number,
        fromPlayer: boolean,
        life = 0.95,
        angle = (Math.atan2(vy, vx) * 180) / Math.PI + 90,
        size = 1,
        opts: TearOptions = { damage, range: life * Math.hypot(vx, vy), speed: Math.hypot(vx, vy) }
    ): Phaser.Physics.Arcade.Sprite {
        const tear = this.group.create(x, y, TEX.tear) as Phaser.Physics.Arcade.Sprite;
        tear.setDepth(58);
        tear.setAngle(angle);
        tear.setData('damage', opts.damage);
        tear.setData('life', life);
        tear.setData('maxLife', life);
        tear.setData('speed', Math.hypot(vx, vy));
        tear.setData('fromPlayer', fromPlayer);
        tear.setData('assist', fromPlayer ? 1 : 0);
        tear.setData('spawnX', x);
        tear.setData('spawnY', y);
        tear.setData('pierce', opts.pierce ?? 0);
        tear.setData('bounces', opts.bounces ?? 0);
        tear.setData('homing', opts.homing ?? 0);
        tear.setData('splits', opts.splits ?? 0);
        tear.setData('poison', opts.poison ?? 0);
        tear.setData('slow', opts.slow ?? 0);
        tear.setData('ghost', opts.ghost ?? false);
        tear.setData('crit', opts.crit ?? 0);
        tear.setData('blast', opts.blast ?? 0);
        tear.setData('boomerang', opts.boomerang ?? false);
        tear.setData('farBonus', opts.farBonus ?? 0);
        tear.setData('hits', new Set<unknown>());
        tear.setData('age', 0);
        tear.setData('tear', true);
        tear.setScale((fromPlayer ? 1.1 : 0.95) * size);
        if (opts.ghost) {
            tear.setAlpha(0.72);
        }
        if (!fromPlayer) {
            tear.setTint(0xd97963);
        }
        if (opts.crit) {
            tear.setTint(0xffe0a0);
        }

        const body = tear.body as Phaser.Physics.Arcade.Body;
        const radius = Math.max(3, Math.round(3 * size));
        body.setCircle(radius, 1, 2);
        body.setAllowGravity(false);
        body.setVelocity(vx, vy);
        return tear;
    }

    /** Ghost tears pass rocks, but never the room shell. */
    readonly passesWalls = (object1: unknown, object2: unknown): boolean => {
        const first = object1 as Phaser.Physics.Arcade.Sprite;
        const second = object2 as Phaser.Physics.Arcade.Sprite;
        const tear = first?.getData?.('tear') === true ? first : second;
        const solid = (tear === first ? second : first) as {
            getData?: (key: string) => unknown;
        };
        if (!tear.getData('ghost')) {
            return true;
        }
        return solid?.getData?.('rockHp') === undefined;
    };

    update(dt: number, targets?: TearTarget[], owner?: { x: number; y: number }): void {
        for (const child of [...this.group.getChildren()]) {
            const tear = child as Phaser.Physics.Arcade.Sprite;
            if (!tear.active) {
                continue;
            }
            const body = tear.body as Phaser.Physics.Arcade.Body;
            const life = (tear.getData('life') as number) - dt;
            if (life <= 0) {
                this.pop(tear);
                continue;
            }
            tear.setData('life', life);
            tear.setData('age', (tear.getData('age') as number) + dt);
            tear.setData('vx', body.velocity.x);
            tear.setData('vy', body.velocity.y);

            this.steer(tear, body, dt, targets, owner);

            if (tear.x < -24 || tear.x > 664 || tear.y < -24 || tear.y > 384) {
                this.pop(tear);
            }
        }
    }

    private steer(
        tear: Phaser.Physics.Arcade.Sprite,
        body: Phaser.Physics.Arcade.Body,
        dt: number,
        targets?: TearTarget[],
        owner?: { x: number; y: number }
    ): void {
        const speed = Math.hypot(body.velocity.x, body.velocity.y);
        if (speed < 1) {
            return;
        }
        let tx: number | undefined;
        let ty: number | undefined;
        let turn = 0;

        const boomerang = tear.getData('boomerang') as boolean;
        if (boomerang && owner && (tear.getData('age') as number) > 0.42) {
            tx = owner.x;
            ty = owner.y;
            turn = 6;
            if (Math.hypot(tear.x - owner.x, tear.y - owner.y) < 16) {
                this.pop(tear);
                return;
            }
        } else {
            const homing = tear.getData('homing') as number;
            const assist = tear.getData('assist') as number;
            if ((homing > 0 || assist > 0) && targets && targets.length > 0) {
                const current = Math.atan2(body.velocity.y, body.velocity.x);
                let best = Infinity;
                for (const target of targets) {
                    if (target.dead) {
                        continue;
                    }
                    // Strong homing (item) sticks to living enemies; the light
                    // assist may also bend into breakable rocks.
                    if (homing > 0 && target.rock) {
                        continue;
                    }
                    if (assist > 0 && homing <= 0) {
                        // Gentle aim assist: only bend toward targets already
                        // within ±15° of the tear's flight direction.
                        let diff = Math.atan2(target.y - tear.y, target.x - tear.x) - current;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        if (Math.abs(diff) > Math.PI / 12) {
                            continue;
                        }
                    }
                    const dist = Math.hypot(target.x - tear.x, target.y - tear.y);
                    if (dist < best) {
                        best = dist;
                        tx = target.x;
                        ty = target.y;
                    }
                }
                turn = homing > 0 ? homing : 1.5;
            }
        }

        if (tx === undefined || ty === undefined) {
            return;
        }
        const current = Math.atan2(body.velocity.y, body.velocity.x);
        const wanted = Math.atan2(ty - tear.y, tx - tear.x);
        const next = turnTo(current, wanted, turn * dt);
        body.setVelocity(Math.cos(next) * speed, Math.sin(next) * speed);
        tear.setAngle((next * 180) / Math.PI + 90);
    }

    /** True when this tear has not hit the target yet. */
    hitOnce(tear: Phaser.Physics.Arcade.Sprite, target: unknown): boolean {
        const hits = tear.getData('hits') as Set<unknown>;
        if (hits.has(target)) {
            return false;
        }
        hits.add(target);
        return true;
    }

    /** Damage after distance scaling and critical roll. */
    rollDamage(tear: Phaser.Physics.Arcade.Sprite): { damage: number; crit: boolean } {
        const base = tear.getData('damage') as number;
        const far = (tear.getData('farBonus') as number) ?? 0;
        let damage = base;
        if (far > 0) {
            const dx = tear.x - (tear.getData('spawnX') as number);
            const dy = tear.y - (tear.getData('spawnY') as number);
            damage *= 1 + far * Math.min(1, Math.hypot(dx, dy) / 240);
        }
        const critChance = (tear.getData('crit') as number) ?? 0;
        const crit = critChance > 0 && Math.random() < critChance;
        return { damage: crit ? damage * 2 : damage, crit };
    }

    /** True when the tear may live through this hit. */
    pierceThrough(tear: Phaser.Physics.Arcade.Sprite): boolean {
        const left = (tear.getData('pierce') as number) ?? 0;
        if (left <= 0) {
            return false;
        }
        tear.setData('pierce', left - 1);
        return true;
    }

    /** Wall collision: bounce once more or pop. */
    onWall(tear: Phaser.Physics.Arcade.Sprite): void {
        if (!tear.active) {
            return;
        }
        const bounces = (tear.getData('bounces') as number) ?? 0;
        if (bounces <= 0) {
            this.pop(tear);
            return;
        }
        tear.setData('bounces', bounces - 1);
        const body = tear.body as Phaser.Physics.Arcade.Body;
        const speed = (tear.getData('speed') as number) ?? 120;
        const prevVx = (tear.getData('vx') as number) ?? body.velocity.x;
        const prevVy = (tear.getData('vy') as number) ?? body.velocity.y;
        let vx = body.velocity.x;
        let vy = body.velocity.y;
        if (body.blocked.left || prevVx < -1) {
            vx = Math.abs(speed);
        } else if (body.blocked.right || prevVx > 1) {
            vx = -Math.abs(speed);
        }
        if (body.blocked.up || prevVy < -1) {
            vy = Math.abs(speed);
        } else if (body.blocked.down || prevVy > 1) {
            vy = -Math.abs(speed);
        }
        if (Math.abs(vx) < 1 && Math.abs(vy) < 1) {
            vx = -prevVx;
            vy = -prevVy;
        }
        body.setVelocity(vx, vy);
        tear.setAngle((Math.atan2(vy, vx) * 180) / Math.PI + 90);
    }

    pop(tear: Phaser.Physics.Arcade.Sprite): void {
        if (!tear.active) {
            return;
        }
        const x = tear.x;
        const y = tear.y;
        const fromPlayer = tear.getData('fromPlayer') as boolean;
        const tint = fromPlayer
            ? tear.getData('crit')
                ? 0xffe0a0
                : 0xa9d4ef
            : 0xd97963;
        const blast = (tear.getData('blast') as number) ?? 0;
        const splits = (tear.getData('splits') as number) ?? 0;
        const damage = tear.getData('damage') as number;
        const poison = (tear.getData('poison') as number) ?? 0;
        const slow = (tear.getData('slow') as number) ?? 0;
        const crit = (tear.getData('crit') as number) ?? 0;
        const body = tear.body as Phaser.Physics.Arcade.Body;
        const vx = body?.velocity.x ?? 0;
        const vy = body?.velocity.y ?? 0;
        tear.destroy();

        if (blast > 0) {
            this.onBlast?.(x, y, blast, damage * 0.8);
            this.blastRing(x, y, blast, tint);
        }
        if (splits > 0 && fromPlayer) {
            const base = Math.atan2(vy, vx);
            for (let i = 0; i < splits; i += 1) {
                const spread = (i - (splits - 1) / 2) * 0.42;
                const speed = Math.max(90, Math.hypot(vx, vy) * 0.85);
                this.spawnVelocity(
                    x,
                    y,
                    Math.cos(base + spread) * speed,
                    Math.sin(base + spread) * speed,
                    damage * 0.55,
                    true,
                    0.45,
                    ((base + spread) * 180) / Math.PI + 90,
                    0.7,
                    {
                        damage: damage * 0.55,
                        range: speed * 0.45,
                        speed,
                        pierce: 0,
                        splits: 0,
                        poison,
                        slow,
                        crit,
                    }
                );
            }
        }
        this.splash(x, y, tint);
    }

    private blastRing(x: number, y: number, radius: number, tint: number): void {
        const ring = this.scene.add
            .circle(x, y, radius * 0.4, tint, 0.35)
            .setDepth(41)
            .setBlendMode('ADD');
        this.scene.tweens.add({
            targets: ring,
            radius: radius,
            alpha: 0,
            duration: 220,
            ease: 'Cubic.easeOut',
            onComplete: () => ring.destroy(),
        });
    }

    private splash(x: number, y: number, tint: number): void {
        for (let i = 0; i < 4; i += 1) {
            const drop = this.scene.add
                .image(x, y, TEX.tear)
                .setDepth(41)
                .setScale(0.45)
                .setTint(tint)
                .setAlpha(0.9);
            const angle = Math.random() * Math.PI * 2;
            const distance = 4 + Math.random() * 8;
            this.scene.tweens.add({
                targets: drop,
                x: x + Math.cos(angle) * distance,
                y: y + Math.sin(angle) * distance + 3,
                alpha: 0,
                scale: 0.2,
                duration: 180 + Math.random() * 80,
                ease: 'Cubic.easeOut',
                onComplete: () => drop.destroy(),
            });
        }
    }

    clear(): void {
        for (const child of [...this.group.getChildren()]) {
            child.destroy();
        }
    }
}
