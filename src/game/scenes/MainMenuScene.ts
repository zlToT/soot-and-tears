import { Scene } from 'phaser';
import { GAME_H, GAME_W, TEX } from '../const';
import { mulberry32 } from '../core/rng';
import { latestSlotIndex, readSlots, type SaveData } from '../core/save';
import { crispText, softText } from '../view/crispText';
import { setupCamera } from '../view/viewport';

interface MenuButton {
    container: Phaser.GameObjects.Container;
    graphics: Phaser.GameObjects.Graphics;
    label: Phaser.GameObjects.Text;
    enabled: boolean;
    hovered: boolean;
    width: number;
    height: number;
    primary: boolean;
}

/**
 * Title screen: project name, short pitch, controls, and the two entry points
 * the run needs — start a new descent or resume a saved checkpoint.
 */
export class MainMenuScene extends Scene {
    private slots: Array<SaveData | null> = [];
    private buttons: MenuButton[] = [];
    private leaving = false;
    private titleText!: Phaser.GameObjects.Text;
    private note?: Phaser.GameObjects.Text;
    private noteTween?: Phaser.Tweens.Tween;

    constructor() {
        super('MainMenuScene');
    }

    create(): void {
        this.slots = readSlots();
        this.buttons = [];
        this.leaving = false;
        setupCamera(this);
        this.cameras.main.setBackgroundColor(0x0b0806);

        this.buildBackground();
        this.buildTitle();
        this.buildHero();
        this.buildButtons();
        this.buildFooter();
        for (const child of this.children.list) {
            if ((child as { type?: string }).type === 'Text') {
                crispText(child as Phaser.GameObjects.Text);
            }
        }
        softText(this.titleText);

        this.input.keyboard?.on('keydown-ENTER', this.onPrimaryKey, this);
        this.input.keyboard?.on('keydown-SPACE', this.onPrimaryKey, this);
        this.input.keyboard?.on('keydown-C', this.onContinueKey, this);
        this.input.keyboard?.on('keydown-ONE', this.onSlotOne, this);
        this.input.keyboard?.on('keydown-TWO', this.onSlotTwo, this);
        this.input.keyboard?.on('keydown-THREE', this.onSlotThree, this);
        this.events.once('shutdown', this.onShutdown, this);

        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
            const api = {
                start: () => this.startNew(),
                continueLatest: () => this.continueLatest(),
                continueSlot: (slot: number) => this.continueWith(slot),
                state: () => ({
                    slots: this.slots.map((slot) => (slot ? slot.level : null)),
                }),
                scene: this,
            };
            (window as unknown as { __sootMenu?: typeof api }).__sootMenu = api;
        }
    }

    private buildBackground(): void {
        this.add.rectangle(0, 0, GAME_W, GAME_H, 0x0b0806).setOrigin(0).setDepth(0);

        this.add
            .tileSprite(0, 0, GAME_W, GAME_H, TEX.wall)
            .setOrigin(0)
            .setDepth(1)
            .setAlpha(0.5)
            .setTint(0x8a6a4a);

        const shade = this.add.graphics().setDepth(2);
        shade.fillStyle(0x070403, 0.85);
        shade.fillRect(0, 0, GAME_W, 110);
        shade.fillStyle(0x070403, 0.72);
        shade.fillRect(0, 236, GAME_W, GAME_H - 236);
        shade.fillStyle(0x070403, 0.35);
        shade.fillRect(0, 110, GAME_W, 126);

        // Dried blood and soot blotches, deterministic per visit.
        const rand = mulberry32(20261030);
        const stains = this.add.graphics().setDepth(3);
        for (let i = 0; i < 26; i += 1) {
            stains.fillStyle(rand() < 0.5 ? 0x3a120c : 0x241a12, 0.05 + rand() * 0.08);
            stains.fillEllipse(
                rand() * GAME_W,
                rand() * GAME_H,
                24 + rand() * 90,
                10 + rand() * 34
            );
        }

        for (const [x, tint] of [
            [110, 0xffa060],
            [530, 0xff8a50],
        ] as const) {
            const glow = this.add
                .image(x, 150, TEX.glow)
                .setDepth(4)
                .setBlendMode('ADD')
                .setTint(tint)
                .setScale(2.6)
                .setAlpha(0.22);
            this.tweens.add({
                targets: glow,
                alpha: 0.34,
                scale: 2.9,
                duration: 1400 + Math.random() * 500,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
        }

        this.add.image(0, 0, TEX.vignette).setOrigin(0).setDepth(60).setAlpha(0.95);
    }

    private buildTitle(): void {
        this.titleText = this.add
            .text(GAME_W / 2, 34, 'SOOT & TEARS', {
                fontFamily: 'Georgia, "Times New Roman", "Microsoft YaHei", serif',
                fontSize: '38px',
                fontStyle: 'bold',
                color: '#f2c98e',
                stroke: '#2a160c',
                strokeThickness: 3,
                shadow: { offsetX: 0, offsetY: 3, color: '#000000', blur: 6, fill: true },
            })
            .setOrigin(0.5, 0)
            .setDepth(20);
        this.add
            .text(GAME_W / 2, 80, '煤 与 泪', {
                fontFamily: 'Microsoft YaHei, Georgia, serif',
                fontSize: '16px',
                color: '#e8d2a8',
            })
            .setOrigin(0.5, 0)
            .setDepth(20)
            .setResolution(2);
        this.add
            .text(GAME_W / 2, 100, '煤灰覆面，泪流成路。往下走，别回头。', {
                fontFamily: 'Microsoft YaHei, Consolas, monospace',
                fontSize: '10px',
                color: '#b09472',
            })
            .setOrigin(0.5, 0)
            .setDepth(20)
            .setResolution(2);
    }

    private buildHero(): void {
        const x = GAME_W / 2;
        const y = 178;
        const pool = this.add.graphics().setDepth(11);
        pool.fillStyle(0x5a1412, 0.35);
        pool.fillEllipse(x + 4, y + 32, 104, 22);
        pool.fillStyle(0x2a4a66, 0.22);
        pool.fillEllipse(x - 26, y + 35, 54, 14);

        this.add
            .image(x, y + 22, TEX.shadow)
            .setDepth(12)
            .setScale(2.8)
            .setAlpha(0.55);

        const hero = this.add
            .image(x, y, TEX.hero('down', 0))
            .setDepth(14)
            .setScale(2.6);
        this.tweens.add({
            targets: hero,
            y: y - 2,
            duration: 1500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });

        // Drifting embers around the character.
        const rand = mulberry32(731);
        for (let i = 0; i < 12; i += 1) {
            const ember = this.add
                .image(x + (rand() - 0.5) * 190, y + 40 + rand() * 50, TEX.glow)
                .setDepth(13)
                .setBlendMode('ADD')
                .setTint(0xffb070)
                .setScale(0.05 + rand() * 0.06)
                .setAlpha(0.25);
            this.tweens.add({
                targets: ember,
                y: ember.y - 40 - rand() * 30,
                alpha: 0,
                duration: 2200 + rand() * 1800,
                delay: rand() * 1800,
                repeat: -1,
                ease: 'Sine.easeOut',
            });
        }
    }

    private buildButtons(): void {
        const best = latestSlotIndex(this.slots);
        this.makeButton(320, 246, 196, 30, '开始探索', undefined, () => this.startNew(), true, true);

        const continueLabel =
            best >= 0 ? `继续游戏 · B${(this.slots[best] as SaveData).level}` : '继续游戏 · 暂无存档';
        this.makeButton(
            320,
            282,
            196,
            26,
            continueLabel,
            undefined,
            () => this.continueLatest(),
            best >= 0,
            false
        );

        for (let slot = 0; slot < 3; slot += 1) {
            const save = this.slots[slot];
            this.makeButton(
                230 + slot * 90,
                314,
                80,
                22,
                save ? `槽${slot + 1} · B${save.level}` : `槽${slot + 1} · 空`,
                undefined,
                () => this.continueWith(slot),
                save !== null,
                false
            );
        }
    }

    private buildFooter(): void {
        const controls =
            'WASD 移动　·　↑↓←→ 射击　·　Q 炸弹　·　P 暂停　·　手机端使用虚拟摇杆';
        this.add
            .text(GAME_W / 2, 332, controls, {
                fontFamily: 'Microsoft YaHei, Consolas, monospace',
                fontSize: '9px',
                color: '#c8b088',
            })
            .setOrigin(0.5, 0)
            .setDepth(20)
            .setResolution(2);
        this.add
            .text(GAME_W / 2, 346, 'Enter 开始　·　C 继续最新存档　·　1-3 读取槽位', {
                fontFamily: 'Microsoft YaHei, Consolas, monospace',
                fontSize: '8px',
                color: '#8a7054',
            })
            .setOrigin(0.5, 0)
            .setDepth(20)
            .setResolution(2);

        this.note = this.add
            .text(GAME_W / 2, 314, '暂无存档', {
                fontFamily: 'Microsoft YaHei, Consolas, monospace',
                fontSize: '10px',
                color: '#f0cf7a',
                backgroundColor: 'rgba(20,14,10,0.9)',
                padding: { x: 8, y: 4 },
            })
            .setOrigin(0.5)
            .setDepth(70)
            .setResolution(2)
            .setVisible(false);
    }

    private makeButton(
        x: number,
        y: number,
        width: number,
        height: number,
        label: string,
        sublabel: string | undefined,
        onClick: () => void,
        enabled: boolean,
        primary: boolean
    ): MenuButton {
        const container = this.add.container(x, y).setDepth(30);
        const graphics = this.add.graphics();
        const text = crispText(
            this.add
                .text(0, sublabel ? -4 : 0, label, {
                    fontFamily: 'Microsoft YaHei, Consolas, monospace',
                    fontSize: primary ? '13px' : '11px',
                    fontStyle: primary ? 'bold' : 'normal',
                    color: primary ? '#f6e2b6' : '#e0d0b0',
                })
                .setOrigin(0.5)
        );
        const children: Phaser.GameObjects.GameObject[] = [graphics, text];
        if (sublabel) {
            children.push(
                crispText(
                    this.add
                        .text(0, 8, sublabel, {
                            fontFamily: 'Microsoft YaHei, Consolas, monospace',
                            fontSize: '8px',
                            color: '#a89070',
                        })
                        .setOrigin(0.5)
                )
            );
        }
        const hit = this.add
            .rectangle(0, 0, width, height, 0xffffff, 0.001)
            .setInteractive({ useHandCursor: enabled });
        children.push(hit);
        container.add(children);

        const button: MenuButton = {
            container,
            graphics,
            label: text,
            enabled,
            hovered: false,
            width,
            height,
            primary,
        };
        this.drawButton(button);
        hit.on('pointerover', () => {
            button.hovered = true;
            this.drawButton(button);
        });
        hit.on('pointerout', () => {
            button.hovered = false;
            this.drawButton(button);
        });
        hit.on('pointerdown', () => {
            if (!button.enabled) {
                this.flashNote('这个槽位还没有存档');
                return;
            }
            onClick();
        });
        this.buttons.push(button);
        return button;
    }

    private drawButton(button: MenuButton): void {
        const { graphics, width, height, enabled, hovered, primary } = button;
        const alpha = enabled ? 1 : 0.5;
        graphics.clear();
        const fill = primary
            ? hovered
                ? 0x5c3a1c
                : 0x402814
            : hovered
              ? 0x35241a
              : 0x261a12;
        graphics.fillStyle(fill, 0.96 * alpha);
        graphics.fillRoundedRect(-width / 2, -height / 2, width, height, 5);
        graphics.lineStyle(1, primary ? 0xc49352 : 0x6b4a2c, (hovered ? 1 : 0.8) * alpha);
        graphics.strokeRoundedRect(-width / 2 + 0.5, -height / 2 + 0.5, width - 1, height - 1, 5);
        graphics.lineStyle(1, 0xffe6b0, 0.08 * alpha);
        graphics.lineBetween(-width / 2 + 7, -height / 2 + 3, width / 2 - 7, -height / 2 + 3);
        button.label.setAlpha(enabled ? 1 : 0.55);
    }

    private flashNote(message: string): void {
        if (!this.note) {
            return;
        }
        this.note.setText(message).setVisible(true).setAlpha(1);
        this.noteTween?.stop();
        this.noteTween = this.tweens.add({
            targets: this.note,
            alpha: 0,
            delay: 900,
            duration: 350,
            onComplete: () => this.note?.setVisible(false),
        });
    }

    private startNew(): void {
        if (this.leaving) {
            return;
        }
        this.leaving = true;
        this.leaveTo({ mode: 'new' });
    }

    private continueLatest(): void {
        const best = latestSlotIndex(this.slots);
        if (best < 0) {
            this.flashNote('暂无存档，先开始一局');
            return;
        }
        this.continueWith(best);
    }

    private continueWith(slot: number): void {
        if (this.leaving) {
            return;
        }
        if (!this.slots[slot]) {
            this.flashNote('这个槽位还没有存档');
            return;
        }
        this.leaving = true;
        this.leaveTo({ mode: 'continue', continueSlot: slot });
    }

    private leaveTo(data: { mode: 'new' | 'continue'; continueSlot?: number }): void {
        this.cameras.main.fadeOut(160, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
            this.scene.start('GameScene', data);
        });
    }

    private readonly onPrimaryKey = (): void => this.startNew();

    private readonly onContinueKey = (): void => this.continueLatest();

    private readonly onSlotOne = (): void => this.continueWith(0);

    private readonly onSlotTwo = (): void => this.continueWith(1);

    private readonly onSlotThree = (): void => this.continueWith(2);

    private readonly onShutdown = (): void => {
        this.input.keyboard?.off('keydown-ENTER', this.onPrimaryKey, this);
        this.input.keyboard?.off('keydown-SPACE', this.onPrimaryKey, this);
        this.input.keyboard?.off('keydown-C', this.onContinueKey, this);
        this.input.keyboard?.off('keydown-ONE', this.onSlotOne, this);
        this.input.keyboard?.off('keydown-TWO', this.onSlotTwo, this);
        this.input.keyboard?.off('keydown-THREE', this.onSlotThree, this);
        this.noteTween?.stop();
        const api = (window as unknown as { __sootMenu?: unknown }).__sootMenu;
        if (api) {
            delete (window as unknown as { __sootMenu?: unknown }).__sootMenu;
        }
    };
}
