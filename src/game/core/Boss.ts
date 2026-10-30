import type * as Phaser from 'phaser';
import type { BossKind, EnemyKind } from '../types';
import { BOSS_STATS, PLAY_BOTTOM, PLAY_RIGHT, PLAY_X, PLAY_Y, TEX } from '../const';
import type { Player } from './Player';
import { shakeCamera } from './settings';
import { actorDepth } from '../view/depth';

export interface BossContext {
    scene: Phaser.Scene;
    getPlayer: () => Player;
    fireTear: (x: number, y: number, vx: number, vy: number, damage: number, size?: number) => void;
    summon: (kind: EnemyKind, x: number, y: number) => void;
    onDeath: (boss: Boss) => void;
}

const TEXTURE: Readonly<Record<BossKind, string>> = {
    granny: TEX.bossGranny,
    flyking: TEX.bossFlyking,
    tumor: TEX.bossTumor,
    grandpa: TEX.bossGrandpa,
    chandelier: TEX.bossChandelier,
    drain: TEX.bossDrainHead,
    greedgut: TEX.bossGreedgutHead,
    attic: TEX.bossAttic,
    armor: TEX.bossArmorHead,
    hush: TEX.bossHush,
    pitlord: TEX.bossPitlord,
    pale: TEX.bossPale,
    nameless: TEX.bossNameless,
};

const NAME: Readonly<Record<BossKind, string>> = {
    granny: '锅炉奶奶',
    flyking: '蝇王',
    tumor: '肉瘤墙',
    grandpa: '锅炉爷爷',
    chandelier: '心脏吊灯',
    drain: '排水管虫',
    greedgut: '贪吃囊',
    attic: '阁楼腿',
    armor: '装甲蛆',
    hush: '静默者',
    pitlord: '深井之主',
    pale: '白袍人',
    nameless: '无名',
};

interface SegmentConfig {
    count: number;
    spacing: number;
    texture: string;
    radius: number;
}

const PHASE_ACTIONS: Partial<Record<BossKind, ReadonlyArray<ReadonlyArray<string>>>> = {
    pitlord: [['fan'], ['sweep', 'ring'], ['slam', 'summon', 'ring']],
    pale: [['fan10'], ['cross'], ['charge', 'fan10']],
    nameless: [['fan10', 'summon'], ['cross', 'ring'], ['slam', 'charge', 'cross']],
    tumor: [['fan', 'ring', 'summon', 'fan']],
    chandelier: [['ring', 'curtain', 'spiral', 'summon']],
};

const SEGMENTS: Partial<Record<BossKind, SegmentConfig>> = {
    drain: { count: 4, spacing: 18, texture: TEX.bossDrainBody, radius: 13 },
    greedgut: { count: 2, spacing: 27, texture: TEX.bossGreedgutBody, radius: 17 },
    armor: { count: 3, spacing: 20, texture: TEX.bossArmorBody, radius: 13 },
};

type BossState =
    | 'intro'
    | 'walk'
    | 'crouch'
    | 'leap'
    | 'spit'
    | 'float'
    | 'ring'
    | 'summon'
    | 'dashWind'
    | 'dash'
    | 'idle'
    | 'windup'
    | 'spiral'
    | 'slide'
    | 'stomp'
    | 'landed'
    | 'retract'
    | 'retreat'
    | 'slamWarn'
    | 'chargeWind'
    | 'charge';

function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value;
}

/** Bosses are heavyweight: no knockback, contact damage only when aggro. */
export class Boss {
    readonly kind: BossKind;
    readonly name: string;
    readonly sprite: Phaser.Physics.Arcade.Sprite;
    readonly shadow: Phaser.GameObjects.Image;
    readonly radius: number;
    readonly contact: number;
    readonly maxHp: number;

    hp: number;
    dead = false;
    aggro = false;
    phase = 1;

    private readonly speed: number;
    private readonly visualScale: number;
    private readonly hitRadius: number;
    private tailGlow?: Phaser.GameObjects.Image;
    private readonly scene: Phaser.Scene;
    private state: BossState = 'intro';
    private timer = 0.9;
    private sub = 0;
    private subStep = 0;
    private pending = '';
    private aim = 0;
    private enraged = false;
    private readonly segments: Array<{ sprite: Phaser.GameObjects.Sprite; radius: number }> = [];
    private readonly segmentSpacing: number;
    private tailTimer = 3.2;
    private target?: { x: number; y: number };
    private teleports = 0;

    constructor(
        private readonly ctx: BossContext,
        kind: BossKind,
        x: number,
        y: number,
        hpScale = 1
    ) {
        const stats = BOSS_STATS[kind];
        this.kind = kind;
        this.name = NAME[kind];
        this.radius = stats.radius;
        this.contact = stats.contact;
        this.speed = stats.speed;
        this.visualScale = stats.scale;
        this.hitRadius = stats.radius * stats.scale;
        this.hp = Math.round(stats.hp * hpScale);
        this.maxHp = this.hp;
        this.scene = ctx.scene;
        const segmentDef = SEGMENTS[kind];
        this.segmentSpacing = segmentDef ? segmentDef.spacing : 24;

        this.shadow = this.scene.add
            .image(x, y + 24, TEX.shadow)
            .setDepth(19)
            .setScale(2.4)
            .setAlpha(0.7);

        this.sprite = this.scene.physics.add.sprite(x, y, TEXTURE[kind]);
        this.sprite.setDepth(26);
        const body = this.sprite.body as Phaser.Physics.Arcade.Body;
        body.setCircle(this.radius, this.sprite.width / 2 - this.radius, this.sprite.height / 2 - this.radius);
        body.setAllowGravity(false);
        body.setDrag(0, 0);

        this.sprite.setScale(0.2).setAlpha(1);
        this.scene.tweens.add({
            targets: this.sprite,
            scale: this.visualScale,
            alpha: 1,
            duration: 800,
            ease: 'Back.easeOut',
        });

        const animKey = `anim_${TEXTURE[kind]}`;
        if (this.scene.anims.exists(animKey)) {
            this.sprite.play(animKey);
        }

        if (segmentDef) {
            for (let i = 0; i < segmentDef.count; i += 1) {
                const segment = this.scene.add
                    .sprite(x, y + (i + 1) * segmentDef.spacing, segmentDef.texture)
                    .setDepth(25)
                    .setScale(this.visualScale)
                    .setAlpha(0);
                const segmentAnim = `anim_${segmentDef.texture}`;
                if (this.scene.anims.exists(segmentAnim)) {
                    segment.play(segmentAnim);
                }
                this.segments.push({
                    sprite: segment,
                    radius: segmentDef.radius * this.visualScale,
                });
                this.scene.tweens.add({
                    targets: segment,
                    alpha: 1,
                    duration: 400,
                    delay: 80 * i,
                });
            }
        }

        if (kind === 'armor') {
            this.tailGlow = this.scene.add
                .image(x, y, TEX.glow)
                .setDepth(40)
                .setBlendMode('ADD')
                .setTint(0xffd060)
                .setScale(0.55)
                .setVisible(false);
        }
    }

    /** True when the point is inside the head or any body segment. */
    hitTest(x: number, y: number): boolean {
        if (this.kind === 'armor') {
            if (this.state !== 'slide' || this.segments.length === 0) {
                return false;
            }
            const tail = this.segments[this.segments.length - 1];
            return Math.hypot(x - tail.sprite.x, y - tail.sprite.y) < tail.radius + 8;
        }
        if (Math.hypot(x - this.x, y - this.y) < this.hitRadius) {
            return true;
        }
        for (const segment of this.segments) {
            if (Math.hypot(x - segment.sprite.x, y - segment.sprite.y) < segment.radius) {
                return true;
            }
        }
        return false;
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

    get active(): boolean {
        return !this.dead;
    }

    /** True while the entrance animation plays; the boss cannot be damaged. */
    get entering(): boolean {
        return this.state === 'intro';
    }

    update(dt: number): void {
        this.sprite.setDepth(actorDepth(this.y + 18));
        for (const segment of this.segments) {
            segment.sprite.setDepth(actorDepth(segment.sprite.y + 10));
        }
        if (this.dead) {
            return;
        }
        const player = this.ctx.getPlayer();
        if (!player || player.dead) {
            this.body.setVelocity(0, 0);
            return;
        }

        this.timer -= dt;
        switch (this.kind) {
            case 'granny':
                this.updateGranny(dt, player);
                break;
            case 'flyking':
                this.updateFlyking(dt, player);
                break;
            case 'grandpa':
                this.updateGrandpa(dt, player);
                break;
            case 'drain':
                this.updateDrain(dt, player);
                break;
            case 'greedgut':
                this.updateGreedgut(dt, player);
                break;
            case 'attic':
                this.updateAttic(dt, player);
                break;
            case 'armor':
                this.updateArmor(dt, player);
                break;
            case 'hush':
                this.updateHush(dt, player);
                break;
            default:
                this.updateFixed(dt, player);
                break;
        }

        const clampedX = clamp(this.sprite.x, PLAY_X + this.radius, PLAY_RIGHT - this.radius);
        const clampedY = clamp(this.sprite.y, PLAY_Y + this.radius, PLAY_BOTTOM - this.radius);
        if (clampedX !== this.sprite.x || clampedY !== this.sprite.y) {
            const vx = this.body.velocity.x;
            const vy = this.body.velocity.y;
            this.body.reset(clampedX, clampedY);
            this.body.setVelocity(vx, vy);
        }
        this.shadow.setPosition(this.x, this.y + 24);
        this.updateSegments();
    }

    private updateSegments(): void {
        let prevX = this.x;
        let prevY = this.y;
        for (const segment of this.segments) {
            const dx = prevX - segment.sprite.x;
            const dy = prevY - segment.sprite.y;
            const length = Math.hypot(dx, dy) || 1;
            const x = clamp(prevX - (dx / length) * this.segmentSpacing, PLAY_X + 10, PLAY_RIGHT - 10);
            const y = clamp(prevY - (dy / length) * this.segmentSpacing, PLAY_Y + 10, PLAY_BOTTOM - 10);
            segment.sprite.setPosition(x, y);
            prevX = x;
            prevY = y;
        }
    }

    // --- Boiler Granny ------------------------------------------------------

    private updateGranny(_dt: number, player: Player): void {
        const body = this.body;
        switch (this.state) {
            case 'intro':
                if (this.timer <= 0) {
                    this.enterWalk(0.8);
                }
                break;
            case 'walk': {
                const dx = player.x - this.x;
                const dy = player.y - this.y;
                const distance = Math.hypot(dx, dy) || 1;
                const speed = this.speed * (this.enraged ? 1.5 : 1);
                body.setVelocity((dx / distance) * speed, (dy / distance) * speed);
                if (this.timer <= 0) {
                    if (distance > 120 && Math.random() < 0.65) {
                        this.startCrouch();
                    } else {
                        this.startSpit();
                    }
                }
                break;
            }
            case 'crouch':
                body.setVelocity(0, 0);
                if (this.timer <= 0) {
                    this.startLeap(player);
                }
                break;
            case 'leap':
                if (this.timer <= 0) {
                    this.land();
                }
                break;
            case 'spit':
                body.setVelocity(0, 0);
                if (this.timer <= 0) {
                    this.fireSpread(player.x, player.y, 3, 0.28, 175);
                    this.sub += 1;
                    if (this.sub >= 3) {
                        this.sprite.clearTint();
                        this.enterWalk(0.9);
                    } else {
                        this.timer = 0.18;
                    }
                }
                break;
            default:
                break;
        }
    }

    private enterWalk(delay: number): void {
        this.state = 'walk';
        this.timer = delay;
        this.aggro = false;
    }

    private startCrouch(): void {
        this.state = 'crouch';
        this.timer = 0.55;
        this.sprite.setTint(0xffb090);
        this.scene.tweens.add({
            targets: this.sprite,
            scaleY: this.visualScale * 0.78,
            duration: 220,
            ease: 'Quad.easeOut',
        });
    }

    private startLeap(player: Player): void {
        this.sprite.clearTint();
        this.scene.tweens.add({ targets: this.sprite, scaleY: this.visualScale, duration: 160 });
        this.state = 'leap';
        this.timer = 0.4;
        this.aggro = true;
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const length = Math.hypot(dx, dy) || 1;
        this.body.setVelocity((dx / length) * 300, (dy / length) * 300);
    }

    private land(): void {
        this.aggro = false;
        this.body.setVelocity(0, 0);
        shakeCamera(this.scene, 220, 0.006);
        this.shockwave(10, 170, 1);
        this.enterWalk(1.1);
    }

    private startSpit(): void {
        this.state = 'spit';
        this.timer = 0.5;
        this.sub = 0;
        this.sprite.setTint(0xffd0a0);
    }

    // --- Fly King -----------------------------------------------------------

    private updateFlyking(_dt: number, player: Player): void {
        const body = this.body;
        switch (this.state) {
            case 'intro':
                if (this.timer <= 0) {
                    this.enterFloat(0.9);
                }
                break;
            case 'float': {
                const dx = player.x - this.x;
                const dy = player.y - this.y;
                const distance = Math.hypot(dx, dy) || 1;
                const nx = dx / distance;
                const ny = dy / distance;
                const want = distance < 150 ? -1 : distance > 230 ? 1 : 0;
                const speed = this.speed * (this.enraged ? 1.35 : 1);
                this.aim += 1.4 * _dt;
                const wobble = Math.sin(this.aim) * 40;
                body.setVelocity(
                    nx * speed * want - ny * wobble,
                    ny * speed * want + nx * wobble
                );
                if (this.timer <= 0) {
                    if (this.sub % 3 === 0) {
                        this.startRing();
                    } else if (this.sub % 3 === 1) {
                        this.startSummon();
                    } else {
                        this.startDashWind(player);
                    }
                    this.sub += 1;
                }
                break;
            }
            case 'ring':
                body.setVelocity(0, 0);
                if (this.timer <= 0) {
                    this.sprite.clearTint();
                    this.shockwave(12, 150, 1);
                    this.enterFloat(1);
                }
                break;
            case 'summon':
                body.setVelocity(0, 0);
                if (this.timer <= 0) {
                    this.sprite.clearTint();
                    this.spawnMinions();
                    this.enterFloat(1.2);
                }
                break;
            case 'dashWind':
                body.setVelocity(0, 0);
                if (this.timer <= 0) {
                    this.sprite.clearTint();
                    this.state = 'dash';
                    this.timer = 0.4;
                    this.aggro = true;
                    const dx = player.x - this.x;
                    const dy = player.y - this.y;
                    const length = Math.hypot(dx, dy) || 1;
                    this.body.setVelocity((dx / length) * 330, (dy / length) * 330);
                }
                break;
            case 'dash':
                if (this.timer <= 0) {
                    this.aggro = false;
                    this.enterFloat(1.1);
                }
                break;
            default:
                break;
        }
    }

    private enterFloat(delay: number): void {
        this.state = 'float';
        this.timer = delay;
        this.aggro = false;
    }

    private startRing(): void {
        this.state = 'ring';
        this.timer = 0.5;
        this.sprite.setTint(0xffd0a0);
    }

    private startSummon(): void {
        this.state = 'summon';
        this.timer = 0.5;
        this.sprite.setTint(0x9ed0ff);
    }

    private startDashWind(player: Player): void {
        this.state = 'dashWind';
        this.timer = 0.35;
        this.sprite.setTint(0xffa090);
        void player;
    }

    private spawnMinions(kind: EnemyKind = 'moth'): void {
        for (let i = 0; i < 2; i += 1) {
            const angle = Math.random() * Math.PI * 2;
            this.ctx.summon(
                kind,
                clamp(this.x + Math.cos(angle) * 70, PLAY_X + 20, PLAY_RIGHT - 20),
                clamp(this.y + Math.sin(angle) * 70, PLAY_Y + 20, PLAY_BOTTOM - 20)
            );
        }
    }

    // --- segmented worms ----------------------------------------------------

    private updateDrain(dt: number, player: Player): void {
        const body = this.body;
        if (this.state === 'intro') {
            if (this.timer > 0) {
                return;
            }
            this.state = 'walk';
            this.timer = 0;
        }
        this.aggro = true;
        this.tailTimer -= dt;
        if (this.tailTimer <= 0) {
            this.tailTimer = 3.2;
            const tail = this.segments[this.segments.length - 1];
            const ox = tail ? tail.sprite.x : this.x;
            const oy = tail ? tail.sprite.y : this.y;
            for (let i = 0; i < 10; i += 1) {
                const angle = (Math.PI * 2 * i) / 10;
                this.ctx.fireTear(
                    ox,
                    oy,
                    Math.cos(angle) * 130,
                    Math.sin(angle) * 130,
                    1
                );
            }
        }

        if (this.timer > 0) {
            return;
        }
        this.timer = 1.5;

        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const margin = 48;
        const options: Array<[number, number]> = [];
        if (this.x < PLAY_RIGHT - margin) {
            options.push([1, 0]);
        }
        if (this.x > PLAY_X + margin) {
            options.push([-1, 0]);
        }
        if (this.y < PLAY_BOTTOM - margin) {
            options.push([0, 1]);
        }
        if (this.y > PLAY_Y + margin) {
            options.push([0, -1]);
        }
        if (options.length === 0) {
            return;
        }

        let choice = options[0];
        let best = -Infinity;
        for (const option of options) {
            const score = option[0] * dx + option[1] * dy + Math.random() * 60;
            if (score > best) {
                best = score;
                choice = option;
            }
        }
        body.setVelocity(choice[0] * this.speed, choice[1] * this.speed);
    }

    private updateGreedgut(_dt: number, player: Player): void {
        const body = this.body;
        const dx = player.x - this.x;
        const dy = player.y - this.y;

        if (this.state === 'intro') {
            body.setVelocity(0, 0);
            if (this.timer <= 0) {
                this.enterWalk(0.4);
            }
            return;
        }

        if (this.state === 'windup') {
            body.setVelocity(0, 0);
            if (this.timer <= 0) {
                this.sprite.clearTint();
                this.state = 'dash';
                this.timer = 0.5;
                this.aggro = true;
                const axisX = Math.abs(dy) < 34;
                const vx = axisX ? Math.sign(dx) * 320 : 0;
                const vy = !axisX && Math.abs(dx) < 34 ? Math.sign(dy) * 320 : 0;
                body.setVelocity(vx, vy);
            }
            return;
        }

        if (this.state === 'dash') {
            const hitWall =
                this.x <= PLAY_X + this.radius + 2 ||
                this.x >= PLAY_RIGHT - this.radius - 2 ||
                this.y <= PLAY_Y + this.radius + 2 ||
                this.y >= PLAY_BOTTOM - this.radius - 2;
            if (this.timer <= 0 || hitWall) {
                this.aggro = false;
                body.setVelocity(0, 0);
                this.shockwave(12, 150, 1);
                this.spawnMinions();
                shakeCamera(this.scene, 160, 0.004);
                this.enterWalk(1.3);
            }
            return;
        }

        const distance = Math.hypot(dx, dy) || 1;
        body.setVelocity((dx / distance) * this.speed, (dy / distance) * this.speed);
        if (this.timer <= 0) {
            if (Math.abs(dy) < 40 || Math.abs(dx) < 40) {
                this.state = 'windup';
                this.timer = 0.55;
                this.sprite.setTint(0xffb090);
            } else {
                this.timer = 0.35;
            }
        }
    }

    // --- Attic Leg ----------------------------------------------------------

    private updateAttic(dt: number, player: Player): void {
        const body = this.body;
        switch (this.state) {
            case 'intro':
                if (this.timer <= 0) {
                    this.backToIdle(0.8);
                }
                break;
            case 'idle':
                body.setVelocity(0, 0);
                if (this.timer <= 0) {
                    this.state = 'windup';
                    this.timer = 0.7;
                    this.target = { x: player.x, y: player.y };
                    this.sprite.setTint(0xffb090);
                    this.showMarker(player.x, player.y);
                }
                break;
            case 'windup':
                body.setVelocity(0, 0);
                if (this.timer <= 0) {
                    this.sprite.clearTint();
                    this.state = 'stomp';
                    this.aggro = true;
                }
                break;
            case 'stomp': {
                const tx = this.target ? this.target.x : this.x;
                const ty = this.target ? this.target.y : PLAY_BOTTOM - 60;
                const ny = Math.min(ty, this.y + 1600 * dt);
                this.body.reset(tx, ny);
                if (ny >= ty - 2) {
                    this.state = 'landed';
                    this.timer = 0.7;
                    shakeCamera(this.scene, 220, 0.007);
                    this.shockwave(8, 140, 1);
                }
                break;
            }
            case 'landed':
                body.setVelocity(0, 0);
                this.aggro = true;
                if (this.timer <= 0) {
                    this.aggro = false;
                    this.state = 'retract';
                }
                break;
            case 'retract': {
                const home = PLAY_Y + 60;
                const ny = Math.max(home, this.y - 1300 * dt);
                this.body.reset(this.x, ny);
                if (ny <= home + 2) {
                    this.backToIdle(1.4);
                }
                break;
            }
            default:
                break;
        }
    }

    private showMarker(x: number, y: number): void {
        const ring = this.scene.add.graphics().setDepth(6);
        ring.lineStyle(2, 0xd0503c, 0.9);
        ring.strokeEllipse(x, y, 42, 26);
        this.scene.tweens.add({
            targets: ring,
            alpha: 0,
            duration: 750,
            onComplete: () => ring.destroy(),
        });
    }

    // --- Armor Grub ---------------------------------------------------------

    private updateArmor(_dt: number, player: Player): void {
        const body = this.body;
        switch (this.state) {
            case 'intro':
                this.backToIdle(0.6);
                break;
            case 'idle':
                body.setVelocity(0, 0);
                this.sprite.setAlpha(0.3);
                if (this.timer <= 0) {
                    this.sprite.setAlpha(1);
                    const x = clamp(player.x, PLAY_X + 60, PLAY_RIGHT - 60);
                    const y = clamp(player.y - 80, PLAY_Y + 60, PLAY_BOTTOM - 60);
                    this.body.reset(x, y);
                    this.state = 'slide';
                    this.timer = 2.2;
                    this.aggro = true;
                    const dx = player.x - this.x;
                    const dy = player.y - this.y;
                    const length = Math.hypot(dx, dy) || 1;
                    this.body.setVelocity(
                        (dx / length) * this.speed,
                        (dy / length) * this.speed
                    );
                }
                break;
            case 'slide':
                if (this.timer <= 0) {
                    this.aggro = false;
                    this.backToIdle(0.85);
                }
                break;
            default:
                this.backToIdle(0.5);
                break;
        }
        if (this.tailGlow) {
            const tail = this.segments[this.segments.length - 1];
            this.tailGlow.setVisible(this.state === 'slide' && !!tail);
            if (tail) {
                this.tailGlow
                    .setPosition(tail.sprite.x, tail.sprite.y)
                    .setAlpha(0.38 + 0.22 * Math.sin(this.scene.time.now / 120));
            }
        }
    }

    // --- The Hush -----------------------------------------------------------

    private updateHush(dt: number, player: Player): void {
        if (this.state === 'retreat') {
            this.body.setVelocity(0, 0);
            if (this.timer <= 0) {
                this.sprite.setAlpha(1);
                this.body.reset(
                    PLAY_X + 90 + Math.random() * (PLAY_RIGHT - PLAY_X - 180),
                    PLAY_Y + 80
                );
                this.backToIdle(0.4);
            }
            return;
        }
        this.updateFixed(dt, player);
    }
    // --- fixed bosses (Tumor Wall / Heart Chandelier) -----------------------

    private updateFixed(dt: number, player: Player): void {
        const body = this.body;
        if (this.kind === 'chandelier') {
            this.aim += dt * 0.9;
            body.setVelocity(Math.sin(this.aim) * 30, Math.sin(this.aim * 0.7) * 14);
        } else {
            body.setVelocity(0, 0);
        }

        switch (this.state) {
            case 'intro':
                if (this.timer <= 0) {
                    this.backToIdle(1);
                }
                break;
            case 'idle':
                if (this.timer <= 0) {
                    this.chooseFixedAction();
                }
                break;
            case 'windup':
                if (this.timer <= 0) {
                    this.runFixedAction(player);
                }
                break;
            case 'spiral':
                if (this.timer <= 0) {
                    this.fireSpiralStep(player);
                }
                break;
            case 'slamWarn':
                body.setVelocity(0, 0);
                if (this.timer <= 0) {
                    const tx = clamp(this.target?.x ?? this.x, PLAY_X + 40, PLAY_RIGHT - 40);
                    const ty = clamp(this.target?.y ?? this.y, PLAY_Y + 40, PLAY_BOTTOM - 40);
                    this.body.reset(tx, ty);
                    this.sprite.clearTint();
                    this.shockwave(12, 170, 1);
                    if (Math.hypot(player.x - this.x, player.y - this.y) < 46) {
                        player.takeDamage(this.contact, this.x, this.y);
                    }
                    shakeCamera(this.scene, 180, 0.006);
                    this.spawnMinions(this.kind === 'pitlord' ? 'boomMoth' : 'moth');
                    this.backToIdle(1.1);
                }
                break;
            case 'chargeWind':
                body.setVelocity(0, 0);
                if (this.timer <= 0) {
                    this.sprite.clearTint();
                    this.state = 'charge';
                    this.timer = 0.55;
                    this.aggro = true;
                    const dx = (this.target?.x ?? player.x) - this.x;
                    const dy = (this.target?.y ?? player.y) - this.y;
                    const length = Math.hypot(dx, dy) || 1;
                    body.setVelocity((dx / length) * 380, (dy / length) * 380);
                }
                break;
            case 'charge': {
                const hitWall =
                    this.x <= PLAY_X + this.radius + 2 ||
                    this.x >= PLAY_RIGHT - this.radius - 2 ||
                    this.y <= PLAY_Y + this.radius + 2 ||
                    this.y >= PLAY_BOTTOM - this.radius - 2;
                if (this.timer <= 0 || hitWall) {
                    this.aggro = false;
                    body.setVelocity(0, 0);
                    this.shockwave(10, 150, 1);
                    shakeCamera(this.scene, 140, 0.004);
                    this.backToIdle(1);
                }
                break;
            }
            default:
                break;
        }
    }

    private chooseFixedAction(): void {
        const phases = PHASE_ACTIONS[this.kind];
        if (phases) {
            const list = phases[Math.min(this.phase, 3) - 1];
            this.pending = list[this.sub % list.length];
            this.sub += 1;
            this.state = 'windup';
            this.timer = 0.55;
            this.sprite.setTint(0xffd0a0);
            return;
        }
        const step = this.sub % (this.kind === 'tumor' ? 4 : 3);
        this.sub += 1;
        if (this.kind === 'tumor') {
            this.pending = step === 2 ? 'ring' : step === 3 ? 'summon' : 'fan';
        } else if (this.kind === 'hush') {
            this.pending = step === 0 ? 'ring' : step === 1 ? 'curtain' : 'spiral';
        } else {
            this.pending = step === 0 ? 'ring' : step === 1 ? 'spiral' : 'curtain';
        }
        this.state = 'windup';
        this.timer = this.enraged ? 0.4 : 0.55;
        this.sprite.setTint(0xffd0a0);
    }

    private runFixedAction(player: Player): void {
        this.sprite.clearTint();
        switch (this.pending) {
            case 'fan':
                this.fireSpread(player.x, player.y, 5, 0.22, 165);
                this.backToIdle(1.2);
                break;
            case 'ring':
                this.shockwave(14, 150, 1);
                this.backToIdle(1.4);
                break;
            case 'summon':
                this.spawnMinions();
                this.backToIdle(1.6);
                break;
            case 'curtain':
                this.fireSpread(player.x, player.y, 5, 0.16, 175);
                this.fireSpread(player.x, player.y, 5, 0.16, 215);
                this.backToIdle(1.3);
                break;
            case 'laser':
                this.fireBeam(Math.atan2(player.y - this.y, player.x - this.x));
                this.backToIdle(1);
                break;
            case 'fan10':
                this.fireSpread(player.x, player.y, 10, 0.12, 140);
                this.backToIdle(1.3);
                break;
            case 'sweep': {
                const base = Math.atan2(player.y - this.y, player.x - this.x);
                for (const offset of [-0.55, -0.2, 0.2, 0.55]) {
                    this.fireBeam(base + offset);
                }
                this.backToIdle(1.2);
                break;
            }
            case 'cross': {
                const base = Math.atan2(player.y - this.y, player.x - this.x);
                const count = this.kind === 'nameless' ? 6 : 4;
                for (let i = 0; i < count; i += 1) {
                    this.fireBeam(base + (i * Math.PI * 2) / count);
                }
                this.backToIdle(1.2);
                break;
            }
            case 'slam': {
                this.state = 'slamWarn';
                this.timer = 0.65;
                this.target = { x: player.x, y: player.y };
                this.sprite.setTint(0xff7040);
                const warn = this.scene.add
                    .circle(player.x, player.y, 12, 0xff4020, 0.12)
                    .setStrokeStyle(2, 0xff8060, 0.9)
                    .setDepth(6);
                this.scene.tweens.add({
                    targets: warn,
                    radius: 32,
                    alpha: 0,
                    duration: 700,
                    ease: 'Cubic.easeOut',
                    onComplete: () => warn.destroy(),
                });
                break;
            }
            case 'charge': {
                this.state = 'chargeWind';
                this.timer = 0.45;
                this.target = {
                    x: player.x + player.body.velocity.x * 0.25,
                    y: player.y + player.body.velocity.y * 0.25,
                };
                this.sprite.setTint(0xffa060);
                break;
            }
            case 'spiral':
                this.state = 'spiral';
                this.timer = 0;
                this.subStep = 0;
                this.aim = Math.atan2(player.y - this.y, player.x - this.x);
                break;
            default:
                this.backToIdle(1);
                break;
        }
    }

    private fireSpiralStep(_player: Player): void {
        this.aim += 0.32;
        const speed = 140;
        this.ctx.fireTear(this.x, this.y, Math.cos(this.aim) * speed, Math.sin(this.aim) * speed, 1);
        this.ctx.fireTear(
            this.x,
            this.y,
            Math.cos(this.aim + Math.PI) * speed,
            Math.sin(this.aim + Math.PI) * speed,
            1
        );
        this.subStep += 1;
        if (this.subStep >= 10) {
            this.backToIdle(1.1);
        } else {
            this.timer = 0.08;
        }
    }

    private backToIdle(delay: number): void {
        this.state = 'idle';
        this.timer = delay;
        this.aggro = false;
    }

    // --- Boiler Grandpa -----------------------------------------------------

    private updateGrandpa(_dt: number, player: Player): void {
        const body = this.body;
        switch (this.state) {
            case 'intro':
                if (this.timer <= 0) {
                    this.enterWalk(0.8);
                }
                break;
            case 'walk': {
                const dx = player.x - this.x;
                const dy = player.y - this.y;
                const distance = Math.hypot(dx, dy) || 1;
                const speed = this.speed * (this.enraged ? 1.5 : 1);
                body.setVelocity((dx / distance) * speed, (dy / distance) * speed);
                if (this.timer <= 0) {
                    if (distance > 110) {
                        this.state = 'crouch';
                        this.timer = 0.45;
                        this.sub = 0;
                        this.sprite.setTint(0xffb090);
                    } else {
                        this.state = 'windup';
                        this.timer = 0.7;
                        this.pending = 'laser';
                        this.sprite.setTint(0xffa090);
                    }
                }
                break;
            }
            case 'crouch':
                body.setVelocity(0, 0);
                if (this.timer <= 0) {
                    this.sprite.clearTint();
                    this.state = 'leap';
                    this.timer = 0.32;
                    this.aggro = true;
                    const dx = player.x - this.x;
                    const dy = player.y - this.y;
                    const length = Math.hypot(dx, dy) || 1;
                    this.body.setVelocity((dx / length) * 320, (dy / length) * 320);
                }
                break;
            case 'leap':
                if (this.timer <= 0) {
                    this.aggro = false;
                    body.setVelocity(0, 0);
                    shakeCamera(this.scene, 200, 0.005);
                    this.shockwave(8, 160, 1);
                    this.sub += 1;
                    if (this.sub < 2) {
                        this.state = 'crouch';
                        this.timer = 0.32;
                        this.sprite.setTint(0xffb090);
                    } else {
                        this.enterWalk(1.1);
                    }
                }
                break;
            case 'windup':
                body.setVelocity(0, 0);
                if (this.timer <= 0) {
                    this.sprite.clearTint();
                    this.fireBeam(Math.atan2(player.y - this.y, player.x - this.x));
                    this.enterWalk(1.3);
                }
                break;
            default:
                break;
        }
    }

    private fireBeam(angle: number): void {
        const scene = this.scene;
        const length = 900;
        const endX = this.x + Math.cos(angle) * length;
        const endY = this.y + Math.sin(angle) * length;
        const beam = scene.add.graphics().setDepth(28);
        beam.lineStyle(6, 0x8c2a22, 0.5);
        beam.lineBetween(this.x, this.y, endX, endY);
        beam.lineStyle(2, 0xffc0a0, 0.95);
        beam.lineBetween(this.x, this.y, endX, endY);
        scene.tweens.add({
            targets: beam,
            alpha: 0,
            duration: 350,
            onComplete: () => beam.destroy(),
        });

        const player = this.ctx.getPlayer();
        if (player.dead) {
            return;
        }
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const along = dx * Math.cos(angle) + dy * Math.sin(angle);
        const perp = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
        if (along > 0 && along < 700 && perp < 14) {
            player.takeDamage(this.contact - 1, this.x, this.y);
        }
    }

    // --- shared attacks -----------------------------------------------------

    private fireSpread(
        targetX: number,
        targetY: number,
        count: number,
        spread: number,
        speed: number
    ): void {
        const base = Math.atan2(targetY - this.y, targetX - this.x);
        for (let i = 0; i < count; i += 1) {
            const angle = base + (i - (count - 1) / 2) * spread;
            this.ctx.fireTear(this.x, this.y + 4, Math.cos(angle) * speed, Math.sin(angle) * speed, 1);
        }
    }

    private shockwave(count: number, speed: number, size: number): void {
        for (let i = 0; i < count; i += 1) {
            const angle = (Math.PI * 2 * i) / count;
            this.ctx.fireTear(
                this.x,
                this.y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                1,
                size
            );
        }
    }

    takeDamage(amount: number, fromX: number, fromY: number): void {
        if (this.dead) {
            return;
        }
        if (this.kind === 'armor') {
            if (this.state !== 'slide' || this.segments.length === 0) {
                return;
            }
            const tail = this.segments[this.segments.length - 1];
            if (Math.hypot(fromX - tail.sprite.x, fromY - tail.sprite.y) > tail.radius + 6) {
                return;
            }
        }
        this.hp -= amount;
        if (this.kind === 'pitlord' || this.kind === 'pale' || this.kind === 'nameless') {
            const ratio = this.hp / this.maxHp;
            this.phase = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
        }
        if (this.kind === 'hush' && this.hp > 0) {
            const stages = [0.75, 0.5, 0.25];
            const ratio = this.hp / this.maxHp;
            if (this.teleports < stages.length && ratio <= stages[this.teleports]) {
                this.teleports += 1;
                this.state = 'retreat';
                this.timer = 0.7;
                this.sprite.setAlpha(0.35);
                this.aggro = false;
                this.body.setVelocity(0, 0);
            }
        }
        this.sprite.setTint(0xffffff);
        this.scene.time.delayedCall(70, () => {
            if (this.sprite.active && !this.dead && !this.enraged) {
                this.sprite.clearTint();
            }
        });

        if (!this.enraged && this.hp <= this.maxHp * 0.5) {
            this.enraged = true;
            this.phase = 2;
            this.sprite.setScale(this.visualScale * 1.06);
            this.scene.cameras.main.flash(180, 90, 20, 10);
        }
        if (this.hp <= 0) {
            this.die();
        }
    }

    private die(): void {
        this.dead = true;
        this.aggro = false;
        this.body.enable = false;
        shakeCamera(this.scene, 400, 0.01);
        for (const segment of this.segments) {
            const target = segment.sprite;
            this.scene.tweens.add({
                targets: target,
                alpha: 0,
                duration: 500,
                onComplete: () => target.destroy(),
            });
        }
        this.segments.length = 0;
        const burst = this.scene.add
            .image(this.x, this.y, TEX.glow)
            .setDepth(40)
            .setBlendMode('ADD')
            .setTint(0xff8a4a)
            .setScale(0.6)
            .setAlpha(0.9);
        this.scene.tweens.add({
            targets: burst,
            scale: 4,
            alpha: 0,
            duration: 500,
            onComplete: () => burst.destroy(),
        });
        this.scene.tweens.add({
            targets: [this.sprite, this.shadow],
            alpha: 0,
            scale: this.visualScale * 1.1,
            duration: 700,
            ease: 'Cubic.easeIn',
            onComplete: () => {
                this.sprite.destroy();
                this.shadow.destroy();
            },
        });
        this.ctx.onDeath(this);
    }

    destroy(): void {
        for (const segment of this.segments) {
            segment.sprite.destroy();
        }
        this.segments.length = 0;
        this.scene.tweens.killTweensOf([this.sprite, this.shadow]);
        this.tailGlow?.destroy();
        this.sprite.destroy();
        this.shadow.destroy();
    }
}
