import type * as Phaser from 'phaser';
import type { InputState } from '../types';
import { KeyboardInput } from './KeyboardInput';
import { TouchControls } from './TouchControls';

/** Merges keyboard and touch into the single input shape the core consumes. */
export class InputManager {
    private readonly keyboard: KeyboardInput;
    private readonly touch: TouchControls;
    private enabled = true;

    constructor(scene: Phaser.Scene) {
        this.keyboard = new KeyboardInput(scene);
        this.touch = new TouchControls();
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (!enabled) {
            this.keyboard.sample();
        }
    }

    sample(): InputState {
        if (!this.enabled) {
            return { mx: 0, my: 0, shootDir: null };
        }
        const keyboard = this.keyboard.sample();
        const touch = this.touch.sample();
        const hasTouchMove = touch.mx !== 0 || touch.my !== 0;
        return {
            mx: hasTouchMove ? touch.mx : keyboard.mx,
            my: hasTouchMove ? touch.my : keyboard.my,
            shootDir: touch.shootDir ?? keyboard.shootDir,
        };
    }

    /** Edge-triggered bomb request from keyboard or the touch button. */
    consumeBomb(): boolean {
        if (!this.enabled) {
            return false;
        }
        return this.touch.consumeBomb() || this.keyboard.consumeBomb();
    }

    /** Edge-triggered pause request from the touch button. */
    consumePause(): boolean {
        if (!this.enabled) {
            return false;
        }
        return this.touch.consumePause();
    }

    destroy(): void {
        this.keyboard.destroy();
        this.touch.destroy();
    }
}
