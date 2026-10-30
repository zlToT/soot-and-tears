import type * as Phaser from 'phaser';
import { AUDIO_MANIFEST, SFX, type SfxName } from '../const';

/** Tiny wrapper: throttles repeated sounds and tolerates missing assets. */
export class Sfx {
    private readonly last = new Map<string, number>();
    private readonly missing = new Set<string>();

    constructor(private readonly scene: Phaser.Scene) {
        for (const entry of AUDIO_MANIFEST) {
            if (!scene.cache.audio.exists(entry.key)) {
                this.missing.add(entry.key);
            }
        }
    }

    play(name: SfxName, volume = 0.2, minGap = 0.03): void {
        const key = SFX[name];
        if (this.missing.has(key)) {
            return;
        }
        const now = this.scene.time.now;
        const last = this.last.get(key) ?? -1e9;
        if (now - last < minGap * 1000) {
            return;
        }
        this.last.set(key, now);
        this.scene.sound.play(key, { volume });
    }
}
