import { GUARD_FOR } from './attacks.js';
import { clamp, rand } from '../core/math.js';

const WEIGHTS = [['horizL', 1.1], ['horizR', 1.1], ['descL', 1], ['descR', 1], ['overhead', 0.8], ['riseL', 0.6], ['riseR', 0.6], ['thrust', 0.7]];

function weightedPick(exclude) {
  let total = 0;
  for (const [id, w] of WEIGHTS) if (id !== exclude) total += w;
  let r = Math.random() * total;
  for (const [id, w] of WEIGHTS) { if (id === exclude) continue; r -= w; if (r <= 0) return id; }
  return 'horizL';
}

// The opponent drives a knight through exactly the same intent interface as the player:
// move, face, attack in a direction, hold a guard. It perceives the player through a
// reaction delay and has no access to anything the player could not see.
export class CombatAI {
  constructor(k, skill = 0.7) { this.k = k; this.skill = skill; this.reset(); }

  reset() {
    this.mem = []; this.time = 0;
    this.attackCd = rand(1.4, 2.4);
    this.strafeDir = Math.random() < 0.5 ? 1 : -1; this.strafeT = rand(1.5, 3);
    this.threatKey = -1; this.parryPlan = false; this.backstep = false; this.abortOwn = false;
    this.gTarget = [0, 0]; this.blockLinger = 0;
    this.charge = 0; this.feintPlan = false; this.feintHold = 0; this.feintAgainAt = -1;
    this.engage = false; this.lastId = null; this.jitter = rand(-0.02, 0.05);
  }

  impairment() {
    const k = this.k;
    return (1 - k.injury.blood) * 0.8 + k.injury.daze * 0.3 + (1 - k.armControl()) * 0.25 + (1 - k.legFactor()) * 0.15;
  }

  update(dt) {
    const k = this.k, o = k.opponent, I = k.intent;
    this.time += dt;
    I.sprint = false;
    if (k.defeated) { I.move.set(0, 0); I.blockHeld = false; I.attackHeld = false; return; }
    const dx = o.pos.x - k.pos.x, dz = o.pos.z - k.pos.z;
    const dist = Math.hypot(dx, dz) || 1e-3, nx = dx / dist, nz = dz / dist;
    I.faceYaw = Math.atan2(dx, dz);
    if (o.defeated) {
      I.blockHeld = false; I.attackHeld = false;
      const r = clamp((dist - 3.2) * 1.2, -1, 1);
      I.move.set(nx * r * 0.4, nz * r * 0.4);
      return;
    }

    // Perception, delayed by a human-like reaction time.
    const c = o.combat;
    this.mem.push({ t: this.time, s: c.state, id: c.atkId, serial: c.serial, gx: c.guardX, gy: c.guardY });
    const impair = this.impairment();
    const reaction = 0.17 + (1 - this.skill) * 0.16 + impair * 0.25 + (k.stamina.value < 25 ? 0.06 : 0) + this.jitter;
    while (this.mem.length > 1 && this.mem[1].t <= this.time - reaction) this.mem.shift();
    const seen = this.mem[0];
    const threat = (seen.s === 'windup' || seen.s === 'strike') && dist < 3.3;
    const my = k.combat.state;

    // ----- defence -----
    if (threat) {
      if (this.threatKey !== seen.serial) { this.threatKey = seen.serial; this.decideDefence(seen, dist, impair); }
      if (this.abortOwn || !k.combat.attacking) {
        I.gx = this.gTarget[0]; I.gy = this.gTarget[1];
        I.blockHeld = this.parryPlan ? seen.s === 'strike' : true;
        I.attackHeld = false;
        this.blockLinger = 0.25 + rand(0, 0.15);
      }
    } else {
      this.abortOwn = false;
      if (this.blockLinger > 0) { this.blockLinger -= dt; I.blockHeld = true; }
      else if (this.feintHold <= 0) I.blockHeld = false;
    }

    // ----- offence -----
    this.attackCd -= dt;
    const opening = seen.s === 'recover' || seen.s === 'stagger' || k.combat.riposteT > 0;
    const free = (my === 'idle' || (my === 'block' && !threat && this.blockLinger <= 0)) && !threat;
    if (free && k.stamina.value > 26 && this.feintAgainAt < 0) {
      if (opening && dist < 2.4 && Math.random() < (0.5 + 0.4 * this.skill) * dt * 8) this.attack(seen, true, impair);
      else if (this.attackCd <= 0) { this.engage = true; if (dist < 2.05) this.attack(seen, false, impair); }
    }
    if (my === 'windup') {
      I.attackHeld = k.combat.t < k.combat.windupDur + this.charge;
      if (this.feintPlan && k.combat.t > k.combat.windupDur * 0.6) {
        this.feintPlan = false; this.feintHold = 0.22; this.feintAgainAt = this.time + rand(0.28, 0.45);
      }
    } else I.attackHeld = false;
    if (this.feintHold > 0) { this.feintHold -= dt; I.blockHeld = true; }
    if (this.feintAgainAt > 0 && this.time >= this.feintAgainAt) {
      this.feintAgainAt = -1;
      if (my === 'block' || my === 'idle') { I.blockHeld = false; I.attackPress = this.choose(seen, this.lastId); this.lastId = I.attackPress; this.charge = 0; }
    }

    // ----- footwork -----
    let desired = 2.3;
    if (this.engage || k.combat.attacking) desired = 1.55;
    if (k.stamina.value < 30) desired += 0.7;
    desired += impair * 0.8;
    if (this.time - k.lastHitT < 1.0) desired += 0.5;
    if (threat && this.backstep) desired += 0.9;
    const radial = clamp((dist - desired) * 1.5, -1, 1);
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafeDir = Math.random() < 0.25 ? 0 : Math.random() < 0.5 ? 1 : -1; this.strafeT = rand(1.2, 3.2); }
    const strafe = this.strafeDir * 0.55 * (k.combat.attacking ? 0.3 : 1);
    let mx = nx * radial + nz * strafe, mz = nz * radial - nx * strafe;
    const r = Math.hypot(k.pos.x, k.pos.z);
    if (r > 9.5) { const w = (r - 9.5) * 0.6; mx -= (k.pos.x / r) * w; mz -= (k.pos.z / r) * w; }
    I.move.set(mx, mz);
    // Dodge back from a committed heavy blow now and then.
    if (threat && this.backstep && seen.s === 'strike' && dist < 2.1 && k.stamina.value > 30 && Math.random() < dt * 6) { I.dodge = true; this.backstep = false; }
  }

  decideDefence(seen, dist, impair) {
    const k = this.k;
    const g = GUARD_FOR[seen.id] || [0, 0];
    let gx = g[0], gy = g[1];
    const err = 0.1 + (1 - this.skill) * 0.35 + impair * 0.4 + (k.stamina.value < 20 ? 0.15 : 0);
    if (Math.random() < err) {
      const a = Math.atan2(gy, gx) + (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 4) * (Math.random() < 0.3 ? 2 : 1);
      const m = Math.max(0.6, Math.hypot(gx, gy));
      gx = Math.cos(a) * m; gy = Math.sin(a) * m;
    }
    // Lean the guard towards an injured arm.
    const armBias = (k.injury.side('L') - k.injury.side('R')) * 0.2;
    this.gTarget = [clamp(gx + armBias, -1, 1), gy];
    this.parryPlan = Math.random() < this.skill * 0.55 * k.stamina.factor * (1 - impair * 0.5);
    this.abortOwn = k.combat.state === 'windup' && k.combat.t < k.combat.windupDur * 0.8 && Math.random() < 0.5 * this.skill;
    this.backstep = !this.parryPlan && Math.random() < 0.18 && dist > 1.8;
  }

  attack(seen, fast, impair) {
    const I = this.k.intent;
    const id = this.choose(seen, null);
    I.attackPress = id; this.lastId = id;
    this.charge = fast ? 0 : rand(0, 0.3) * this.skill;
    this.attackCd = rand(1.1, 2.6) * (1 + impair);
    this.engage = false;
    this.feintPlan = !fast && Math.random() < 0.15 * this.skill && this.k.stamina.value > 45;
  }

  // Attack where the opponent's guard is not.
  choose(seen, exclude) {
    if (seen.s === 'block' || Math.random() < 0.5 * this.skill) {
      let bestId = null, bestD = -1;
      for (let i = 0; i < 4; i++) {
        const id = weightedPick(exclude);
        const g = GUARD_FOR[id];
        const d = Math.hypot(g[0] - seen.gx, g[1] - seen.gy) + Math.random() * 0.3;
        if (d > bestD) { bestD = d; bestId = id; }
      }
      return bestId;
    }
    return weightedPick(exclude);
  }
}
