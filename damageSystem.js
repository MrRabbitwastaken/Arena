import { ZONES, ZONE_IDS } from './armourSystem.js';
import { clamp } from '../core/math.js';

export const OUTCOMES = {
  none: 'No meaningful damage',
  minor: 'Minor impact',
  blunt: 'Blunt trauma',
  deform: 'Armour deformation',
  joint: 'Joint injury',
  wound: 'Deep wound',
  severe: 'Severe limb damage',
};
const SEVERITY = { none: 0, minor: 1, blunt: 2, deform: 2, joint: 3, wound: 4, severe: 5 };

export class InjuryState {
  constructor() { this.reset(); }
  reset() {
    this.zones = {};
    for (const id of ZONE_IDS) this.zones[id] = { integrity: 1, func: 1, bleed: 0, trauma: 0, worst: 'none' };
    this.blood = 1;
    this.consciousness = 1;
    this.daze = 0;
    this.log = [];
  }
  side(s) {
    const z = this.zones;
    return Math.min(z['shoulder' + s].func, z['upperArm' + s].func, z['forearm' + s].func, z['hand' + s].func);
  }
  rawArms() {
    const L = this.side('L'), R = this.side('R');
    if (Math.min(L, R) < 0.1) return Math.max(L, R) * 0.45; // one usable arm on a two-handed sword
    return (L + R) / 2;
  }
  armControl() { return 0.25 + 0.75 * this.rawArms(); }
  leg(s) {
    const z = this.zones;
    return Math.min(z['thigh' + s].func, z['knee' + s].func, z['lowerLeg' + s].func, (z['foot' + s].func + 1) / 2);
  }
  rawLegs() { return (this.leg('L') + this.leg('R')) / 2; }
  legFactor() { return 0.3 + 0.7 * this.rawLegs(); }
  torso() { return Math.min(this.zones.chest.func, this.zones.abdomen.func); }
  bleeding() { let b = 0; for (const id of ZONE_IDS) b += this.zones[id].bleed; return b; }

  update(dt, k) {
    let bleed = 0;
    for (const id of ZONE_IDS) {
      const z = this.zones[id];
      bleed += z.bleed;
      z.bleed *= Math.exp(-0.025 * dt);
    }
    this.blood = Math.max(0, this.blood - bleed * dt);
    this.daze = Math.max(0, this.daze - dt);
    const cmax = Math.min(1, 0.35 + this.blood * 0.65);
    this.consciousness = Math.min(cmax, this.consciousness + 0.006 * dt);
    k.stamina.max = 100 * (0.6 + 0.4 * this.torso());
    k.stamina.regenMul = (0.35 + 0.65 * clamp((this.blood - 0.4) / 0.5, 0, 1)) * (0.6 + 0.4 * this.torso());
    if (k.defeated) return;
    if (this.consciousness <= 0) k.defeat('Knocked senseless');
    else if (this.blood <= 0.4) k.defeat(this.zones.neck.bleed > 0.01 ? 'Mortal wound to the neck' : 'Collapsed from blood loss');
    else if (this.rawLegs() < 0.15) k.defeat('Can no longer stand');
    else if (this.rawArms() < 0.1) k.defeat('Can no longer hold the sword');
  }
}

// Decide what a strike actually did. h: { E (J, normal impact energy), edgeAlign (0..1),
// thrust (bool), part ('blade'|'tip'|'guard'|'pommel'), gap, joint }.
export function resolveHit(target, zoneId, h) {
  const def = ZONES[zoneId], z = target.injury.zones[zoneId], inj = target.injury;
  const E = h.E;
  const res = { zoneId, label: def.label, gap: h.gap, joint: h.joint, E, key: 'none', outcome: OUTCOMES.none,
    penetrate: false, wound: 0, trauma: 0, dent: 0, stagger: 0, plate: !h.gap && def.plate > 0 };
  if (E < 4) return res;

  const cutting = h.part === 'blade' || h.part === 'tip';
  const edgeCut = cutting && !h.thrust && h.edgeAlign > 0.55;
  const thrustIn = h.thrust && h.part === 'tip';

  if (res.plate) {
    // Plate: cuts glance. Energy becomes a dent and blunt force behind it.
    const thick = def.plate;
    const dent = (E / (220 * thick)) * (h.part === 'pommel' ? 1.4 : 1);
    z.integrity = Math.max(0, z.integrity - dent);
    res.dent = dent;
    res.trauma = (E * (edgeCut ? 0.16 : 0.26)) / (0.55 + 0.3 * thick);
    if ((edgeCut || thrustIn) && z.integrity < 0.3) {
      // Badly damaged plate can finally be breached.
      const pen = (thrustIn ? E * 1.2 : E * h.edgeAlign) - 40 * thick * (0.3 + z.integrity);
      if (pen > 0) { res.wound = 0.25 + pen / 70; res.penetrate = true; }
    }
  } else {
    // Mail and padding over a gap.
    if (thrustIn) {
      const pen = E - 26;
      if (pen > 0) { res.wound = 0.3 + pen / 60; res.penetrate = true; } else res.trauma = E * 0.3;
    } else if (edgeCut) {
      const pen = E * h.edgeAlign - 30;
      if (pen > 0) { res.wound = 0.2 + pen / 50; res.penetrate = res.wound > 0.55; } else res.trauma = E * 0.35;
    } else res.trauma = E * 0.4;
  }
  res.wound = Math.min(1.2, res.wound);

  // Consequences
  const joint = h.joint && h.gap;
  if (def.vital === 'head') {
    inj.consciousness -= res.trauma * 0.021 + res.wound * 0.6;
    inj.daze = Math.max(inj.daze, res.trauma * 0.16);
  } else if (def.vital === 'neck') {
    z.func = Math.max(0, z.func - res.trauma * 0.02);
  } else if (def.vital === 'torso') {
    z.func = Math.max(0, z.func - res.trauma * 0.01);
    target.stamina.spend(res.trauma * 1.2);
  } else {
    z.func = Math.max(0, z.func - res.trauma * (joint ? 0.04 : 0.013));
  }
  if (res.wound > 0) {
    z.func = Math.max(0, z.func - res.wound * 0.6);
    const rate = def.vital === 'neck' ? 0.05 : def.vital === 'torso' ? 0.025 : def.vital === 'head' ? 0.03 : 0.016;
    z.bleed += res.wound * rate;
  }
  z.trauma += res.trauma;

  // Outcome
  let key = 'none';
  if (res.wound > 0.85 && def.limb) key = 'severe';
  else if (res.wound > 0) key = 'wound';
  else if (joint && res.trauma > 4) key = 'joint';
  else if (res.dent > 0.12) key = 'deform';
  else if (res.trauma > 5) key = 'blunt';
  else if (res.trauma > 1.5) key = 'minor';
  res.key = key; res.outcome = OUTCOMES[key];
  if (SEVERITY[key] > SEVERITY[z.worst]) z.worst = key;

  // Physical reaction
  const tired = 1.6 - 0.6 * target.stamina.factor;
  if (def.vital === 'head' && res.trauma > 4) res.stagger = (0.3 + res.trauma * 0.03) * tired;
  else if (def.vital === 'torso' && res.trauma > 6) res.stagger = (0.22 + res.trauma * 0.02) * tired;
  else if (def.limb && def.limb.startsWith('leg') && res.trauma > 6) res.stagger = 0.25 * tired;
  if (res.wound > 0.3) res.stagger = Math.max(res.stagger, 0.3);

  if (SEVERITY[key] >= 2) inj.log.push({ zone: def.label, outcome: res.outcome, key });
  return res;
}
