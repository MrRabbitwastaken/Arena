import { THREE } from './three.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const rand = (a, b) => a + Math.random() * (b - a);

export function wrapAngle(a) {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
export const dampAngle = (a, b, lambda, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));

export function makeClosest() {
  return { s: 0, t: 0, dist2: 0, c1: new THREE.Vector3(), c2: new THREE.Vector3() };
}

const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _r = new THREE.Vector3();
// Closest points between segments p1-q1 and p2-q2 (Ericson, Real-Time Collision Detection 5.1.9)
export function closestSegSeg(p1, q1, p2, q2, out) {
  _d1.subVectors(q1, p1); _d2.subVectors(q2, p2); _r.subVectors(p1, p2);
  const a = _d1.dot(_d1), e = _d2.dot(_d2), f = _d2.dot(_r);
  const EPS = 1e-9;
  let s, t;
  if (a <= EPS && e <= EPS) { s = 0; t = 0; }
  else if (a <= EPS) { s = 0; t = clamp(f / e, 0, 1); }
  else {
    const c = _d1.dot(_r);
    if (e <= EPS) { t = 0; s = clamp(-c / a, 0, 1); }
    else {
      const b = _d1.dot(_d2);
      const denom = a * e - b * b;
      s = denom > EPS ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = clamp((b - c) / a, 0, 1); }
    }
  }
  out.s = s; out.t = t;
  out.c1.copy(p1).addScaledVector(_d1, s);
  out.c2.copy(p2).addScaledVector(_d2, t);
  out.dist2 = out.c1.distanceToSquared(out.c2);
  return out;
}

const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
// Sword frame: local +Y along the blade, local +X the leading edge, local +Z the flat.
export function quatFromBladeEdge(blade, edge, out) {
  _y.copy(blade).normalize();
  _x.copy(edge).addScaledVector(_y, -edge.dot(_y));
  if (_x.lengthSq() < 1e-6) {
    _x.set(0, 0, 1).addScaledVector(_y, -_y.z);
    if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0).addScaledVector(_y, -_y.x);
  }
  _x.normalize();
  _z.crossVectors(_x, _y);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

// Basis whose +Y points from b to a (limb segments hang down -Y from their origin joint).
export function quatFromSegment(a, b, hint, out) {
  _y.subVectors(a, b);
  if (_y.lengthSq() < 1e-8) _y.set(0, 1, 0);
  _y.normalize();
  _z.copy(hint).addScaledVector(_y, -hint.dot(_y));
  if (_z.lengthSq() < 1e-6) { _z.set(0, 0, 1).addScaledVector(_y, -_y.z); if (_z.lengthSq() < 1e-6) _z.set(1, 0, 0); }
  _z.normalize();
  _x.crossVectors(_y, _z);
  _m.makeBasis(_x, _y, _z);
  return out.setFromRotationMatrix(_m);
}

const _q = new THREE.Quaternion();
// Rotation vector (axis * angle) that takes orientation `from` to `to`, shortest path.
export function rotationVector(from, to, out) {
  _q.copy(from).invert().premultiply(to);
  if (_q.w < 0) { _q.x = -_q.x; _q.y = -_q.y; _q.z = -_q.z; _q.w = -_q.w; }
  const w = Math.min(1, _q.w);
  const s = Math.sqrt(Math.max(0, 1 - w * w));
  if (s < 1e-6) return out.set(_q.x * 2, _q.y * 2, _q.z * 2);
  const ang = 2 * Math.acos(w);
  return out.set((_q.x / s) * ang, (_q.y / s) * ang, (_q.z / s) * ang);
}

// q <- q + 0.5 * (w,0) * q * dt
export function integrateQuat(q, w, dt) {
  const hx = w.x * dt * 0.5, hy = w.y * dt * 0.5, hz = w.z * dt * 0.5;
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  q.x = qx + hx * qw + hy * qz - hz * qy;
  q.y = qy + hy * qw + hz * qx - hx * qz;
  q.z = qz + hz * qw + hx * qy - hy * qx;
  q.w = qw - hx * qx - hy * qy - hz * qz;
  q.normalize();
}
