import type { HookContext, ItemDef, ItemHook, Visual } from './items';
import { BASE_STATS, type Stats } from './stats';

/** Taken items plus the stats they add up to. */
export class Inventory {
    readonly items: ItemDef[] = [];
    readonly stats: Stats = { ...BASE_STATS };
    readonly visuals = new Set<Visual>();
    /** Extra max HP bought from shops or chests (not an item slot). */
    private heartBonus = 0;

    add(item: ItemDef): void {
        if (this.items.some((owned) => owned.id === item.id)) {
            return;
        }
        this.items.push(item);
        this.recompute();
    }

    /** Removes one item and recalculates every derived stat. */
    remove(id: string): boolean {
        const index = this.items.findIndex((item) => item.id === id);
        if (index < 0) {
            return false;
        }
        this.items.splice(index, 1);
        this.recompute();
        return true;
    }

    addHeartBonus(amount: number): void {
        this.heartBonus += amount;
        this.recompute();
    }

    get extraHearts(): number {
        return this.heartBonus;
    }

    /** Wipes the inventory, used when resuming a saved run. */
    reset(): void {
        this.items.length = 0;
        this.heartBonus = 0;
        this.recompute();
    }

    has(id: string): boolean {
        return this.items.some((item) => item.id === id);
    }

    run(hook: ItemHook, ctx: HookContext): void {
        for (const item of this.items) {
            item.hooks?.[hook]?.(ctx);
        }
    }

    private recompute(): void {
        Object.assign(this.stats, BASE_STATS);
        this.visuals.clear();
        for (const item of this.items) {
            item.apply?.(this.stats);
            if (item.visual) {
                this.visuals.add(item.visual);
            }
        }
        this.stats.maxHp += this.heartBonus;
    }
}
