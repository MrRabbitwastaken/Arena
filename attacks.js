import { THREE } from '../core/three.js';

// Knight-local frame: +Z forward (towards the opponent), +Y up, +X is the knight's LEFT
// (a right-handed frame looking down +Z). Attacks are not animations: each one is an arc
// the hands *try* to drive the blade along. The physics decides how fast the blade actually
// gets there and what happens when something is in the way.
//
// Base definitions start on the knight's left (+X); "R" variants are mirrored.
const BASE = {
  overhead: { bW: [0.0, 0.72, -0.69], bMid: [0, 0.15, 1], follow: 0.9,
    hW: [0.05, 1.62, 0.06], hMid: [0, 1.38, 0.5], hS: [0, 0.98, 0.42],
    windup: 0.46, omega: 11, accel: 78, torque: 82, stamina: 18, recovery: 0.66 },
  desc: { bW: [0.62, 0.6, -0.5], bMid: [-0.08, 0.15, 1], follow: 0.85,
    hW: [0.32, 1.52, 0.08], hMid: [0, 1.3, 0.5], hS: [-0.35, 0.98, 0.32],
    windup: 0.42, omega: 10.5, accel: 72, torque: 76, stamina: 16, recovery: 0.58 },
  horiz: { bW: [0.88, 0.12, -0.45], bMid: [0, -0.03, 1], follow: 1.0,
    hW: [0.36, 1.28, 0.1], hMid: [0, 1.2, 0.52], hS: [-0.38, 1.18, 0.25],
    windup: 0.40, omega: 10, accel: 70, torque: 72, stamina: 15, recovery: 0.54 },
  rise: { bW: [0.6, -0.5, -0.45], bMid: [0.05, 0.12, 1], follow: 0.8,
    hW: [0.3, 0.9, 0.15], hMid: [0, 1.1, 0.5], hS: [-0.3, 1.45, 0.3],
    windup: 0.34, omega: 9.5, accel: 62, torque: 62, stamina: 12, recovery: 0.48 },
  thrust: { thrust: true, hW: [0.0, 1.12, -0.02], hS: [0, 1.3, 0.62], aimY: 1.48,
    windup: 0.30, speed: 3.6, accel: 22, stamina: 10, recovery: 0.44 },
};

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const N = (a) => V(a).normalize();

function build(id, label, b, mirror) {
  const m = (a) => [mirror ? -a[0] : a[0], a[1], a[2]];
  const A = { id, label, windup: b.windup, stamina: b.stamina, recovery: b.recovery };
  if (b.thrust) {
    Object.assign(A, { thrust: true, hW: V(b.hW), hS: V(b.hS), speed: b.speed, accel: b.accel, aimY: b.aimY });
    return A;
  }
  A.bW = N(m(b.bW)); A.bMid = N(m(b.bMid));
  A.axis = new THREE.Vector3().crossVectors(A.bW, A.bMid).normalize();
  A.midAngle = A.bW.angleTo(A.bMid);
  A.total = A.midAngle + b.follow;
  A.hW = V(m(b.hW)); A.hMid = V(m(b.hMid)); A.hS = V(m(b.hS));
  Object.assign(A, { omega: b.omega, accel: b.accel, torque: b.torque });
  return A;
}

export const ATTACKS = {
  overhead: build('overhead', 'Overhead cut', BASE.overhead, false),
  descL: build('descL', 'Descending cut from the left', BASE.desc, false),
  descR: build('descR', 'Descending cut from the right', BASE.desc, true),
  horizL: build('horizL', 'Horizontal cut, left to right', BASE.horiz, false),
  horizR: build('horizR', 'Horizontal cut, right to left', BASE.horiz, true),
  riseL: build('riseL', 'Rising cut from the left', BASE.rise, false),
  riseR: build('riseR', 'Rising cut from the right', BASE.rise, true),
  thrust: build('thrust', 'Thrust', BASE.thrust, false),
};
export const ATTACK_IDS = Object.keys(ATTACKS);

// Screen-space mouse swipe -> attack. The swipe describes the direction the blade travels.
export function attackFromSwipe(sx, sy, threshold = 14) {
  if (Math.hypot(sx, sy) < threshold) return 'thrust';
  const a = (Math.atan2(-sy, sx) * 180) / Math.PI; // up is positive
  if (a > -22.5 && a <= 22.5) return 'horizL';
  if (a > 22.5 && a <= 67.5) return 'riseL';
  if (a > 67.5 && a <= 157.5) return 'riseR';
  if (a > 157.5 || a <= -157.5) return 'horizR';
  if (a > -157.5 && a <= -112.5) return 'descR';
  if (a > -112.5 && a <= -67.5) return 'overhead';
  return 'descL';
}

// Where the *defender* must put their guard (guard cursor: +x = defender's right, +y = up).
// An attack from the attacker's left arrives on the defender's right.
export const GUARD_FOR = {
  overhead: [0.2, 0.8], descL: [0.55, 0.35], descR: [-0.8, 0.15],
  horizL: [0.9, -0.1], horizR: [-0.9, -0.1], riseL: [0.3, -0.5], riseR: [-0.5, -0.4], thrust: [-0.2, -0.4],
};

// For the HUD compass: the screen direction each attack travels.
export const ATTACK_SCREEN_DIR = {
  horizL: 0, riseL: 45, riseR: 112, horizR: 180, descR: -135, overhead: -90, descL: -45,
};
