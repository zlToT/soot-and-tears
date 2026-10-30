import type * as Phaser from 'phaser';
import type { Dir, InputState } from '../types';

const ORDER: readonly Dir[] = ['up', 'down', 'left', 'right'];

/**
 * Keyboard: WASD moves, arrow keys cast. Arrow keys are tracked as a stack so
 * the most recently pressed direction wins, matching the reference feel.
 */
export class KeyboardInput {
    private readonly keys: Record<string, Phaser.Input.Keyboard.Key> = {};
    private readonly held: Dir[] = [];
    private bombQueued = false;

    constructor(private readonly scene: Phaser.Scene) {
        const keyboard = scene.input.keyboard;
        if (!keyboard) {
            return;
        }
        const codes: Record<string, number> = {
            W: 87,
            A: 65,
            S: 83,
            D: 68,
            UP: 38,
            DOWN: 40,
            LEFT: 37,
            RIGHT: 39,
            Q: 81,
        };
        for (const [name, code] of Object.entries(codes)) {
            this.keys[name] = keyboard.addKey(code, true, false);
        }
        for (const dir of ORDER) {
            const key = this.keys[dir.toUpperCase()];
            key?.on('down', () => this.push(dir));
            key?.on('up', () => this.release(dir));
        }
        this.keys.Q?.on('down', () => {
            this.bombQueued = true;
        });
    }

    /** True once per key press. */
    consumeBomb(): boolean {
        const queued = this.bombQueued;
        this.bombQueued = false;
        return queued;
    }

    private push(dir: Dir): void {
        const index = this.held.indexOf(dir);
        if (index >= 0) {
            this.held.splice(index, 1);
        }
        this.held.push(dir);
    }

    private release(dir: Dir): void {
        const index = this.held.indexOf(dir);
        if (index >= 0) {
            this.held.splice(index, 1);
        }
    }

    sample(): InputState {
        const down = (name: string) => this.keys[name]?.isDown === true;
        const mx = (down('D') ? 1 : 0) - (down('A') ? 1 : 0);
        const my = (down('S') ? 1 : 0) - (down('W') ? 1 : 0);
        const length = Math.hypot(mx, my);
        return {
            mx: length > 0 ? mx / length : 0,
            my: length > 0 ? my / length : 0,
            shootDir: this.held.length > 0 ? this.held[this.held.length - 1] : null,
        };
    }

    destroy(): void {
        for (const key of Object.values(this.keys)) {
            key.removeAllListeners();
        }
    }

    get sceneRef(): Phaser.Scene {
        return this.scene;
    }
}
