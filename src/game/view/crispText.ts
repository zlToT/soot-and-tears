import { Textures } from 'phaser';
import type * as Phaser from 'phaser';
import { RENDER_SCALE } from './viewport';

/**
 * Text is rasterised at the framebuffer's render scale, so a glyph lands on the
 * exact pixels the camera will draw. At resolution 1 the camera's 2x zoom would
 * magnify an already-soft atlas.
 */
export function crispText<T extends Phaser.GameObjects.Text>(
    text: T,
    resolution = RENDER_SCALE
): T {
    text.setResolution(resolution);
    text.texture.setFilter(Textures.FilterMode.NEAREST);
    for (const source of text.texture.source) {
        source.setFilter(Textures.FilterMode.NEAREST);
    }
    return text;
}

/** Applies {@link crispText} to every Text child a container owns. */
export function crispContainer(container: Phaser.GameObjects.Container): void {
    for (const child of container.list) {
        if ((child as { type?: string }).type === 'Text') {
            crispText(child as Phaser.GameObjects.Text);
        }
    }
}

/**
 * Big display type reads better supersampled and sampled linearly; the glyph
 * stays smooth at 1x, which is what the title screen wants.
 */
export function softText<T extends Phaser.GameObjects.Text>(
    text: T,
    resolution = RENDER_SCALE
): T {
    text.setResolution(resolution);
    text.texture.setFilter(Textures.FilterMode.LINEAR);
    for (const source of text.texture.source) {
        source.setFilter(Textures.FilterMode.LINEAR);
    }
    return text;
}
