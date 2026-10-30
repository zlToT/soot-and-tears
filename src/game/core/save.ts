/**
 * Floor-checkpoint saves shared by the main menu and the game scene.
 * Slot files live in localStorage as `{ sum, data }`, where `sum` is a cheap
 * integrity checksum so hand-edited saves are thrown away.
 */
export interface SaveData {
    v: 1;
    level: number;
    hp: number;
    kills: number;
    coins: number;
    bombs: number;
    keys: number;
    runTime: number;
    items: string[];
    heartBonus: number;
}

export const SAVE_SLOT_COUNT = 3;

const SAVE_PREFIX = 'soot-save-v2-slot';
const LEGACY_SAVE_KEY = 'soot-save-v1';

export function slotKey(slot: number): string {
    return `${SAVE_PREFIX}${slot}`;
}

export function checksum(text: string): number {
    let hash = 5381;
    for (let i = 0; i < text.length; i += 1) {
        hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
    }
    return hash;
}

export function readSlot(slot: number): SaveData | null {
    try {
        const raw = localStorage.getItem(slotKey(slot));
        if (!raw) {
            return null;
        }
        const file = JSON.parse(raw) as { sum?: number; data?: SaveData };
        if (!file.data || typeof file.sum !== 'number') {
            return null;
        }
        if (checksum(JSON.stringify(file.data)) !== file.sum) {
            localStorage.removeItem(slotKey(slot));
            return null;
        }
        const data = file.data;
        if (data.v !== 1 || !Number.isFinite(data.level) || data.level < 2 || data.level > 15) {
            return null;
        }
        return data;
    } catch {
        return null;
    }
}

export function readSlots(count = SAVE_SLOT_COUNT): Array<SaveData | null> {
    return Array.from({ length: count }, (_, slot) => readSlot(slot));
}

export function writeSlot(slot: number, data: SaveData): void {
    try {
        const body = JSON.stringify(data);
        localStorage.setItem(slotKey(slot), JSON.stringify({ sum: checksum(body), data }));
    } catch {
        // Ignore storage failures.
    }
}

export function removeSlot(slot: number): void {
    try {
        localStorage.removeItem(slotKey(slot));
    } catch {
        // Ignore storage failures.
    }
}

/** The deepest checkpoint wins when the menu offers a single "continue". */
export function latestSlotIndex(slots: ReadonlyArray<SaveData | null>): number {
    let best = -1;
    for (let i = 0; i < slots.length; i += 1) {
        const slot = slots[i];
        if (slot && (best < 0 || slot.level > (slots[best] as SaveData).level)) {
            best = i;
        }
    }
    return best;
}

/** Moves a pre-slot save into slot 0 and drops the legacy key. */
export function migrateLegacySave(): void {
    try {
        const legacy = localStorage.getItem(LEGACY_SAVE_KEY);
        if (!legacy) {
            return;
        }
        const data = JSON.parse(legacy) as SaveData;
        if (data && data.v === 1 && data.level >= 2) {
            writeSlot(0, data);
        }
        localStorage.removeItem(LEGACY_SAVE_KEY);
    } catch {
        try {
            localStorage.removeItem(LEGACY_SAVE_KEY);
        } catch {
            // Ignore storage failures.
        }
    }
}
