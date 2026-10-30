export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Vec2 {
    x: number;
    y: number;
}

export interface InputState {
    /** -1..1, already normalised for diagonal movement. */
    mx: number;
    my: number;
    shootDir: Dir | null;
}

export type EnemyKind =
    | 'grub'
    | 'moth'
    | 'spitter'
    | 'rat'
    | 'hop'
    | 'boomMoth'
    | 'toad'
    | 'maw'
    | 'doll'
    | 'mask'
    | 'vis'
    | 'shadeMoth'
    | 'splitGrub'
    | 'thornRoll';

export type RoomType = 'start' | 'normal' | 'boss' | 'treasure' | 'shop';

export type BossKind =
    | 'granny'
    | 'flyking'
    | 'tumor'
    | 'grandpa'
    | 'chandelier'
    | 'drain'
    | 'greedgut'
    | 'attic'
    | 'armor'
    | 'hush'
    | 'pitlord'
    | 'pale'
    | 'nameless';
