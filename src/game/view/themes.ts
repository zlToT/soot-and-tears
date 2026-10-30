/** One palette per floor, so B1–B15 read as different zones. */
export interface FloorTheme {
    floor: number;
    wall: number;
    torch: number;
    ash: number;
}

export const FLOOR_THEMES: readonly FloorTheme[] = [
    { floor: 0x9a7a58, wall: 0x8a7054, torch: 0xffb060, ash: 0xffa060 },
    { floor: 0x8a8a84, wall: 0x72726e, torch: 0xa8c8e0, ash: 0x9ab0c0 },
    { floor: 0x9a6250, wall: 0x824f40, torch: 0xff8a60, ash: 0xff7a50 },
    { floor: 0x6f8a58, wall: 0x5c7448, torch: 0x9ae070, ash: 0x8ac060 },
    { floor: 0x5a708a, wall: 0x4a5f74, torch: 0x9ad0ff, ash: 0x90c0e0 },
    { floor: 0x7a5a8a, wall: 0x664a74, torch: 0xd0a0ff, ash: 0xc090e0 },
    { floor: 0x9a8a48, wall: 0x827440, torch: 0xffe080, ash: 0xe0c060 },
    { floor: 0x4a8a8a, wall: 0x3c7474, torch: 0x80ffff, ash: 0x70d0d0 },
    { floor: 0x8a4038, wall: 0x74302a, torch: 0xff6a50, ash: 0xff5040 },
    { floor: 0x9a8a74, wall: 0x827460, torch: 0xfff0d0, ash: 0xe8d0a0 },
    { floor: 0x9a6a38, wall: 0x82582c, torch: 0xffb060, ash: 0xffa050 },
    { floor: 0x3a4a6a, wall: 0x2e3c58, torch: 0x80b0ff, ash: 0x7090e0 },
    { floor: 0x6a3a28, wall: 0x542c1e, torch: 0xff8040, ash: 0xff7040 },
    { floor: 0x6a7a78, wall: 0x566664, torch: 0xd0fff0, ash: 0xb0e0d0 },
    { floor: 0x4a2a3a, wall: 0x3a2030, torch: 0xff4050, ash: 0xff3050 },
];

export function floorTheme(level: number): FloorTheme {
    const index = Math.max(0, Math.min(FLOOR_THEMES.length - 1, level - 1));
    return FLOOR_THEMES[index];
}
