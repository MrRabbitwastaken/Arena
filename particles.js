import { THREE } from '../core/three.js';
import { rand } from '../core/math.js';

const VS = `attribute float size; attribute float alpha; attribute vec3 tint;
varying float vA; varying vec3 vC; uniform float uScale;
void main(){ vA = alpha; vC = tint; vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`;
const FS = `varying float vA; varying vec3 vC;
void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard;
  gl_FragColor = vec4(vC, smoothstep(0.5, 0.05, r) * vA); }`;

const SPARK = 0, BLOOD = 1, DUST = 2, FIRE = 3, MOTE = 4;

class Pool {
  constructor(scene, n, additive) {
    this.n = n; this.next = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.size = new Float32Array(n); this.size0 = new Float32Array(n);
    this.alpha = new Float32Array(n); this.alpha0 = new Float32Array(n);
    this.tint = new Float32Array(n * 3); this.kind = new Uint8Array(n);
    const g = new THREE.BufferGeometry();
    const attr = (name, arr, k) => { const a = new THREE.BufferAttribute(arr, k); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; };
    this.aPos = attr('position', this.pos, 3); this.aSize = attr('size', this.size, 1);
    this.aAlpha = attr('alpha', this.alpha, 1); this.aTint = attr('tint', this.tint, 3);
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { uScale: { value: 400 } } });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  spawn(p, vx, vy, vz, life, size, r, gg, b, kind, alpha = 1) {
    const i = this.next; this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.size0[i] = size; this.size[i] = size;
    this.alpha0[i] = alpha; this.alpha[i] = alpha;
    this.tint[i * 3] = r; this.tint[i * 3 + 1] = gg; this.tint[i * 3 + 2] = b; this.kind[i] = kind;
  }
  update(dt, onGround) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; } continue; }
      this.life[i] -= dt;
      const k = this.kind[i], t = this.life[i] / this.max[i], j = i * 3;
      const grav = k === SPARK ? 9.8 : k === BLOOD ? 9.8 : k === FIRE ? -1.6 : k === DUST ? -0.08 : 0;
      const drag = k === DUST ? 2.2 : k === FIRE ? 1.5 : k === MOTE ? 0.2 : 0.4;
      this.vel[j + 1] -= grav * dt;
      const f = Math.exp(-drag * dt);
      this.vel[j] *= f; this.vel[j + 1] *= f; this.vel[j + 2] *= f;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.01 && (k === SPARK || k === BLOOD)) {
        if (k === BLOOD) { onGround && onGround(this.pos[j], this.pos[j + 2]); this.life[i] = 0; }
        else { this.pos[j + 1] = 0.01; this.vel[j + 1] *= -0.3; this.vel[j] *= 0.6; this.vel[j + 2] *= 0.6; }
      }
      if (k === FIRE) {
        this.tint[j] = 1; this.tint[j + 1] = 0.35 + t * 0.45; this.tint[j + 2] = 0.08 + t * 0.15;
        this.size[i] = this.size0[i] * (0.4 + t * 0.8);
        this.alpha[i] = this.alpha0[i] * Math.min(1, t * 2);
      } else if (k === DUST) {
        this.size[i] = this.size0[i] * (1.8 - t);
        this.alpha[i] = this.alpha0[i] * t;
      } else if (k === MOTE) {
        this.alpha[i] = this.alpha0[i] * Math.sin(t * Math.PI);
      } else {
        this.alpha[i] = this.alpha0[i] * Math.min(1, t * 3);
        if (k === SPARK) this.size[i] = this.size0[i] * (0.5 + t * 0.5);
      }
    }
    this.aPos.needsUpdate = true; this.aSize.needsUpdate = true; this.aAlpha.needsUpdate = true; this.aTint.needsUpdate = true;
  }
}

export class Particles {
  constructor(scene) {
    this.add = new Pool(scene, 1400, true);
    this.norm = new Pool(scene, 1400, false);
    this.gore = 'full';
    this.decals = new Decals(scene);
    this.moteT = 0;
  }
  setScale(px) { this.add.mat.uniforms.uScale.value = px; this.norm.mat.uniforms.uScale.value = px; }

  // Hot steel sparks thrown along the impact normal and the sliding direction.
  sparks(p, n, count, speed = 4) {
    for (let i = 0; i < count; i++) {
      const s = speed * rand(0.3, 1.2);
      this.add.spawn(p, n.x * s + rand(-2, 2), n.y * s + rand(-0.5, 2.5), n.z * s + rand(-2, 2), rand(0.15, 0.5), rand(0.012, 0.03), 1, rand(0.65, 0.9), rand(0.25, 0.5), SPARK);
    }
  }
  blood(p, n, count) {
    if (this.gore === 'off') return;
    const c = this.gore === 'reduced' ? Math.ceil(count * 0.35) : count;
    for (let i = 0; i < c; i++) {
      const s = rand(0.6, 3.2);
      this.norm.spawn(p, n.x * s + rand(-0.8, 0.8), n.y * s + rand(0, 1.5), n.z * s + rand(-0.8, 0.8), rand(0.5, 1.2), rand(0.018, 0.045), rand(0.22, 0.32), 0.015, 0.012, BLOOD, 0.95);
    }
  }
  drip(p) { if (this.gore !== 'off' && Math.random() < (this.gore === 'reduced' ? 0.3 : 1)) this.norm.spawn(p, rand(-0.1, 0.1), -0.2, rand(-0.1, 0.1), 1, 0.02, 0.25, 0.01, 0.01, BLOOD, 0.9); }
  dust(p, count, spread = 0.6) {
    for (let i = 0; i < count; i++) this.norm.spawn(p, rand(-spread, spread), rand(0.1, 0.6), rand(-spread, spread), rand(0.8, 1.6), rand(0.15, 0.35), 0.42, 0.37, 0.31, DUST, 0.35);
  }
  fire(p) {
    this.add.spawn(p, rand(-0.12, 0.12), rand(0.4, 1.0), rand(-0.12, 0.12), rand(0.35, 0.8), rand(0.12, 0.28), 1, 0.6, 0.2, FIRE, 0.7);
    if (Math.random() < 0.05) this.add.spawn(p, rand(-0.3, 0.3), rand(1, 2), rand(-0.3, 0.3), rand(1.5, 2.5), 0.02, 1, 0.6, 0.2, SPARK, 1);
  }
  update(dt, camPos) {
    this.moteT += dt;
    while (this.moteT > 0.05) {
      this.moteT -= 0.05;
      const p = { x: camPos.x + rand(-7, 7), y: rand(0.3, 4), z: camPos.z + rand(-7, 7) };
      this.norm.spawn(p, rand(-0.05, 0.05), rand(-0.02, 0.03), rand(-0.05, 0.05), rand(3, 6), rand(0.02, 0.04), 0.9, 0.8, 0.65, MOTE, 0.35);
    }
    const ground = (x, z) => { if (Math.random() < 0.35) this.decals.place(x, z, rand(0.03, 0.12)); };
    this.add.update(dt, null);
    this.norm.update(dt, ground);
  }
}

// Persistent blood on the flagstones.
export class Decals {
  constructor(scene) {
    this.scene = scene; this.list = []; this.i = 0; this.max = 260;
    this.geo = new THREE.CircleGeometry(1, 10); this.geo.rotateX(-Math.PI / 2);
    this.mats = [0x3a0705, 0x4a0a07, 0x2a0504].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  }
  place(x, z, s) {
    let m;
    if (this.list.length < this.max) { m = new THREE.Mesh(this.geo, this.mats[(Math.random() * 3) | 0]); m.receiveShadow = true; this.scene.add(m); this.list.push(m); }
    else { m = this.list[this.i]; this.i = (this.i + 1) % this.max; }
    m.visible = true;
    m.position.set(x, 0.006 + Math.random() * 0.002, z);
    m.scale.set(s * rand(0.7, 1.4), 1, s * rand(0.7, 1.4));
    m.rotation.y = rand(0, 6.28);
  }
  clear() { for (const m of this.list) m.visible = false; }
}

// Faint ribbon behind the blade when it is really moving.
export class SwingTrail {
  constructor(scene) {
    this.N = 14;
    this.base = []; this.tipP = [];
    for (let i = 0; i < this.N; i++) { this.base.push(new THREE.Vector3()); this.tipP.push(new THREE.Vector3()); }
    this.speeds = new Float32Array(this.N);
    const g = new THREE.BufferGeometry();
    this.posArr = new Float32Array(this.N * 2 * 3);
    this.colArr = new Float32Array(this.N * 2 * 4);
    g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3));
    g.setAttribute('tcol', new THREE.BufferAttribute(this.colArr, 4));
    const idx = [];
    for (let i = 0; i < this.N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute vec4 tcol; varying vec4 vC; void main(){ vC = tcol; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying vec4 vC; void main(){ gl_FragColor = vec4(vC.rgb * vC.a, vC.a); }',
    }));
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.primed = false;
  }
  update(sword) {
    const b = this.base, t = this.tipP;
    const nb = b.pop(), nt = t.pop();
    nb.copy(sword.pos).addScaledVector(sword.axis, 0.75); nt.copy(sword.tip);
    b.unshift(nb); t.unshift(nt);
    for (let i = this.N - 1; i > 0; i--) this.speeds[i] = this.speeds[i - 1];
    this.speeds[0] = sword.free ? 0 : sword.tipSpeed;
    if (!this.primed) { for (let i = 1; i < this.N; i++) { b[i].copy(nb); t[i].copy(nt); } this.primed = true; }
    for (let i = 0; i < this.N; i++) {
      b[i].toArray(this.posArr, i * 6); t[i].toArray(this.posArr, i * 6 + 3);
      const a = Math.max(0, Math.min(1, (this.speeds[i] - 9) / 12)) * (1 - i / this.N) * 0.22;
      this.colArr.set([0.85, 0.88, 0.95, 0], i * 8); this.colArr.set([0.95, 0.95, 1, a], i * 8 + 4);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.tcol.needsUpdate = true;
  }
}
