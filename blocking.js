import { THREE } from '../core/three.js';

const P = (x, y, z) => new THREE.Vector3(x, y, z);
const D = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

// Guard positions, indexed by guard-cursor angle (cursor +x = knight's right = local -X).
// A guard is only a place the hands try to hold the blade. It stops a cut only if the
// blades actually meet.
const RING = [
  { h: P(-0.32, 0.95, 0.40), b: D(-0.18, 0.94, 0.30) },  // right: point up, hands low, covers torso to head
  { h: P(-0.36, 1.45, 0.34), b: D(-0.62, 0.74, 0.25) },  // up-right
  { h: P(-0.30, 1.75, 0.25), b: D(0.95, 0.25, 0.20) },   // up: blade across, above the helmet
  { h: P(0.05, 1.60, 0.32), b: D(0.72, 0.64, 0.25) },    // up-left
  { h: P(0.32, 0.95, 0.40), b: D(0.18, 0.94, 0.30) },    // left
  { h: P(0.26, 1.00, 0.40), b: D(0.35, -0.60, 0.72) },   // down-left: point hanging towards the legs
  { h: P(-0.02, 1.02, 0.44), b: D(0.0, -0.55, 0.84) },   // down
  { h: P(-0.26, 1.00, 0.40), b: D(-0.35, -0.60, 0.72) }, // down-right
];
export const CENTER = { h: P(-0.10, 1.10, 0.42), b: D(0.3, 0.78, 0.55) };
// At rest the point is high and off to the right, so two idle blades do not tangle.
export const IDLE = { h: P(-0.16, 1.00, 0.36), b: D(-0.10, 0.85, 0.50) };
export const STAGGER = { h: P(-0.12, 0.9, 0.28), b: D(-0.25, 0.05, 0.95) };

const _h = new THREE.Vector3(), _b = new THREE.Vector3();

export function guardPose(gx, gy, outH, outB) {
  const m = Math.min(1, Math.hypot(gx, gy));
  if (m < 1e-3) { outH.copy(CENTER.h); outB.copy(CENTER.b); return; }
  let a = Math.atan2(gy, gx);
  if (a < 0) a += Math.PI * 2;
  const f = a / (Math.PI / 4);
  const i = Math.floor(f) % 8, j = (i + 1) % 8, t = f - Math.floor(f);
  _h.lerpVectors(RING[i].h, RING[j].h, t);
  _b.lerpVectors(RING[i].b, RING[j].b, t).normalize();
  outH.lerpVectors(CENTER.h, _h, m);
  outB.lerpVectors(CENTER.b, _b, m).normalize();
}

// Edge facing the opponent where possible.
export function edgeHint(blade, out) {
  out.set(0, 0, 1).addScaledVector(blade, -blade.z);
  if (out.lengthSq() < 1e-4) out.set(0, 1, 0).addScaledVector(blade, -blade.y);
  return out.normalize();
}

// Called when two swords collide with a meaningful impulse J (N·s).
// sA / sB: where along each blade the contact was (0 = cross, 1 = tip).
export function resolveClash(A, B, J, sA, sB) {
  const ca = A.combat, cb = B.combat;
  if (ca.state === 'strike' && cb.state === 'strike') {
    ca.deflect('clash'); cb.deflect('clash');
    return { kind: 'clash' };
  }
  const pairs = [[A, B, sB], [B, A, sA]];
  for (const [att, def, sDef] of pairs) {
    const c = att.combat, d = def.combat;
    if (!c.striking || c.deflected) continue;
    if (d.state === 'block') {
      d.parryContact = true;
      if (d.parryT > 0) {
        c.deflect('parried');
        d.onParry();
        att.stamina.spend(6); def.stamina.spend(3);
        def.stats.parries++;
        return { kind: 'parry', defender: def, attacker: att };
      }
      const cost = J * 2.6 * c.power * (1.4 - 0.4 * def.armControl());
      def.stamina.spend(cost);
      def.stats.blocks++;
      // Catching the blow near your own cross (the forte) leaves you in control.
      d.riposteT = sDef < 0.55 ? 0.5 : 0.22;
      if (def.stamina.value <= 0.5) {
        d.guardBreak(); c.deflect('blocked');
        return { kind: 'guardbreak', defender: def, attacker: att };
      }
      if (J > 1.2) c.deflect('blocked');
      return { kind: J > 1.2 ? 'block' : 'slide', defender: def, attacker: att };
    }
    if (J > 2.2) {
      c.deflect('blocked');
      if (!d.attacking) def.stats.blocks++;
      return { kind: 'intercept', defender: def, attacker: att };
    }
    return { kind: 'touch' };
  }
  return { kind: 'touch' };
}
