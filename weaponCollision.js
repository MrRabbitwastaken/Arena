import { THREE } from '../core/three.js';
import { closestSegSeg, makeClosest } from '../core/math.js';
import { SWORD, SAMPLES } from './weaponPhysics.js';
import { zoneForHit } from './armourSystem.js';
import { resolveHit } from './damageSystem.js';

// Swept collision between the moving blades and everything they can meet.
// Blades are capsules; every physics substep compares where each blade segment was
// and where it is now, so a fast blade cannot tunnel through a guard or a limb.

const ARENA_R = 13.1;
const cl = makeClosest(), cl2 = makeClosest(), cl3 = makeClosest();
const _n = new THREE.Vector3(), _s0 = new THREE.Vector3(), _s1 = new THREE.Vector3();
const _ua = new THREE.Vector3(), _ub = new THREE.Vector3(), _vr = new THREE.Vector3(), _vt = new THREE.Vector3();
const _imp = new THREE.Vector3(), _d = new THREE.Vector3(), _pa = new THREE.Vector3(), _pb = new THREE.Vector3();
const _p = new THREE.Vector3(), _u = new THREE.Vector3(), _nl = new THREE.Vector3(), _tmp = new THREE.Vector3();
const hitInfo = { pa: new THREE.Vector3(), pb: new THREE.Vector3(), n: new THREE.Vector3(), pen: 0, sa: 0, sb: 0 };

const interior = (c) => c.s > 0.005 && c.s < 0.995 && c.t > 0.005 && c.t < 0.995;

export class WeaponCollision {
  constructor(duel) { this.duel = duel; this.clashCd = 0; this.scrapeCd = 0; this.worldCd = [0, 0]; }

  step(dt, knights) {
    this.clashCd -= dt; this.scrapeCd -= dt;
    const [A, B] = knights;
    if (!A.sword.free && !B.sword.free) this.swordVsSword(A, B);
    for (let i = 0; i < knights.length; i++) {
      const K = knights[i];
      this.worldCd[i] -= dt;
      if (!K.sword.free && !K.opponent.defeated && !K.defeated) this.swordVsBody(K, K.opponent);
      this.swordVsWorld(K, i);
    }
  }

  // ---------- blade against blade ----------
  testSegments(a0, a1, ap0, ap1, ra, b0, b1, bp0, bp1, rb) {
    const R = ra + rb;
    const c = closestSegSeg(a0, a1, b0, b1, cl);
    if (c.dist2 < R * R) {
      const d = Math.sqrt(c.dist2);
      if (d > 1e-5) hitInfo.n.subVectors(c.c1, c.c2).divideScalar(d);
      else {
        // Exactly crossing: use the previous separation to know which side we came from.
        const p = closestSegSeg(ap0, ap1, bp0, bp1, cl2);
        hitInfo.n.subVectors(p.c1, p.c2);
        if (hitInfo.n.lengthSq() < 1e-10) hitInfo.n.set(0, 1, 0);
        hitInfo.n.normalize();
      }
      hitInfo.pen = R - d;
      hitInfo.pa.copy(c.c1); hitInfo.pb.copy(c.c2); hitInfo.sa = c.s; hitInfo.sb = c.t;
      return true;
    }
    // Swept test: did the two segments pass through each other since the last substep?
    const p = closestSegSeg(ap0, ap1, bp0, bp1, cl2);
    if (p.dist2 > 0.35 * 0.35) return false;
    _s0.subVectors(p.c1, p.c2); _s1.subVectors(c.c1, c.c2);
    if (_s0.dot(_s1) < 0 && interior(p) && interior(c)) {
      hitInfo.n.copy(_s0).normalize();
      hitInfo.pen = Math.min(0.25, R + Math.sqrt(c.dist2));
      hitInfo.pa.copy(c.c1); hitInfo.pb.copy(c.c2); hitInfo.sa = c.s; hitInfo.sb = c.t;
      return true;
    }
    return false;
  }

  swordVsSword(A, B) {
    const a = A.sword, b = B.sword;
    if (this.testSegments(a.base, a.tip, a.prevBase, a.prevTip, SWORD.bladeR, b.base, b.tip, b.prevBase, b.prevTip, SWORD.bladeR))
      this.respondSwords(A, B, 'blade', 'blade');
    else if (this.testSegments(a.base, a.tip, a.prevBase, a.prevTip, SWORD.bladeR, b.guardA, b.guardB, b.prevGuardA, b.prevGuardB, SWORD.guardR))
      this.respondSwords(A, B, 'blade', 'guard');
    else if (this.testSegments(a.guardA, a.guardB, a.prevGuardA, a.prevGuardB, SWORD.guardR, b.base, b.tip, b.prevBase, b.prevTip, SWORD.bladeR))
      this.respondSwords(A, B, 'guard', 'blade');
  }

  respondSwords(A, B, partA, partB) {
    const sA = A.sword, sB = B.sword, n = hitInfo.n;
    _pa.copy(hitInfo.pa); _pb.copy(hitInfo.pb);
    sA.pointVel(_pa, _ua); sB.pointVel(_pb, _ub);
    _vr.subVectors(_ua, _ub);
    const vn = _vr.dot(n);
    const kA = sA.invMassAt(_pa, n), kB = sB.invMassAt(_pb, n);
    let J = 0, vt = 0;
    if (vn < 0) {
      const parry = A.combat.parryT > 0 || B.combat.parryT > 0;
      const e = parry ? 0.6 : 0.15;
      J = (-(1 + e) * vn) / (kA + kB);
      _imp.copy(n).multiplyScalar(J); sA.applyImpulse(_pa, _imp);
      _imp.negate(); sB.applyImpulse(_pb, _imp);
      // Friction: blades scrape along one another rather than sticking.
      _vt.copy(_vr).addScaledVector(n, -vn);
      vt = _vt.length();
      if (vt > 1e-3) {
        _vt.multiplyScalar(1 / vt);
        const kt = sA.invMassAt(_pa, _vt) + sB.invMassAt(_pb, _vt);
        const jt = Math.min(0.22 * J, vt / kt);
        _imp.copy(_vt).multiplyScalar(-jt); sA.applyImpulse(_pa, _imp);
        _imp.negate(); sB.applyImpulse(_pb, _imp);
      }
    }
    const corr = Math.min(0.25, Math.max(0, hitInfo.pen - 0.002));
    if (corr > 0) {
      const wA = kA / (kA + kB);
      sA.nudge(_pa, _d.copy(n).multiplyScalar(corr * wA));
      sB.nudge(_pb, _d.copy(n).multiplyScalar(-corr * (1 - wA)));
    }
    const fracA = partA === 'guard' ? 0 : hitInfo.sa;
    const fracB = partB === 'guard' ? 0 : hitInfo.sb;
    if (J > 0.5 && this.clashCd <= 0) {
      this.clashCd = 0.1;
      this.duel.onSwordClash(A, B, J, _pa, vt, fracA, fracB);
    } else if (J <= 0.5 && vt > 2.5 && this.scrapeCd <= 0) {
      this.scrapeCd = 0.18;
      this.duel.emit({ type: 'scrape', p: _pa.clone(), v: vt });
    }
  }

  // ---------- blade against body ----------
  swordVsBody(K, O) {
    const s = K.sword, caps = O.body.caps;
    let best = -1, bestS = 2, bestCap = null, bestT = 0;
    for (let i = 0; i < SAMPLES.length; i++) {
      for (let c = 0; c < caps.length; c++) {
        const cap = caps[c];
        const R = cap.r + (SAMPLES[i].part === 'guard' ? SWORD.guardR : SWORD.bladeR);
        closestSegSeg(s.prev[i], s.cur[i], cap.a, cap.b, cl);
        if (cl.dist2 < R * R && cl.s < bestS) {
          bestS = cl.s; best = i; bestCap = cap; bestT = cl.t;
          _p.copy(cl.c1); _n.subVectors(cl.c1, cl.c2);
        }
      }
    }
    if (best < 0) return;
    const sample = SAMPLES[best], cap = bestCap;
    const R = cap.r + SWORD.bladeR;
    s.pointVel(s.cur[best], _u);
    if (_n.lengthSq() < 1e-8) _n.copy(_u).negate();
    _n.normalize();
    const vn = _u.dot(_n);
    // Penetration of the sample's current position
    closestSegSeg(s.cur[best], s.cur[best], cap.a, cap.b, cl3);
    _tmp.subVectors(s.cur[best], cl3.c2);
    const through = _tmp.dot(_n) < 0;
    const dist = Math.sqrt(cl3.dist2);
    const pen = through ? R + dist : R - dist;

    if (vn > -0.4) { // resting contact: just keep the blade outside
      if (pen > 0) s.nudge(s.cur[best], _d.copy(_n).multiplyScalar(Math.min(0.08, pen)));
      return;
    }
    const kS = s.invMassAt(s.cur[best], _n);
    const mEff = 1 / kS;
    const E = 0.5 * mEff * vn * vn;

    // How the steel met the target: edge, flat, point, cross or pommel.
    const uLen = _u.length() || 1;
    const ue = _u.dot(s.edge) / uLen, uf = _u.dot(s.flat) / uLen, ua = _u.dot(s.axis) / uLen;
    const edgeAlign = Math.abs(ue) / Math.max(1e-3, Math.hypot(ue, uf));
    const thrust = sample.part === 'tip' && ua > 0.7;

    O.dirToLocal(_n, _nl);
    const [zoneId, gap, joint] = zoneForHit(cap.name, bestT, _nl);
    let result = null;
    const can = (K.combat.striking || E > 18) && !K.combat.hitSet.has(cap.name) && E > 3;
    if (can) {
      K.combat.hitSet.add(cap.name);
      result = resolveHit(O, zoneId, { E, edgeAlign, thrust, part: sample.part, gap, joint });
    }
    const penetrate = result && result.penetrate;
    const restitution = gap ? 0.1 : 0.3;
    const J = -vn * mEff * (penetrate ? 0.45 : 1 + restitution);
    _imp.copy(_n).multiplyScalar(J);
    s.applyImpulse(s.cur[best], _imp);
    if (!penetrate && pen > 0) s.nudge(s.cur[best], _d.copy(_n).multiplyScalar(Math.min(0.12, pen)));
    _imp.negate();
    O.receiveImpact(_imp, s.cur[best], cap, result);
    if (result) {
      this.duel.onBodyHit(K, O, result, s.cur[best], _n, J, sample.part);
      if (!penetrate && J > 3) K.combat.deflect('armour');
    }
  }

  // ---------- blade against stone ----------
  swordVsWorld(K, idx) {
    const s = K.sword;
    for (let i = 0; i < SAMPLES.length; i++) {
      const p = s.cur[i];
      const r = Math.hypot(p.x, p.z);
      let pen = 0;
      if (p.y < 0.012) { _n.set(0, 1, 0); pen = 0.012 - p.y; }
      else if (r > ARENA_R) { _n.set(-p.x / r, 0, -p.z / r); pen = r - ARENA_R; }
      else continue;
      s.pointVel(p, _u);
      const vn = _u.dot(_n);
      if (vn < 0) {
        const k = s.invMassAt(p, _n);
        const J = (-(s.free ? 1.3 : 1.25) * vn) / k;
        _imp.copy(_n).multiplyScalar(J); s.applyImpulse(p, _imp);
        _vt.copy(_u).addScaledVector(_n, -vn);
        const vt = _vt.length();
        if (vt > 1e-3) {
          _vt.multiplyScalar(1 / vt);
          const jt = Math.min(0.45 * J, vt / s.invMassAt(p, _vt));
          _imp.copy(_vt).multiplyScalar(-jt); s.applyImpulse(p, _imp);
        }
        if (-vn > 2.2 && this.worldCd[idx] <= 0) {
          this.worldCd[idx] = 0.15;
          this.duel.emit({ type: 'stone', p: p.clone(), v: -vn, dropped: s.free });
        }
      }
      if (s.free && _u.lengthSq() < 0.25) { s.comVel.multiplyScalar(0.92); s.w.multiplyScalar(0.9); }
      s.nudge(p, _d.copy(_n).multiplyScalar(pen));
    }
  }
}
