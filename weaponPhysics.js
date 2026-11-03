import { THREE } from '../core/three.js';
import { integrateQuat, rotationVector } from '../core/math.js';

// Two-handed greatsword. Local frame: origin at the centre of the grip (between the hands),
// +Y towards the tip, +X the leading edge, +Z the flat.
export const SWORD = {
  mass: 2.6,           // kg
  handOffset: 0.1,     // each hand 10 cm either side of the grip centre
  guardY: 0.2,         // crossguard
  guardHalf: 0.17,
  bladeStart: 0.22,
  tipY: 1.42,          // overall length ~1.68 m
  pommelY: -0.25,
  bladeR: 0.028,       // collision radius of the blade (includes the wrists' last-moment adjustment)
  guardR: 0.018,
  com: 0.34,           // centre of mass from grip centre: ~14 cm in front of the cross
  Iperp: 0.80,         // kg·m² about the grip, perpendicular to the blade
  Iax: 0.02,           // about the blade axis
  Icom: 0.50,          // about the centre of mass (used once the sword is dropped)
};
// Effective mass the hands and arms put behind the grip.
export const LIN_MASS = 11;
const G = 9.81;

export const SAMPLES = [];
(() => {
  const ys = [0.24, 0.38, 0.52, 0.66, 0.80, 0.94, 1.08, 1.22, 1.34, 1.42];
  ys.forEach((y, i) => SAMPLES.push({ p: new THREE.Vector3(0, y, 0), part: i === ys.length - 1 ? 'tip' : 'blade', s: y }));
  SAMPLES.push({ p: new THREE.Vector3(SWORD.guardHalf, SWORD.guardY, 0), part: 'guard', s: SWORD.guardY });
  SAMPLES.push({ p: new THREE.Vector3(-SWORD.guardHalf, SWORD.guardY, 0), part: 'guard', s: SWORD.guardY });
  SAMPLES.push({ p: new THREE.Vector3(0, SWORD.pommelY, 0), part: 'pommel', s: SWORD.pommelY });
})();

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _e = new THREE.Vector3();

export class Sword {
  constructor() {
    this.pos = new THREE.Vector3();   // grip centre
    this.vel = new THREE.Vector3();
    this.q = new THREE.Quaternion();
    this.w = new THREE.Vector3();     // angular velocity, world
    this.axis = new THREE.Vector3(0, 1, 0);
    this.edge = new THREE.Vector3(1, 0, 0);
    this.flat = new THREE.Vector3(0, 0, 1);

    this.tPos = new THREE.Vector3(); this.tVel = new THREE.Vector3();
    this.tQ = new THREE.Quaternion(); this.tW = new THREE.Vector3();
    this.hasTarget = false;
    this.gains = { kp: 200, kd: 25, maxT: 40, posK: 120, posC: 22, maxA: 30 };

    this.reachCenter = new THREE.Vector3();
    this.reachRadius = 0.56;

    this.free = false;
    this.comPos = new THREE.Vector3(); this.comVel = new THREE.Vector3();

    this.prev = SAMPLES.map(() => new THREE.Vector3());
    this.cur = SAMPLES.map(() => new THREE.Vector3());
    this.base = new THREE.Vector3(); this.tip = new THREE.Vector3();
    this.prevBase = new THREE.Vector3(); this.prevTip = new THREE.Vector3();
    this.guardA = new THREE.Vector3(); this.guardB = new THREE.Vector3();
    this.prevGuardA = new THREE.Vector3(); this.prevGuardB = new THREE.Vector3();
    this.tipSpeed = 0;
  }

  reset(pos, q) {
    this.free = false;
    this.pos.copy(pos); this.q.copy(q);
    this.vel.set(0, 0, 0); this.w.set(0, 0, 0);
    this.tPos.copy(pos); this.tQ.copy(q); this.tVel.set(0, 0, 0); this.tW.set(0, 0, 0);
    this.hasTarget = false;
    this.updateDerived();
    this.snapshot();
  }

  updateDerived() {
    if (this.free) this.pos.copy(this.comPos).addScaledVector(this.axis.set(0, 1, 0).applyQuaternion(this.q), -SWORD.com);
    this.axis.set(0, 1, 0).applyQuaternion(this.q);
    this.edge.set(1, 0, 0).applyQuaternion(this.q);
    this.flat.set(0, 0, 1).applyQuaternion(this.q);
    for (let i = 0; i < SAMPLES.length; i++) this.cur[i].copy(SAMPLES[i].p).applyQuaternion(this.q).add(this.pos);
    this.base.copy(this.pos).addScaledVector(this.axis, SWORD.bladeStart);
    this.tip.copy(this.pos).addScaledVector(this.axis, SWORD.tipY);
    this.guardA.copy(this.pos).addScaledVector(this.axis, SWORD.guardY).addScaledVector(this.edge, SWORD.guardHalf);
    this.guardB.copy(this.pos).addScaledVector(this.axis, SWORD.guardY).addScaledVector(this.edge, -SWORD.guardHalf);
  }

  snapshot() {
    for (let i = 0; i < SAMPLES.length; i++) this.prev[i].copy(this.cur[i]);
    this.prevBase.copy(this.base); this.prevTip.copy(this.tip);
    this.prevGuardA.copy(this.guardA); this.prevGuardB.copy(this.guardB);
  }

  setTarget(pos, q, gains, dt) {
    if (this.hasTarget && dt > 0) {
      this.tVel.subVectors(pos, this.tPos).divideScalar(dt);
      if (this.tVel.length() > 8) this.tVel.setLength(8);
      rotationVector(this.tQ, q, this.tW).divideScalar(dt);
      if (this.tW.length() > 22) this.tW.setLength(22);
    } else { this.tVel.set(0, 0, 0); this.tW.set(0, 0, 0); }
    this.tPos.copy(pos); this.tQ.copy(q);
    Object.assign(this.gains, gains);
    this.hasTarget = true;
  }

  pointVel(p, out) {
    if (this.free) { _a.subVectors(p, this.comPos); return out.crossVectors(this.w, _a).add(this.comVel); }
    _a.subVectors(p, this.pos);
    return out.crossVectors(this.w, _a).add(this.vel);
  }

  // Inverse effective mass at point p along direction n.
  invMassAt(p, n) {
    if (this.free) {
      _a.subVectors(p, this.comPos); _b.crossVectors(_a, n);
      return 1 / SWORD.mass + _b.lengthSq() / SWORD.Icom;
    }
    _a.subVectors(p, this.pos); _b.crossVectors(_a, n);
    const ax = _b.dot(this.axis);
    const perp2 = Math.max(0, _b.lengthSq() - ax * ax);
    return 1 / LIN_MASS + perp2 / SWORD.Iperp + (ax * ax) / SWORD.Iax;
  }

  applyImpulse(p, J) {
    if (this.free) {
      this.comVel.addScaledVector(J, 1 / SWORD.mass);
      _a.subVectors(p, this.comPos); _b.crossVectors(_a, J);
      this.w.addScaledVector(_b, 1 / SWORD.Icom);
      return;
    }
    this.vel.addScaledVector(J, 1 / LIN_MASS);
    _a.subVectors(p, this.pos); _b.crossVectors(_a, J);
    const ax = _b.dot(this.axis);
    _c.copy(_b).addScaledVector(this.axis, -ax);
    this.w.addScaledVector(_c, 1 / SWORD.Iperp).addScaledVector(this.axis, Math.max(-6, Math.min(6, ax / SWORD.Iax)));
  }

  // Positional correction: move point p by delta, mostly by rotating about the grip.
  nudge(p, delta) {
    if (this.free) { this.comPos.add(delta); this.updateDerived(); return; }
    _a.subVectors(p, this.pos);
    const L2 = _a.lengthSq();
    if (L2 > 0.02) {
      _b.crossVectors(_a, delta).multiplyScalar(0.85 / L2);
      integrateQuat(this.q, _b, 1);
      this.pos.addScaledVector(delta, 0.15);
    } else this.pos.add(delta);
    this.updateDerived();
  }

  release() {
    if (this.free) return;
    this.comPos.copy(this.pos).addScaledVector(this.axis, SWORD.com);
    this.pointVel(this.comPos, this.comVel);
    this.free = true;
  }

  step(dt) {
    this.snapshot();
    if (this.free) { this.freeStep(dt); return; }
    const g = this.gains;

    // Hands: force-limited spring towards the target grip position.
    _a.subVectors(this.tPos, this.pos).multiplyScalar(g.posK);
    _b.subVectors(this.tVel, this.vel).multiplyScalar(g.posC);
    _a.add(_b);
    if (_a.length() > g.maxA) _a.setLength(g.maxA);
    this.vel.addScaledVector(_a, dt);
    this.pos.addScaledVector(this.vel, dt);
    _c.subVectors(this.pos, this.reachCenter);
    const d = _c.length();
    if (d > this.reachRadius) {
      _c.multiplyScalar(1 / d);
      this.pos.copy(this.reachCenter).addScaledVector(_c, this.reachRadius);
      const vo = this.vel.dot(_c);
      if (vo > 0) this.vel.addScaledVector(_c, -vo);
    }

    // Blade: torque-limited PD controller + gravity, integrated on the real inertia.
    rotationVector(this.q, this.tQ, _e);
    _a.copy(_e).multiplyScalar(g.kp);
    _b.subVectors(this.tW, this.w).multiplyScalar(g.kd);
    _a.add(_b);
    const axErr = _e.dot(this.axis);
    _a.addScaledVector(this.axis, -_a.dot(this.axis));
    if (_a.length() > g.maxT) _a.setLength(g.maxT);
    // gravity acting at the centre of mass
    _b.copy(this.axis).multiplyScalar(SWORD.com);
    _c.set(0, -G * SWORD.mass, 0);
    _b.cross(_c);
    _a.add(_b);
    this.w.addScaledVector(_a, dt / SWORD.Iperp);
    // roll (rotation about the blade): wrists, handled as a stable velocity servo
    const wAx = this.w.dot(this.axis);
    const wAxT = Math.max(-14, Math.min(14, axErr * 18));
    this.w.addScaledVector(this.axis, (wAxT - wAx) * (1 - Math.exp(-25 * dt)));

    integrateQuat(this.q, this.w, dt);
    this.updateDerived();
    this.tipSpeed = this.tip.distanceTo(this.prevTip) / dt;
  }

  freeStep(dt) {
    this.comVel.y -= G * dt;
    this.comPos.addScaledVector(this.comVel, dt);
    this.w.multiplyScalar(Math.exp(-0.4 * dt));
    integrateQuat(this.q, this.w, dt);
    this.updateDerived();
    this.tipSpeed = this.tip.distanceTo(this.prevTip) / dt;
  }
}
