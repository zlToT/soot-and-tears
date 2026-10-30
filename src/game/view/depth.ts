/**
 * Top-down draw order: actors and scenery sort by the Y of their base, so the
 * player can stand in front of / behind a rock without the head clipping over
 * it. The whole band stays below beams/effects and the HUD.
 */
export function actorDepth(baseY: number): number {
    return 20 + baseY * 0.1;
}
