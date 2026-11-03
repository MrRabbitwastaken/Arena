import { clamp, wrapAngle } from '../core/math.js';

export const ARENA_WALK_R = 12.4;

// Locomotion for ~95 kg of man and ~30 kg of plate: limited acceleration, limited turn rate,
// and both get worse when committed to an attack or when the legs are hurt.
export class CharacterController {
  constructor(k) { this.k = k; this.reset(); }
  reset() { this.sprinting = false; this.dodgeT = 0; this.dodgeCd = 0; }

  update(dt) {
    const k = this.k, I = k.intent;
    this.dodgeT -= dt; this.dodgeCd -= dt;
    if (k.defeated) {
      k.vel.multiplyScalar(Math.exp(-5 * dt));
      k.pos.addScaledVector(k.vel, dt);
      I.dodge = false;
      return;
    }
    const legs = k.legFactor();
    const cs = k.combat.state;
    const mul = cs === 'block' ? 0.55 : cs === 'windup' ? 0.6 : cs === 'strike' || cs === 'follow' ? 0.45
      : cs === 'recover' ? 0.6 : cs === 'stagger' ? 0.25 : 1;

    let mx = I.move.x, mz = I.move.y;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const wantSprint = I.sprint && cs === 'idle' && k.stamina.value > 8 && ml > 0.3;
    this.sprinting = wantSprint;
    if (wantSprint) k.stamina.drain(15 * dt);
    const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
    const backwards = mx * fx + mz * fz < -0.3 ? 0.72 : 1;
    const maxSpeed = (wantSprint ? 3.3 : 1.75) * legs * mul * backwards;
    const tx = mx * maxSpeed, tz = mz * maxSpeed;

    if (this.dodgeT > 0) {
      k.vel.multiplyScalar(Math.exp(-2.2 * dt));
    } else {
      const accel = (ml > 0.05 ? 5.5 : 7.5) * (0.5 + 0.5 * legs);
      let dvx = tx - k.vel.x, dvz = tz - k.vel.z;
      const dl = Math.hypot(dvx, dvz), maxDv = accel * dt;
      if (dl > maxDv) { dvx *= maxDv / dl; dvz *= maxDv / dl; }
      k.vel.x += dvx; k.vel.z += dvz;
    }

    const canDodge = cs === 'idle' || cs === 'block' || (cs === 'recover' && k.combat.t > k.combat.dur * 0.5);
    if (I.dodge && this.dodgeCd <= 0 && canDodge && k.stamina.value >= 16) {
      let dx = mx, dz = mz;
      if (Math.hypot(dx, dz) < 0.1) { dx = -fx; dz = -fz; }
      const l = Math.hypot(dx, dz); dx /= l; dz /= l;
      const sp = 3.8 * (0.4 + 0.6 * legs);
      k.vel.x = dx * sp; k.vel.z = dz * sp;
      this.dodgeT = 0.34; this.dodgeCd = 0.85;
      k.stamina.spend(18);
      k.stats.dodges++;
    }
    I.dodge = false;

    k.pos.addScaledVector(k.vel, dt);
    k.pos.y = 0;
    const r = Math.hypot(k.pos.x, k.pos.z);
    if (r > ARENA_WALK_R) {
      const nx = k.pos.x / r, nz = k.pos.z / r;
      k.pos.x = nx * ARENA_WALK_R; k.pos.z = nz * ARENA_WALK_R;
      const vo = k.vel.x * nx + k.vel.z * nz;
      if (vo > 0) { k.vel.x -= nx * vo; k.vel.z -= nz * vo; }
    }

    // Turning has inertia: a heavy cut in progress makes the body hard to swing round.
    const err = wrapAngle(I.faceYaw - k.yaw);
    const maxTurn = (cs === 'strike' ? 1.5 : cs === 'windup' ? 2.6 : cs === 'stagger' ? 0.8 : 3.4) * (0.45 + 0.55 * legs);
    const desired = clamp(err * 7, -maxTurn, maxTurn);
    const turnAcc = 16 * (0.5 + 0.5 * legs);
    k.yawRate += clamp(desired - k.yawRate, -turnAcc * dt, turnAcc * dt);
    k.yaw = wrapAngle(k.yaw + k.yawRate * dt);
  }
}
