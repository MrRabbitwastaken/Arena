import { THREE } from '../core/three.js';
import { clamp, damp, dampAngle } from '../core/math.js';

const WALL_R = 12.95;
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _piv = new THREE.Vector3(), _pos = new THREE.Vector3(), _look = new THREE.Vector3();

// Over-the-shoulder third-person camera. In lock-on it keeps the opponent in frame; the
// mouse still nudges the view (and chooses attack directions).
export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.yaw = 0; this.pitch = 0.17; this.dist = 3.3; this.targetDist = 3.3;
    this.pivot = new THREE.Vector3(0, 1.6, -2.6);
    this.shake = 0; this.t = 0; this.baseFov = camera.fov; this.kick = 0;
  }

  addShake(a) { this.shake = Math.min(1, this.shake + a); }
  addKick(a) { this.kick = Math.min(1, this.kick + a); }

  snapBehind(k) {
    this.yaw = k.yaw;
    this.pivot.set(k.pos.x, 1.6, k.pos.z);
  }

  update(dt, P, E, opts) {
    this.t += dt;
    if (opts.menu) {
      this.yaw += dt * 0.05;
      _piv.set(0, 1.3, 0);
      this.pivot.lerp(_piv, 1 - Math.exp(-2 * dt));
      this.dist = damp(this.dist, 9.5, 1.5, dt);
      this.pitch = damp(this.pitch, 0.2, 1.5, dt);
    } else {
      if (opts.lockOn && E && !P.defeated) {
        const target = Math.atan2(E.pos.x - P.pos.x, E.pos.z - P.pos.z) + opts.yawOffset;
        this.yaw = dampAngle(this.yaw, target, 7, dt);
      }
      _r.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
      const bob = Math.sin(P.pose.phase * 2) * Math.min(1, Math.hypot(P.vel.x, P.vel.z) / 2) * 0.018;
      _piv.set(P.pos.x, 1.62 + bob - (P.defeated ? 0.6 : 0), P.pos.z).addScaledVector(_r, 0.42);
      this.pivot.lerp(_piv, 1 - Math.exp(-14 * dt));
      this.dist = damp(this.dist, this.targetDist, 8, dt);
    }
    const cp = Math.cos(this.pitch);
    _f.set(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    // Pull the camera in rather than pass through the arena wall.
    let d = this.dist;
    if (!opts.menu) {
      const px = this.pivot.x, pz = this.pivot.z, fx = -_f.x, fz = -_f.z;
      const a = fx * fx + fz * fz, b = 2 * (px * fx + pz * fz), c = px * px + pz * pz - WALL_R * WALL_R;
      if (a > 1e-6) {
        const disc = b * b - 4 * a * c;
        if (disc > 0) { const t = (-b + Math.sqrt(disc)) / (2 * a); if (t > 0) d = Math.min(d, t); }
      }
      d = Math.max(0.9, d);
    }
    _pos.copy(this.pivot).addScaledVector(_f, -d);
    _pos.y = Math.max(0.35, _pos.y);

    // Impacts: a short, decaying jolt and a slight FOV punch. Never a cut.
    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.kick = Math.max(0, this.kick - dt * 3.5);
    const s = this.shake * this.shake * 0.09;
    if (s > 0) _pos.add(_r.set(Math.sin(this.t * 61) * s, Math.sin(this.t * 53 + 1) * s, Math.sin(this.t * 47 + 2) * s));
    const daze = opts.daze || 0;
    this.cam.position.copy(_pos);
    _look.copy(this.pivot).addScaledVector(_f, 6);
    if (daze > 0) { _look.x += Math.sin(this.t * 1.7) * daze * 0.25; _look.y += Math.sin(this.t * 1.3) * daze * 0.15; }
    this.cam.lookAt(_look);
    const fov = this.baseFov + this.kick * 3;
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov = fov; this.cam.updateProjectionMatrix(); }
  }
}
