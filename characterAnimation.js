import { THREE } from '../core/three.js';
import { clamp, damp, smooth, wrapAngle } from '../core/math.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _ax = new THREE.Vector3(), _pole = new THREE.Vector3();
const _right = new THREE.Vector3(), _fwd = new THREE.Vector3(), _tUp = new THREE.Vector3(), _hUp = new THREE.Vector3();
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _d = new THREE.Vector3(), _p = new THREE.Vector3();

const JOINTS = ['pelvis', 'waist', 'neck', 'headBase', 'headTop', 'shoulderL', 'shoulderR', 'shoulderMid',
  'elbowL', 'elbowR', 'wristL', 'wristR', 'gripL', 'gripR', 'hipL', 'hipR', 'kneeL', 'kneeR',
  'ankleL', 'ankleR', 'toeL', 'toeR'];

function solveIK(S, T, L1, L2, pole, outE) {
  _d.subVectors(T, S);
  let d = _d.length();
  d = clamp(d, 0.06, L1 + L2 - 1e-3);
  _d.normalize();
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
  if (_p.lengthSq() < 1e-6) _p.set(0, -1, 0);
  _p.normalize();
  outE.copy(S).addScaledVector(_d, a).addScaledVector(_p, h);
}

// Procedural body: legs from locomotion, torso and head from stance and hit springs,
// arms solved by IK onto wherever the physically simulated sword actually is.
export class KnightPose {
  constructor() {
    this.j = {};
    for (const n of JOINTS) this.j[n] = new THREE.Vector3();
    this.rootQ = new THREE.Quaternion(); this.torsoQ = new THREE.Quaternion();
    this.headQ = new THREE.Quaternion(); this.pelvisQ = new THREE.Quaternion();
    this.fwdHint = new THREE.Vector3(0, 0, 1); this.upHint = new THREE.Vector3(0, 1, 0);
    this.reset();
  }

  reset() {
    this.lean = new THREE.Vector2(); this.leanV = new THREE.Vector2();
    this.headKick = new THREE.Vector2(); this.headKickV = new THREE.Vector2();
    this.phase = 0; this.prevS = 0; this.twist = 0; this.fall = 0; this.fallDir = 1;
  }

  kick(pitch, roll, head = 0) {
    this.leanV.x += pitch; this.leanV.y += roll;
    this.headKickV.x += pitch * head; this.headKickV.y += roll * head;
  }

  spring(v, vel, k, c, dt, lim) {
    vel.x += (-k * v.x - c * vel.x) * dt; vel.y += (-k * v.y - c * vel.y) * dt;
    v.x = clamp(v.x + vel.x * dt, -lim, lim); v.y = clamp(v.y + vel.y * dt, -lim, lim);
  }

  update(dt, k) {
    const j = this.j, inj = k.injury;
    this.spring(this.lean, this.leanV, 70, 10, dt, 0.6);
    this.spring(this.headKick, this.headKickV, 90, 11, dt, 0.7);

    const cy = Math.cos(k.yaw), sy = Math.sin(k.yaw);
    const lx = k.vel.x * cy - k.vel.z * sy, lz = k.vel.x * sy + k.vel.z * cy;
    const speed = Math.hypot(lx, lz);
    if (!k.defeated) this.phase += (speed / 1.25) * Math.PI * 2 * dt;
    const s = Math.sin(this.phase);
    if (speed > 0.25 && Math.sign(s) !== Math.sign(this.prevS) && k.onFootstep) k.onFootstep(speed);
    this.prevS = s;

    // Torso turns towards the hands.
    const gx = (k.sword.pos.x - k.pos.x) * cy - (k.sword.pos.z - k.pos.z) * sy;
    this.twist = damp(this.twist, k.defeated ? 0 : clamp(gx * 1.3, -0.65, 0.65), 10, dt);

    let fallA = 0, topple = 0;
    if (k.defeated) {
      this.fall = Math.min(1, this.fall + dt / 1.3);
      fallA = smooth(Math.min(1, this.fall * 1.8));
      topple = smooth(clamp(this.fall * 1.6 - 0.45, 0, 1));
    }

    this.rootQ.setFromAxisAngle(UP, k.yaw);
    _right.set(cy, 0, -sy); _fwd.set(sy, 0, cy);
    const stanceLean = 0.08 + (k.combat.state === 'block' ? 0.04 : 0);
    const pitch = stanceLean + this.lean.x + this.fallDir * topple * 1.25;
    _e.set(pitch, this.twist, this.lean.y, 'YXZ');
    _q.setFromEuler(_e);
    this.torsoQ.multiplyQuaternions(this.rootQ, _q);
    _e.set(this.lean.x * 0.3 + this.fallDir * topple * 0.4, this.twist * 0.3, this.lean.y * 0.3, 'YXZ');
    _q.setFromEuler(_e);
    this.pelvisQ.multiplyQuaternions(this.rootQ, _q);

    const amp = clamp(speed / 1.75, 0, 1.4) * 0.4;
    const legHurt = 1 - inj.rawLegs();
    const bob = 0.022 * Math.cos(2 * this.phase) * Math.min(1, amp / 0.4);
    const crouch = 0.03 + legHurt * 0.08 + (k.combat.state === 'block' ? 0.02 : 0) + fallA * 0.45 + topple * 0.2;
    j.pelvis.set(k.pos.x, 0.96 + bob - crouch, k.pos.z);
    _tUp.copy(UP).applyQuaternion(this.torsoQ);
    j.waist.copy(j.pelvis).addScaledVector(_tUp, 0.22);
    j.neck.copy(j.pelvis).addScaledVector(_tUp, 0.56);
    j.shoulderL.set(0.21, -0.07, 0).applyQuaternion(this.torsoQ).add(j.neck);
    j.shoulderR.set(-0.21, -0.07, 0).applyQuaternion(this.torsoQ).add(j.neck);
    j.shoulderMid.addVectors(j.shoulderL, j.shoulderR).multiplyScalar(0.5);

    // Head: watches the opponent, snaps with helmet hits.
    let look = 0;
    if (k.opponent && !k.defeated) look = clamp(wrapAngle(Math.atan2(k.opponent.pos.x - k.pos.x, k.opponent.pos.z - k.pos.z) - k.yaw - this.twist), -0.8, 0.8);
    _e.set(pitch * 0.6 + this.headKick.x + 0.04 + fallA * 0.3, this.twist + look, this.lean.y * 1.1 + this.headKick.y, 'YXZ');
    _q.setFromEuler(_e);
    this.headQ.multiplyQuaternions(this.rootQ, _q);
    _hUp.copy(UP).applyQuaternion(this.headQ);
    j.headBase.copy(j.neck).addScaledVector(_tUp, 0.04);
    j.headTop.copy(j.headBase).addScaledVector(_hUp, 0.28);

    // Legs
    for (const side of [1, -1]) {
      const S = side > 0 ? 'L' : 'R';
      const hip = j['hip' + S].set(side * 0.1, -0.04, 0).applyQuaternion(this.pelvisQ).add(j.pelvis);
      const ph = this.phase + (side > 0 ? 0 : Math.PI);
      const swing = Math.sin(ph) * amp;
      const stanceW = 1 - clamp(amp / 0.15, 0, 1);
      const stance = (side > 0 ? 0.2 : -0.12) * stanceW + fallA * 0.9;
      const hurt = 1 - inj.leg(S);
      const kneeBend = 0.12 + stanceW * 0.12 + Math.max(0, Math.sin(ph + 1.3)) * amp * 1.4 + hurt * 0.25 + fallA * 1.4;
      const mx = speed > 0.05 ? lx / speed : 0, mz = speed > 0.05 ? lz / speed : 1;
      _v.set(0, -1, 0);
      _ax.set(0, 0, 1); _v.applyAxisAngle(_ax, side * 0.06);
      _ax.set(1, 0, 0); _v.applyAxisAngle(_ax, -stance);
      _ax.set(mz, 0, -mx).normalize(); _v.applyAxisAngle(_ax, -swing * (1 - fallA));
      _v.applyQuaternion(this.rootQ);
      const knee = j['knee' + S].copy(hip).addScaledVector(_v, 0.45);
      _w.copy(_v).applyAxisAngle(_right, kneeBend);
      const ankle = j['ankle' + S].copy(knee).addScaledVector(_w, 0.45);
      if (ankle.y < 0.07) { const lift = 0.07 - ankle.y; ankle.y += lift; knee.y += lift * 0.5; }
      j['toe' + S].copy(ankle).addScaledVector(_fwd, 0.18).addScaledVector(_right, side * 0.02);
      j['toe' + S].y = Math.max(0.03, ankle.y - 0.045);
    }

    // Arms: IK onto the sword's grip, wherever physics has put it.
    for (const side of [1, -1]) {
      const S = side > 0 ? 'L' : 'R';
      const sh = j['shoulder' + S], grip = j['grip' + S];
      if (!k.sword.free) grip.copy(k.sword.pos).addScaledVector(k.sword.axis, side > 0 ? -0.1 : 0.1);
      else grip.copy(sh).addScaledVector(_tUp, -0.6).addScaledVector(_fwd, 0.1).addScaledVector(_right, side * 0.06);
      _pole.set(side * 0.7, -1, -0.5).applyQuaternion(this.torsoQ);
      solveIK(sh, grip, 0.31, 0.36, _pole, j['elbow' + S]);
      j['wrist' + S].subVectors(grip, j['elbow' + S]).normalize().multiplyScalar(0.27).add(j['elbow' + S]);
    }
    this.fwdHint.copy(_fwd).applyQuaternion(_q.setFromAxisAngle(_right, this.fallDir * topple * 1.2));
    this.upHint.copy(_tUp);
  }
}
