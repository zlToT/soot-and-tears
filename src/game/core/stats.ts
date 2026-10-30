import { PLAYER } from '../const';

/** All numbers that items are allowed to change. */
export interface Stats {
    // Raw attributes.
    damage: number;
    fireRate: number;
    speed: number;
    range: number;
    shotSpeed: number;
    maxHp: number;
    luck: number;

    // Shot shape.
    tears: number;
    spread: number;
    tearSize: number;

    // Tear behaviours.
    pierce: number;
    bounces: number;
    homing: number;
    splits: number;
    poison: number;
    slow: number;
    ghost: boolean;
    crit: number;
    blast: number;
    boomerang: boolean;
    farBonus: number;
    firstBonus: number;
    beam: boolean;

    // Survival and side effects.
    aura: number;
    turrets: number;
    shields: number;
    armor: number;
    revives: number;
    magnet: number;
    retaliate: number;
}

export const BASE_STATS: Readonly<Stats> = {
    damage: PLAYER.damage,
    fireRate: PLAYER.fireRate,
    speed: PLAYER.speed,
    range: PLAYER.range,
    shotSpeed: PLAYER.shotSpeed,
    maxHp: PLAYER.maxHp,
    luck: 0,

    tears: 0,
    spread: 0,
    tearSize: 1,

    pierce: 0,
    bounces: 0,
    homing: 0,
    splits: 0,
    poison: 0,
    slow: 0,
    ghost: false,
    crit: 0,
    blast: 0,
    boomerang: false,
    farBonus: 0,
    firstBonus: 0,
    beam: false,

    aura: 0,
    turrets: 0,
    shields: 0,
    armor: 0,
    revives: 0,
    magnet: 0,
    retaliate: 0,
};
