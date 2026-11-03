// Keyboard and mouse with pointer lock. Mouse deltas are accumulated between frames.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.lmb = false; this.rmb = false; this.lPressed = false;
    this.locked = false;
    this.active = false;   // true while a duel is being played
    this.fallback = false; // pointer lock refused: read raw mouse movement instead
    this.onEscape = null;
    this.onLockChange = null;
    addEventListener('keydown', (e) => {
      if (['Space', 'Tab', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code) && this.live) e.preventDefault();
      if (e.code === 'Escape' && this.active && this.onEscape) this.onEscape();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.lmb = this.rmb = false; });
    addEventListener('mousemove', (e) => { if (this.live) { this.dx += e.movementX; this.dy += e.movementY; } });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.live) return;
      if (e.button === 0) { this.lmb = true; this.lPressed = true; }
      if (e.button === 2) this.rmb = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.lmb = false; if (e.button === 2) this.rmb = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('click', () => { if (this.active && !this.locked) this.requestLock(); });
    addEventListener('wheel', (e) => { if (this.live) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.lmb = this.rmb = false; }
      this.onLockChange && this.onLockChange(this.locked);
    });
  }
  get live() { return this.locked || (this.active && this.fallback); }
  requestLock() {
    try {
      const r = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (r && r.catch) r.catch(() => { this.fallback = true; });
    } catch (e) { this.fallback = true; }
    setTimeout(() => { if (!this.locked) this.fallback = true; }, 400);
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }
  consume() {
    const out = { dx: this.dx, dy: this.dy, wheel: this.wheel, lPressed: this.lPressed, pressed: this.pressed };
    this.dx = this.dy = this.wheel = 0; this.lPressed = false; this.pressed = new Set();
    return out;
  }
}
