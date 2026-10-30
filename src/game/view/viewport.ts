import type * as Phaser from 'phaser';
import { GAME_H, GAME_W } from '../const';

/**
 * The renderer runs at 2x the logical 640x360 grid. Every scene puts the main
 * camera at that zoom and centres it on the logical room, so world coordinates
 * stay 640x360 while the framebuffer holds twice the pixels.
 */
export const RENDER_SCALE = 2;

export function setupCamera(scene: Phaser.Scene): Phaser.Cameras.Scene2D.Camera {
    const camera = scene.cameras.main;
    camera.setZoom(RENDER_SCALE);
    camera.centerOn(GAME_W / 2, GAME_H / 2);
    return camera;
}
