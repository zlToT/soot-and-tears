/** Player-facing option flags shared by scenes and entities. */
export interface GameSettings {
    /** Camera shake on hits and explosions. */
    shake: boolean;
    /** Hit-stop freeze frames. */
    hitStop: boolean;
}

const KEY = 'soot-settings-v1';

export const settings: GameSettings = {
    shake: true,
    hitStop: true,
};

export function loadSettings(): void {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) {
            return;
        }
        const parsed = JSON.parse(raw) as Partial<GameSettings>;
        settings.shake = parsed.shake !== false;
        settings.hitStop = parsed.hitStop !== false;
    } catch {
        // Keep defaults when storage is unavailable or corrupt.
    }
}

export function saveSettings(): void {
    try {
        localStorage.setItem(KEY, JSON.stringify({ shake: settings.shake, hitStop: settings.hitStop }));
    } catch {
        // Ignore storage failures.
    }
}

/** Camera shake that honours the "screen shake" setting. */
export function shakeCamera(
    scene: import('phaser').Scene,
    duration: number,
    intensity: number
): void {
    if (!settings.shake) {
        return;
    }
    scene.cameras.main.shake(duration, intensity);
}
