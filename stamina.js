import { clamp } from '../core/math.js';

export class Stamina {
  constructor() { this.reset(); }
  reset() { this.max = 100; this.value = 100; this.delay = 0; this.regenMul = 1; }
  spend(a) { this.value = Math.max(0, this.value - a); this.delay = Math.max(this.delay, 0.7); }
  drain(a) { this.value = Math.max(0, this.value - a); this.delay = Math.max(this.delay, 0.35); }
  hold() { this.delay = Math.max(this.delay, 0.3); }
  update(dt, mode) {
    if (this.value > this.max) this.value = this.max;
    if (this.delay > 0) { this.delay -= dt; return; }
    const rate = mode === 'busy' ? 0 : mode === 'block' ? 7 : mode === 'sprint' ? 0 : 19;
    this.value = clamp(this.value + rate * this.regenMul * dt, 0, this.max);
  }
  // 1 when fresh, ~0.45 when exhausted. Scales swing speed, torque and recovery.
  get factor() { return 0.45 + 0.55 * clamp(this.value / 40, 0, 1); }
}
