import { THREE } from '../core/three.js';
import { rand } from '../core/math.js';

export const ARENA_R = 13.3;
const WALL_H = 3.2;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

// Worn sandstone flags, drawn so the texture tiles.
function floorTexture() {
  const S = 1024, [c, g] = canvas(S, S);
  g.fillStyle = '#3d3933'; g.fillRect(0, 0, S, S);
  const rows = []; let tot = 0;
  while (tot < S) { const h = rand(110, 190); rows.push(h); tot += h; }
  const k = S / tot; let y = 0;
  for (const rh0 of rows) {
    const rh = rh0 * k, cols = []; let ct = 0;
    while (ct < S) { const w = rand(140, 300); cols.push(w); ct += w; }
    const kc = S / ct; let x = rand(0, S);
    for (const cw0 of cols) {
      const cw = cw0 * kc;
      for (const ox of [-S, 0]) {
        const X = ((x % S) + S) % S + ox;
        const l = 33 + rand(-6, 7), hue = 30 + rand(-6, 8);
        g.fillStyle = `hsl(${hue},${rand(7, 13)}%,${l}%)`;
        g.fillRect(X + 3, y + 3, cw - 6, rh - 6);
        const grd = g.createRadialGradient(X + cw / 2, y + rh / 2, 4, X + cw / 2, y + rh / 2, Math.max(cw, rh) * 0.7);
        grd.addColorStop(0, 'rgba(255,240,215,0.07)'); grd.addColorStop(1, 'rgba(0,0,0,0.12)');
        g.fillStyle = grd; g.fillRect(X + 3, y + 3, cw - 6, rh - 6);
        for (let i = 0; i < 90; i++) {
          g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,245,225'},${rand(0.02, 0.07)})`;
          g.fillRect(X + rand(4, cw - 8), y + rand(4, rh - 8), rand(1, 9), rand(1, 9));
        }
        if (Math.random() < 0.3) {
          g.strokeStyle = 'rgba(10,8,6,0.5)'; g.lineWidth = rand(0.8, 1.6); g.beginPath();
          let px = X + rand(10, cw - 10), py = y + rand(6, 20); g.moveTo(px, py);
          for (let s = 0; s < 5; s++) { px += rand(-18, 18); py += rh / 6; g.lineTo(px, py); }
          g.stroke();
        }
      }
      x += cw;
    }
    y += rh;
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
  return t;
}

function wallTexture() {
  const W = 1024, H = 512, [c, g] = canvas(W, H);
  g.fillStyle = '#2a2622'; g.fillRect(0, 0, W, H);
  const course = H / 6;
  for (let r = 0; r < 6; r++) {
    let x = r % 2 ? -rand(40, 120) : 0;
    while (x < W) {
      const w = rand(110, 210), l = 26 + rand(-5, 6);
      g.fillStyle = `hsl(${28 + rand(-5, 5)},${rand(6, 12)}%,${l}%)`;
      g.fillRect(x + 3, r * course + 3, w - 6, course - 6);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(0,0,0,${rand(0.03, 0.1)})`;
        g.fillRect(x + rand(0, w), r * course + rand(0, course), rand(2, 10), rand(2, 8));
      }
      x += w;
    }
  }
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(0.75, 'rgba(0,0,0,0.1)'); grd.addColorStop(1, 'rgba(20,12,6,0.45)');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.repeat.set(10, 1);
  return t;
}

function bannerTexture(field, charge) {
  const [c, g] = canvas(128, 256);
  g.fillStyle = field; g.fillRect(0, 0, 128, 256);
  g.fillStyle = charge;
  g.fillRect(0, 0, 128, 14); g.fillRect(0, 242, 128, 14);
  g.beginPath(); g.moveTo(64, 70); g.lineTo(98, 128); g.lineTo(64, 186); g.lineTo(30, 128); g.closePath(); g.fill(); // lozenge
  g.fillStyle = field; g.beginPath(); g.moveTo(64, 104); g.lineTo(78, 128); g.lineTo(64, 152); g.lineTo(50, 128); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}

export class Arena {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group(); scene.add(this.group);
    this.braziers = []; this.banners = []; this.time = 0;
    this.buildFloor(); this.buildWalls(); this.buildStands(); this.buildBanners(); this.buildBraziers(); this.buildSky();
  }

  buildFloor() {
    const geo = new THREE.RingGeometry(0.01, ARENA_R + 0.2, 96, 10);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position, uv = geo.attributes.uv, col = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), r = Math.hypot(x, z) / ARENA_R;
      uv.setXY(i, x / 7.5, z / 7.5);
      const v = 1 - Math.pow(Math.max(0, r - 0.55) / 0.45, 1.6) * 0.45 + rand(-0.03, 0.03);
      col.push(v, v * 0.97, v * 0.93);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const tex = floorTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.02, roughness: 0.92, metalness: 0, vertexColors: true });
    const floor = new THREE.Mesh(geo, mat);
    floor.receiveShadow = true;
    this.group.add(floor);
    // sand drift at the foot of the wall
    const sand = new THREE.Mesh(new THREE.RingGeometry(ARENA_R - 0.6, ARENA_R + 0.1, 96, 1),
      new THREE.MeshStandardMaterial({ color: 0x4a3f33, roughness: 1, transparent: true, opacity: 0.55, depthWrite: false }));
    sand.rotation.x = -Math.PI / 2; sand.position.y = 0.004; sand.receiveShadow = true;
    this.group.add(sand);
  }

  buildWalls() {
    const tex = wallTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 0.04, roughness: 0.95, side: THREE.BackSide });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R + 0.2, ARENA_R + 0.2, WALL_H, 96, 1, true), mat);
    wall.position.y = WALL_H / 2; wall.receiveShadow = true;
    this.group.add(wall);
    const cap = new THREE.Mesh(new THREE.TorusGeometry(ARENA_R + 0.45, 0.28, 6, 96), new THREE.MeshStandardMaterial({ color: 0x3a342d, roughness: 0.9 }));
    cap.rotation.x = Math.PI / 2; cap.position.y = WALL_H + 0.02; cap.scale.z = 0.5;
    this.group.add(cap);
    // gate: dark recess and portcullis behind the player's corner
    const a = Math.PI * 1.5, gx = Math.cos(a) * (ARENA_R + 0.18), gz = Math.sin(a) * (ARENA_R + 0.18);
    const gate = new THREE.Group(); gate.position.set(gx, 0, gz); gate.lookAt(0, 0, 0);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.8), new THREE.MeshBasicMaterial({ color: 0x060504 }));
    hole.position.set(0, 1.4, 0.03); gate.add(hole);
    const iron = new THREE.MeshStandardMaterial({ color: 0x1d1c1b, metalness: 0.7, roughness: 0.6 });
    for (let i = -5; i <= 5; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.8, 0.05), iron); b.position.set(i * 0.24, 1.4, 0.08); gate.add(b); }
    for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 0.05), iron); b.position.set(0, 0.3 + i * 0.6, 0.1); gate.add(b); }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.16, 6, 20, Math.PI), new THREE.MeshStandardMaterial({ color: 0x3b352e, roughness: 0.9 }));
    arch.position.set(0, 2.75, 0.05); arch.scale.y = 0.35; gate.add(arch);
    this.group.add(gate);
  }

  buildStands() {
    const pts = [new THREE.Vector2(ARENA_R + 0.7, WALL_H)];
    let r = ARENA_R + 0.7, y = WALL_H;
    for (let i = 0; i < 6; i++) { r += 0.9; pts.push(new THREE.Vector2(r, y)); y += 0.55; pts.push(new THREE.Vector2(r, y)); }
    pts.push(new THREE.Vector2(r + 1.5, y + 3)); pts.push(new THREE.Vector2(r + 1.5, -1));
    const stands = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), new THREE.MeshStandardMaterial({ color: 0x24201c, roughness: 1, side: THREE.DoubleSide }));
    this.group.add(stands);
    // spectators: dark silhouettes, swaying a little
    const N = 620;
    const body = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.22, 0.75, 6), new THREE.MeshStandardMaterial({ color: 0x14110f, roughness: 1 }), N);
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshStandardMaterial({ color: 0x1a1613, roughness: 1 }), N);
    this.crowd = { body, head, seats: [] };
    const m = new THREE.Matrix4();
    for (let i = 0; i < N; i++) {
      const row = i % 6, a = rand(0, Math.PI * 2);
      if (Math.abs(((a - Math.PI * 1.5 + Math.PI) % (Math.PI * 2)) - Math.PI) < 0.16) { i--; continue; } // leave the gate clear
      const rr = ARENA_R + 0.7 + 0.9 * (row + 1) - 0.4, yy = WALL_H + 0.55 * row;
      const seat = { x: Math.cos(a) * rr, z: Math.sin(a) * rr, y: yy, ph: rand(0, 6.28), s: rand(0.88, 1.1) };
      this.crowd.seats.push(seat);
      m.makeTranslation(seat.x, seat.y + 0.4 * seat.s, seat.z); body.setMatrixAt(this.crowd.seats.length - 1, m);
      m.makeTranslation(seat.x, seat.y + 0.88 * seat.s, seat.z); head.setMatrixAt(this.crowd.seats.length - 1, m);
    }
    this.group.add(body); this.group.add(head);
    this.excite = 0;
  }

  buildBanners() {
    const colours = [['#1f2c4d', '#c9a24a'], ['#5b1a17', '#d8cbb0'], ['#3a3020', '#b8873a']];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.2;
      const [f, ch] = colours[i % 3];
      const geo = new THREE.PlaneGeometry(1.0, 2.3, 6, 14);
      geo.translate(0, -1.15, 0);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: bannerTexture(f, ch), roughness: 0.95, side: THREE.DoubleSide }));
      mesh.position.set(Math.cos(a) * (ARENA_R + 0.05), WALL_H + 0.25, Math.sin(a) * (ARENA_R + 0.05));
      mesh.lookAt(0, WALL_H + 0.25, 0);
      mesh.castShadow = true;
      const base = Float32Array.from(geo.attributes.position.array);
      this.banners.push({ mesh, base, ph: rand(0, 6) });
      this.group.add(mesh);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0x2a1d12 }));
      pole.rotation.z = Math.PI / 2; pole.position.copy(mesh.position); pole.quaternion.copy(mesh.quaternion); pole.rotateZ(Math.PI / 2);
      this.group.add(pole);
    }
  }

  buildBraziers() {
    const iron = new THREE.MeshStandardMaterial({ color: 0x1b1a19, metalness: 0.8, roughness: 0.55 });
    const prof = [[0.0, 0], [0.32, 0.02], [0.42, 0.22], [0.4, 0.26], [0.0, 0.08]].map(([x, y]) => new THREE.Vector2(x, y));
    const bowlGeo = new THREE.LatheGeometry(prof, 18);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4, r = ARENA_R - 1.4;
      const g = new THREE.Group(); g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      for (let l = 0; l < 3; l++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 1.05, 6), iron);
        const la = (l / 3) * Math.PI * 2;
        leg.position.set(Math.cos(la) * 0.2, 0.5, Math.sin(la) * 0.2);
        leg.rotation.set(Math.sin(la) * 0.25, 0, -Math.cos(la) * 0.25);
        leg.castShadow = true; g.add(leg);
      }
      const bowl = new THREE.Mesh(bowlGeo, iron); bowl.position.y = 0.98; bowl.castShadow = true; g.add(bowl);
      const coals = new THREE.Mesh(new THREE.CircleGeometry(0.36, 16), new THREE.MeshBasicMaterial({ color: 0xff7a2a }));
      coals.rotation.x = -Math.PI / 2; coals.position.y = 1.19; g.add(coals);
      const light = new THREE.PointLight(0xff9a4a, 2.2, 15, 2);
      light.position.y = 1.7; g.add(light);
      this.group.add(g);
      this.braziers.push({ g, light, ph: rand(0, 10), top: new THREE.Vector3(g.position.x, 1.25, g.position.z) });
    }
  }

  buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; void main(){
        float h = clamp(vP.y, -0.1, 1.0);
        vec3 horizon = vec3(0.42, 0.25, 0.16), mid = vec3(0.11, 0.1, 0.14), top = vec3(0.025, 0.03, 0.05);
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.25, h));
        c = mix(c, top, smoothstep(0.25, 0.9, h));
        gl_FragColor = vec4(c, 1.0); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), mat);
    this.group.add(sky);
  }

  update(dt, fx) {
    this.time += dt;
    for (const b of this.braziers) {
      const f = Math.sin(this.time * 9 + b.ph) * 0.18 + Math.sin(this.time * 23 + b.ph * 2) * 0.12 + Math.random() * 0.12;
      b.light.intensity = 2.0 + f;
      if (fx && Math.random() < 0.9) fx.fire(b.top);
    }
    for (const b of this.banners) {
      const arr = b.mesh.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        const yy = -b.base[i + 1];
        arr[i + 2] = b.base[i + 2] + Math.sin(this.time * 1.6 + b.ph + yy * 2.2 + b.base[i] * 1.5) * 0.06 * yy;
      }
      b.mesh.geometry.attributes.position.needsUpdate = true;
    }
    // crowd shuffles, more when something big happens
    this.excite = Math.max(0, this.excite - dt * 0.4);
    if (Math.floor(this.time * 20) % 3 === 0) {
      const m = new THREE.Matrix4(), { body, head, seats } = this.crowd;
      for (let i = 0; i < seats.length; i++) {
        const s = seats[i];
        const bob = Math.max(0, Math.sin(this.time * (2 + this.excite * 6) + s.ph)) * (0.02 + this.excite * 0.18);
        m.makeTranslation(s.x, s.y + 0.4 * s.s + bob, s.z); body.setMatrixAt(i, m);
        m.makeTranslation(s.x, s.y + 0.88 * s.s + bob, s.z); head.setMatrixAt(i, m);
      }
      body.instanceMatrix.needsUpdate = true; head.instanceMatrix.needsUpdate = true;
    }
  }
}
