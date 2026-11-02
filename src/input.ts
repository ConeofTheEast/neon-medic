// One input layer for keyboard/mouse and touch. Game code only sees actions.
export class Input {
  touchMode = false;
  locked = false;
  onLockChange: (locked: boolean) => void = () => {};
  onTouchMode: () => void = () => {};

  private keys = new Set<string>();
  private look = { x: 0, y: 0 };
  private fireQueued = false;
  private wheel = 0;
  private num: number | null = null;
  private joy = { x: 0, y: 0 };
  private joyId: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };

  constructor(private canvas: HTMLCanvasElement, private joyEl: HTMLElement, private knob: HTMLElement, fireBtn: HTMLElement) {
    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      const m = /^(Digit|Numpad)([1-4])$/.exec(e.code);
      if (m) this.num = +m[2] - 1;
      if (e.code === 'Space') this.fireQueued = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (this.locked) { this.look.x += e.movementX; this.look.y += e.movementY; }
    });
    canvas.addEventListener('mousedown', (e) => { if (this.locked && e.button === 0) this.fireQueued = true; });
    addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.onLockChange(this.locked);
    });

    // Touch: left side = floating joystick, right side = look.
    addEventListener('touchstart', () => {
      if (!this.touchMode) { this.touchMode = true; document.body.classList.add('touch'); this.onTouchMode(); }
    }, { capture: true, passive: true });
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX < innerWidth * 0.42 && this.joyId === null) {
          this.joyId = t.identifier; this.joyOrigin = { x: t.clientX, y: t.clientY };
          joyEl.style.left = t.clientX + 'px'; joyEl.style.top = t.clientY + 'px';
          joyEl.classList.add('active');
        } else if (this.lookId === null) {
          this.lookId = t.identifier; this.lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joyId) {
          let dx = t.clientX - this.joyOrigin.x, dy = t.clientY - this.joyOrigin.y;
          const len = Math.hypot(dx, dy), max = 50;
          if (len > max) { dx *= max / len; dy *= max / len; }
          this.joy = { x: dx / max, y: -dy / max };
          this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (t.identifier === this.lookId) {
          this.look.x += (t.clientX - this.lookLast.x) * 2.2;
          this.look.y += (t.clientY - this.lookLast.y) * 2.2;
          this.lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: false });
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joyId) this.resetJoy();
        if (t.identifier === this.lookId) this.lookId = null;
      }
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
    fireBtn.addEventListener('touchstart', (e) => { e.preventDefault(); this.fireQueued = true; }, { passive: false });
    fireBtn.addEventListener('click', () => { this.fireQueued = true; });
  }

  private resetJoy() {
    this.joyId = null; this.joy = { x: 0, y: 0 };
    this.knob.style.transform = '';
    this.joyEl.classList.remove('active');
    this.joyEl.style.left = ''; this.joyEl.style.top = '';
  }

  requestLock() {
    if (this.touchMode) return;
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch { /* browser said no; user clicks again */ }
  }

  /** x = strafe right, y = forward. Range -1..1. */
  move() {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    x += this.joy.x; y += this.joy.y;
    const len = Math.hypot(x, y);
    return len > 1 ? { x: x / len, y: y / len } : { x, y };
  }
  takeLook() { const l = this.look; this.look = { x: 0, y: 0 }; return l; }
  takeFire() { const f = this.fireQueued; this.fireQueued = false; return f; }
  takeWheel() { const w = this.wheel; this.wheel = 0; return w; }
  takeNumber() { const n = this.num; this.num = null; return n; }
  clear() { this.takeLook(); this.takeFire(); this.takeWheel(); this.takeNumber(); this.resetJoy(); this.lookId = null; }
}
