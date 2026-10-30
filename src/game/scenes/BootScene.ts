import { Scene } from 'phaser';
import { ANIMATED_TEXTURES, ASSET_MANIFEST, AUDIO_MANIFEST, DIRS, TEX } from '../const';
import { setupCamera } from '../view/viewport';

export class BootScene extends Scene {
    constructor() {
        super('BootScene');
    }

    preload(): void {
        const label = this.add
            .text(320, 180, 'LOADING', {
                fontFamily: 'Consolas, monospace',
                fontSize: '10px',
                color: '#8a7054',
            })
            .setOrigin(0.5);
        this.load.on('complete', () => label.destroy());
        for (const asset of ASSET_MANIFEST) {
            this.load.image(asset.key, asset.path);
        }
        for (const asset of AUDIO_MANIFEST) {
            this.load.audio(asset.key, asset.path);
        }
    }

    create(): void {
        setupCamera(this);
        for (const dir of DIRS) {
            this.anims.create({
                key: `walk_${dir}`,
                frames: [
                    { key: TEX.hero(dir, 0) },
                    { key: TEX.hero(dir, 1) },
                ],
                frameRate: 8,
                repeat: -1,
            });
        }
        // Generated 3-frame loops for every enemy and boss head.
        for (const { key, rate } of ANIMATED_TEXTURES) {
            this.anims.create({
                key: `anim_${key}`,
                frames: [
                    { key },
                    { key: `${key}_1` },
                    { key: `${key}_2` },
                    { key: `${key}_1` },
                ],
                frameRate: rate,
                repeat: -1,
            });
        }
        this.scene.start('MainMenuScene');
    }
}
