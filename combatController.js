import { THREE } from '../core/three.js';
import { ATTACKS } from './attacks.js';
import { guardPose, edgeHint, IDLE, STAGGER } from './blocking.js';
import { quatFromBladeEdge, clamp, rand, wrapAngle } from '../core/math.js';

// Controller gains for the hands and wrists in each state. These are limits on what a
// person can do with the sword, not animation curves: maxT is the torque the arms can
// apply (N·m), maxA the acceleration they can give the grip (m/s²).
export const GAINS = {
  idle:    { kp: 260, kd: 30, maxT: 42, posK: 110, posC: 20, maxA: 26 },
  recover: { kp: 200, kd: 28, maxT: 34, posK: 90, posC: 18, maxA: 22 },
  weak:    { kp: 110, kd: 18, maxT: 20, posK: 60, posC: 12, maxA: 14 },
  windup:  { kp: 380, kd: 38, maxT: 48, posK: 120, posC: 20, maxA: 28 },
  strike:  { kp: 720, kd: 26, maxT: 80, posK: 150, posC: 18, maxA: 40 },
  thrust:  { kp: 700, kd: 44, maxT: 70, posK: 130, posC: 16, maxA: 30 },
  follow:  { kp: 80, kd: 12, maxT: 28, posK: 60, posC: 10, maxA: 18 },
  block:   { kp: 560, kd: 44, maxT: 62, posK: 170, posC: 26, maxA: 38 },
  parry:   { kp: 900, kd: 52, maxT: 92, posK: 230, posC: 30, maxA: 55 },
  stagger: { kp: 90, kd: 14, maxT: 20, posK: 50, posC: 10, maxA: 14 },
};

const _h = new THREE.Vector3(), _b = new THREE.Vector3(), _e = new THREE.Vector3();
const _wp = new THREE.Vector3(), _wb = new THREE.Vector3(), _we = new THREE.Vector3();
const _q = new THREE.Quaternion(), _lb = new THREE.Vector3(), _cr = new THREE.Vector3(), _t = new THREE.Vector3();
const _g = {};

export class CombatController {
  constructor(k) { this.k = k; this.serial = 0; this.reset(); }

  reset() {
    this.state = 'idle'; this.t = 0;
    this.atk = null; this.atkId = null;
    this.phi = 0; this.phiActual = 0; this.rawPrev = null; this.omega = 0; this.u = 0; this.uVel = 0;
    this.charge = 0; this.power = 1; this.windupDur = 0; this.dur = 0; this.stallT = 0;
    this.hitSet = new Set(); this.deflected = null;
    this.parryT = 0; this.parryCd = 0; this.parryContact = false;
    this.riposteT = 0; this.weakT = 0;
    this.guardX = 0; this.guardY = 0;
    this.buffer = null; this.bufferT = 0;
    this.event = '';
  }

  get attacking() { return this.state === 'windup' || this.state === 'strike' || this.state === 'follow'; }
  get striking() { return this.state === 'strike' || this.state === 'follow'; }
  setState(s) { this.state = s; this.t = 0; }

  update(dt) {
    const k = this.k, I = k.intent;
    this.t += dt;
    this.parryT = Math.max(0, this.parryT - dt);
    this.parryCd -= dt; this.riposteT -= dt; this.weakT -= dt; this.bufferT -= dt;
    if (I.attackPress) { this.buffer = I.attackPress; this.bufferT = 0.28; I.attackPress = null; }
    if (this.bufferT <= 0) this.buffer = null;
    this.guardX = I.gx; this.guardY = I.gy;

    if (k.defeated) { if (this.state !== 'down') this.setState('down'); return; }

    switch (this.state) {
      case 'idle':
        if (this.buffer && k.stamina.value > 4) this.startAttack(this.buffer);
        else if (I.blockHeld && this.weakT <= 0) this.enterBlock();
        break;
      case 'block':
        if (this.buffer && this.parryT <= 0 && k.stamina.value > 4) { this.startAttack(this.buffer); break; }
        if (!I.blockHeld) {
          // A quick tap that met nothing is a missed parry: the guard is briefly out of place.
          if (this.t < 0.22 && !this.parryContact) { this.weakT = 0.4; this.event = 'missed parry'; }
          this.setState('idle');
        }
        break;
      case 'windup':
        if (I.blockHeld && this.t > 0.05) { // feint: abandon the cut and go to guard
          k.stamina.spend(7); k.stats.feints++;
          this.enterBlock();
          break;
        }
        if (this.t >= this.windupDur) {
          const holding = I.attackHeld && this.t < this.windupDur + 0.4;
          if (!holding) { this.charge = clamp((this.t - this.windupDur) / 0.4, 0, 1); this.beginStrike(); }
        }
        break;
      case 'strike': this.updateStrike(dt); break;
      case 'follow': if (this.t >= 0.2) this.recover(1); break;
      case 'recover':
        if (this.t >= this.dur) this.setState('idle');
        else if (this.t > this.dur * 0.55 && I.blockHeld) this.enterBlock();
        break;
      case 'stagger': if (this.t >= this.dur) this.setState('idle'); break;
    }
    this.applyTargets(dt);
  }

  enterBlock() {
    this.setState('block');
    this.parryContact = false;
    if (this.parryCd <= 0 && this.weakT <= 0) { this.parryT = 0.2; this.parryCd = 0.5; }
    else this.parryT = 0;
  }

  startAttack(id) {
    const A = ATTACKS[id]; if (!A) return;
    const k = this.k;
    this.atk = A; this.atkId = id; this.buffer = null; this.serial++;
    const sf = k.stamina.factor, ac = k.armControl();
    this.windupDur = (A.windup / (0.55 + 0.45 * sf) / (0.55 + 0.45 * ac)) * (this.riposteT > 0 ? 0.6 : 1);
    this.charge = 0; this.deflected = null;
    this.setState('windup');
    k.stamina.hold();
  }

  beginStrike() {
    const A = this.atk, k = this.k;
    k.stamina.spend(A.stamina * (1 + this.charge * 0.5));
    this.power = 1 + this.charge * 0.45;
    this.phi = 0; this.phiActual = 0; this.rawPrev = null; this.omega = 0; this.u = 0; this.uVel = 0; this.stallT = 0;
    this.hitSet.clear(); this.deflected = null;
    this.setState('strike');
    if (A.thrust) k.lunge(1.25 * this.power);
    k.onSwing && k.onSwing(A, this.power);
  }

  updateStrike(dt) {
    const A = this.atk, k = this.k;
    if (this.deflected) {
      const m = this.deflected === 'parried' ? 1.9 : this.deflected === 'clash' ? 1.15 : this.deflected === 'armour' ? 1.1 : 1.3;
      this.recover(m);
      return;
    }
    const sf = k.stamina.factor * k.armControl();
    if (A.thrust) {
      this.uVel = Math.min(A.speed * (0.6 + 0.4 * sf) * this.power, this.uVel + A.accel * dt);
      this.u = Math.min(1, this.u + (this.uVel * dt) / 0.65);
      if (this.u >= 1 || this.t > 0.6) this.setState('follow');
      return;
    }
    // Measure how far round its arc the real blade has actually travelled.
    k.dirToLocal(k.sword.axis, _lb);
    _lb.addScaledVector(A.axis, -_lb.dot(A.axis));
    _cr.crossVectors(A.bW, _lb);
    const raw = Math.atan2(_cr.dot(A.axis), A.bW.dot(_lb));
    if (this.rawPrev === null) { this.rawPrev = raw; this.phiActual = raw; }
    this.phiActual += wrapAngle(raw - this.rawPrev);
    this.rawPrev = raw;

    // The hands drive a target round the arc, but never far ahead of the steel:
    // a blade that has been stopped stays stopped.
    this.omega = Math.min(A.omega * this.power * (0.55 + 0.45 * sf), this.omega + A.accel * dt * (0.5 + 0.5 * sf));
    const lead = 0.55;
    const next = Math.min(this.phi + this.omega * dt, this.phiActual + lead);
    if (next > this.phi) this.phi = next;
    if (this.phi - this.phiActual > lead * 0.9 && this.omega > 3) {
      this.stallT += dt;
      if (this.stallT > 0.16) this.deflected = 'stalled';
    } else this.stallT = Math.max(0, this.stallT - dt);
    if (this.phi >= A.total || this.t > 1.2) this.setState('follow');
  }

  recover(mult) {
    const base = this.atk ? this.atk.recovery : 0.5;
    this.dur = (base * mult) / (0.6 + 0.4 * this.k.stamina.factor);
    this.setState('recover');
  }

  deflect(kind) {
    if (this.state === 'strike') { if (!this.deflected) this.deflected = kind; }
    else if (this.state === 'follow') this.recover(1.2);
  }

  onParry() { this.riposteT = 0.75; this.parryT = 0; this.event = 'parry'; }

  stagger(d) {
    if (this.state === 'down') return;
    this.setState('stagger');
    this.dur = d; this.parryT = 0;
  }

  guardBreak() { this.stagger(0.75); this.event = 'guard broken'; }

  // Thrust aim: towards the opponent's upper chest and throat.
  aim(hLocal, out) {
    const o = this.k.opponent;
    if (!o) { out.set(0, 0.05, 1); return out; }
    _t.set(o.pos.x, this.atk ? this.atk.aimY || 1.45 : 1.45, o.pos.z);
    this.k.worldToLocal(_t, out);
    out.sub(hLocal);
    if (out.lengthSq() < 1e-4) out.set(0, 0, 1);
    out.normalize();
    if (out.z < 0.6) { out.z = 0.6; out.normalize(); }
    return out;
  }

  applyTargets(dt) {
    const k = this.k, s = k.sword;
    if (s.free) return;
    let G;
    const A = this.atk;
    switch (this.state) {
      case 'block':
        guardPose(this.guardX, this.guardY, _h, _b); edgeHint(_b, _e);
        G = this.parryT > 0 ? GAINS.parry : GAINS.block;
        break;
      case 'windup':
        _h.copy(A.hW);
        if (A.thrust) { this.aim(_h, _b); _e.set(1, 0, 0); }
        else { _b.copy(A.bW); _e.crossVectors(A.axis, _b); }
        G = GAINS.windup;
        break;
      case 'strike': case 'follow':
        if (A.thrust) {
          _h.lerpVectors(A.hW, A.hS, this.state === 'follow' ? 1 : this.u);
          this.aim(_h, _b); _e.set(1, 0, 0);
          G = this.state === 'follow' ? GAINS.follow : GAINS.thrust;
        } else {
          const phi = this.state === 'follow' ? A.total : this.phi;
          _b.copy(A.bW).applyAxisAngle(A.axis, phi);
          _e.crossVectors(A.axis, _b);
          const u = phi / A.total, um = A.midAngle / A.total;
          if (u < um) _h.lerpVectors(A.hW, A.hMid, u / um);
          else _h.lerpVectors(A.hMid, A.hS, Math.min(1, (u - um) / (1 - um)));
          G = this.state === 'follow' ? GAINS.follow : GAINS.strike;
        }
        break;
      case 'stagger':
        _h.copy(STAGGER.h); _b.copy(STAGGER.b); edgeHint(_b, _e); G = GAINS.stagger;
        break;
      default:
        _h.copy(IDLE.h); _b.copy(IDLE.b); edgeHint(_b, _e);
        G = this.weakT > 0 ? GAINS.weak : this.state === 'recover' ? GAINS.recover : GAINS.idle;
    }
    const m = k.stamina.factor * k.armControl();
    _g.kp = G.kp * (0.55 + 0.45 * m);
    _g.kd = G.kd * (0.7 + 0.3 * m);
    _g.maxT = G.maxT * m * (this.state === 'strike' ? this.power : 1);
    _g.posK = G.posK * (0.6 + 0.4 * m);
    _g.posC = G.posC;
    _g.maxA = G.maxA * (0.5 + 0.5 * m);
    const shake = k.injury.daze * 0.04 + (1 - k.armControl()) * 0.04;
    if (shake > 0.002) { _b.x += rand(-shake, shake); _b.y += rand(-shake, shake); _b.normalize(); }
    k.toWorld(_h, _wp); k.dirToWorld(_b, _wb); k.dirToWorld(_e, _we);
    quatFromBladeEdge(_wb, _we, _q);
    s.setTarget(_wp, _q, _g, dt);
  }
}
