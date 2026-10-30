import { AUTO, Game, Scale } from 'phaser';
import type * as Phaser from 'phaser';
import { GAME_H, GAME_W } from './game/const';
import { BootScene } from './game/scenes/BootScene';
import { MainMenuScene } from './game/scenes/MainMenuScene';
import { GameScene } from './game/scenes/GameScene';
import { RENDER_SCALE } from './game/view/viewport';

/**
 * The game logic stays on a 640x360 grid, but the framebuffer renders at
 * RENDER_SCALE (2x) so glyph atlases land on real screen pixels instead of
 * being upscaled. The canvas is then shown at a whole-pixel CSS multiple.
 */
function fitZoom(): number {
    const baseW = GAME_W * RENDER_SCALE;
    const baseH = GAME_H * RENDER_SCALE;
    const available = Math.min(window.innerWidth / baseW, window.innerHeight / baseH);
    if (available >= 1) {
        return Math.floor(available);
    }
    return Math.max(0.5, Math.round(available * 20) / 20);
}

const config: Phaser.Types.Core.GameConfig = {
    type: AUTO,
    parent: 'game-container',
    width: GAME_W * RENDER_SCALE,
    height: GAME_H * RENDER_SCALE,
    backgroundColor: '#0b0806',
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    scale: {
        mode: Scale.NONE,
        autoCenter: Scale.NO_CENTER,
        autoRound: true,
        width: GAME_W * RENDER_SCALE,
        height: GAME_H * RENDER_SCALE,
        zoom: fitZoom(),
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 0 },
            debug: false,
            fps: 60,
        },
    },
    scene: [BootScene, MainMenuScene, GameScene],
};

const game = new Game(config);

function applyZoom(): void {
    const zoom = fitZoom();
    game.scale.setZoom(zoom);
    if (game.canvas) {
        game.canvas.style.imageRendering = zoom < 1 ? 'auto' : 'pixelated';
    }
}

applyZoom();
window.addEventListener('resize', applyZoom);
