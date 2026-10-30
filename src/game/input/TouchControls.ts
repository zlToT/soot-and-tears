import type { Dir, InputState } from '../types';

interface CastPress {
    id: number;
    dir: Dir;
}

/**
 * DOM touch controls: left analog stick + four cast buttons.
 * Kept outside the Phaser canvas so the hit targets stay large on phones and
 * the CSS safe-area insets work without fighting the 640x360 scale manager.
 */
export class TouchControls {
    readonly enabled: boolean;

    private readonly joystick: HTMLElement | null;
    private readonly knob: HTMLElement | null;
    private readonly castButtons: HTMLElement[];
    private readonly bombButton: HTMLElement | null;
    private readonly pauseButton: HTMLElement | null;
    private bombQueued = false;
    private pauseQueued = false;

    private stickPointer: number | null = null;
    private stickCenter = { x: 0, y: 0 };
    private stickMax = 44;
    private moveX = 0;
    private moveY = 0;

    private readonly presses: CastPress[] = [];

    constructor() {
        const params = new URLSearchParams(window.location.search);
        const forced = params.get('touch') === '1';
        const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
        this.enabled = forced || coarse || navigator.maxTouchPoints > 0;
        if (this.enabled) {
            document.body.classList.add('touch');
        }

        this.joystick = document.getElementById('joystick');
        this.knob = document.getElementById('joystick-knob');
        this.castButtons = Array.from(document.querySelectorAll<HTMLElement>('.tc-cast-btn'));
        this.bombButton = document.getElementById('bomb-btn');
        this.pauseButton = document.getElementById('pause-btn');

        if (!this.enabled || !this.joystick || !this.knob) {
            this.joystick = null;
            this.knob = null;
            return;
        }

        this.joystick.addEventListener('pointerdown', this.onStickDown);
        window.addEventListener('pointermove', this.onPointerMove, { passive: false });
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('pointercancel', this.onPointerUp);
        document.addEventListener('contextmenu', this.onContextMenu);

        for (const button of this.castButtons) {
            button.addEventListener('pointerdown', this.onCastDown);
        }
        this.bombButton?.addEventListener('pointerdown', this.onBombDown);
        this.pauseButton?.addEventListener('pointerdown', this.onPauseDown);
    }

    /** True once per bomb button press. */
    consumeBomb(): boolean {
        const queued = this.bombQueued;
        this.bombQueued = false;
        return queued;
    }

    /** True once per pause button press. */
    consumePause(): boolean {
        const queued = this.pauseQueued;
        this.pauseQueued = false;
        return queued;
    }

    private readonly onPauseDown = (event: PointerEvent): void => {
        event.preventDefault();
        this.pauseQueued = true;
        this.pauseButton?.classList.add('active');
        window.setTimeout(() => this.pauseButton?.classList.remove('active'), 120);
    };

    private readonly onBombDown = (event: PointerEvent): void => {
        event.preventDefault();
        this.bombQueued = true;
        this.bombButton?.classList.add('active');
        window.setTimeout(() => this.bombButton?.classList.remove('active'), 120);
    };

    private readonly onContextMenu = (event: Event): void => {
        event.preventDefault();
    };

    private readonly onStickDown = (event: PointerEvent): void => {
        if (this.stickPointer !== null) {
            return;
        }
        const el = this.joystick;
        if (!el) {
            return;
        }
        event.preventDefault();
        this.stickPointer = event.pointerId;
        const rect = el.getBoundingClientRect();
        this.stickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        this.stickMax = rect.width * 0.33;
        el.classList.add('active');
        this.updateStick(event.clientX, event.clientY);
    };

    private readonly onPointerMove = (event: PointerEvent): void => {
        if (event.pointerId === this.stickPointer) {
            event.preventDefault();
            this.updateStick(event.clientX, event.clientY);
            return;
        }
        const press = this.presses.find((item) => item.id === event.pointerId);
        if (!press) {
            return;
        }
        const next = this.dirAt(event.clientX, event.clientY);
        if (next && next !== press.dir) {
            this.setButtonActive(press.dir, false);
            press.dir = next;
            this.setButtonActive(next, true);
        }
    };

    private readonly onPointerUp = (event: PointerEvent): void => {
        if (event.pointerId === this.stickPointer) {
            this.stickPointer = null;
            this.moveX = 0;
            this.moveY = 0;
            this.knob?.style.setProperty('transform', 'translate(0px, 0px)');
            this.joystick?.classList.remove('active');
            return;
        }
        const index = this.presses.findIndex((item) => item.id === event.pointerId);
        if (index >= 0) {
            const [press] = this.presses.splice(index, 1);
            this.setButtonActive(press.dir, false);
        }
    };

    private readonly onCastDown = (event: PointerEvent): void => {
        event.preventDefault();
        const target = event.currentTarget as HTMLElement;
        const dir = target.dataset.dir as Dir | undefined;
        if (!dir) {
            return;
        }
        const existing = this.presses.findIndex((item) => item.id === event.pointerId);
        if (existing >= 0) {
            this.setButtonActive(this.presses[existing].dir, false);
            this.presses.splice(existing, 1);
        }
        this.presses.push({ id: event.pointerId, dir });
        this.setButtonActive(dir, true);
    };

    private updateStick(clientX: number, clientY: number): void {
        let dx = clientX - this.stickCenter.x;
        let dy = clientY - this.stickCenter.y;
        const length = Math.hypot(dx, dy);
        if (length > this.stickMax) {
            dx = (dx / length) * this.stickMax;
            dy = (dy / length) * this.stickMax;
        }
        this.knob?.style.setProperty('transform', `translate(${dx}px, ${dy}px)`);
        const nx = dx / this.stickMax;
        const ny = dy / this.stickMax;
        const magnitude = Math.hypot(nx, ny);
        if (magnitude < 0.16) {
            this.moveX = 0;
            this.moveY = 0;
            return;
        }
        const scale = Math.min(1, magnitude) / magnitude;
        this.moveX = nx * scale;
        this.moveY = ny * scale;
    }

    private dirAt(clientX: number, clientY: number): Dir | null {
        const el = document.elementFromPoint(clientX, clientY);
        const button = el?.closest<HTMLElement>('.tc-cast-btn');
        return (button?.dataset.dir as Dir | undefined) ?? null;
    }

    private setButtonActive(dir: Dir, active: boolean): void {
        const button = this.castButtons.find((item) => item.dataset.dir === dir);
        button?.classList.toggle('active', active);
    }

    sample(): InputState {
        if (!this.enabled) {
            return { mx: 0, my: 0, shootDir: null };
        }
        const shootDir = this.presses.length > 0 ? this.presses[this.presses.length - 1].dir : null;
        return { mx: this.moveX, my: this.moveY, shootDir };
    }

    destroy(): void {
        this.joystick?.removeEventListener('pointerdown', this.onStickDown);
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('pointercancel', this.onPointerUp);
        document.removeEventListener('contextmenu', this.onContextMenu);
        for (const button of this.castButtons) {
            button.removeEventListener('pointerdown', this.onCastDown);
        }
        this.bombButton?.removeEventListener('pointerdown', this.onBombDown);
        this.pauseButton?.removeEventListener('pointerdown', this.onPauseDown);
        document.body.classList.remove('touch');
    }
}
