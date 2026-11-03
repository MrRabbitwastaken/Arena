import { THREE } from '../core/three.js';
import { quatFromSegment } from '../core/math.js';

// Visual knight: every armour piece is its own mesh, grouped by body segment and given a
// material per armour zone so dents can be shown where they happened.

let wear = null;
function wearTexture() {
  if (wear || typeof document === 'undefined') return wear;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgb(120,120,120)'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3000; i++) {
    const v = (90 + Math.random() * 90) | 0;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  g.lineCap = 'round';
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = `rgba(${Math.random() < 0.5 ? '230,230,230' : '40,40,40'},${0.25 + Math.random() * 0.35})`;
    g.lineWidth = 0.4 + Math.random() * 1.2;
    const x = Math.random() * 256, y = Math.random() * 256;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 16); g.stroke();
  }
  wear = new THREE.CanvasTexture(c);
  wear.wrapS = wear.wrapT = THREE.RepeatWrapping;
  wear.repeat.set(2, 2);
  return wear;
}

const GEO = {};
function geo(key, make) { return GEO[key] || (GEO[key] = make()); }
const sph = () => geo('sph', () => new THREE.SphereGeometry(1, 28, 18));
const dome = () => geo('dome', () => new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2));
const box = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const cyl = (rt, rb, h, open = false) => geo(`c${rt},${rb},${h},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, 22, 1, open));
const cone = () => geo('cone', () => new THREE.ConeGeometry(1, 1, 22));

const STEEL = 0xb4b8be;

export class KnightModel {
  constructor(scene, opts) {
    this.scene = scene;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.mats = {};
    this.parts = {};
    this.cloth = new THREE.MeshStandardMaterial({ color: opts.cloth, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    this.trim = new THREE.MeshStandardMaterial({ color: opts.trim, roughness: 0.5, metalness: 0.6 });
    this.leather = new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 0.8, metalness: 0 });
    this.mail = new THREE.MeshStandardMaterial({ color: 0x6d7076, roughness: 0.62, metalness: 0.85 });
    this.dark = new THREE.MeshBasicMaterial({ color: 0x050505 });
    this.helm = opts.helm;
    this.build();
    this.sword = buildSwordMesh();
    scene.add(this.sword);
  }

  m(zone) {
    if (!this.mats[zone]) {
      const mat = new THREE.MeshStandardMaterial({ color: STEEL, metalness: 0.95, roughness: 0.55, roughnessMap: wearTexture() });
      mat.userData.base = new THREE.Color(STEEL);
      this.mats[zone] = mat;
    }
    return this.mats[zone];
  }
  part(name) { const g = new THREE.Group(); this.root.add(g); this.parts[name] = g; return g; }
  add(g, geometry, mat, p, s, r) {
    const mesh = new THREE.Mesh(geometry, mat);
    if (p) mesh.position.set(p[0], p[1], p[2]);
    if (s) mesh.scale.set(s[0], s[1], s[2]);
    if (r) mesh.rotation.set(r[0], r[1], r[2]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  }

  build() {
    const a = this.add.bind(this);
    // Torso (origin at the neck, hangs down -Y)
    let g = this.part('torso');
    a(g, cyl(0.085, 0.11, 0.1), this.m('neck'), [0, -0.03, 0]);                       // gorget
    a(g, sph(), this.m('chest'), [0, -0.23, 0.035], [0.205, 0.26, 0.16]);              // breastplate
    a(g, sph(), this.m('chest'), [0, -0.23, -0.03], [0.195, 0.25, 0.125]);             // backplate
    a(g, box(), this.m('chest'), [0, -0.2, 0.188], [0.012, 0.3, 0.016], [-0.14, 0, 0]); // medial ridge
    a(g, sph(), this.m('abdomen'), [0, -0.41, 0.05], [0.172, 0.11, 0.13]);             // plackart
    a(g, cyl(0.168, 0.168, 0.035), this.leather, [0, -0.5, 0]);                         // belt
    a(g, box(), this.trim, [0, -0.5, 0.168], [0.05, 0.04, 0.012]);                       // buckle

    // Pelvis (origin at the hip centre)
    g = this.part('pelvis');
    a(g, cyl(0.16, 0.175, 0.055, true), this.m('abdomen'), [0, 0.1, 0]);
    a(g, cyl(0.175, 0.19, 0.055, true), this.m('abdomen'), [0, 0.055, 0]);
    a(g, cyl(0.19, 0.205, 0.055, true), this.m('abdomen'), [0, 0.01, 0]);
    a(g, cyl(0.2, 0.235, 0.18, true), this.mail, [0, -0.1, 0]);
    a(g, box(), this.cloth, [0, -0.17, 0.2], [0.27, 0.42, 0.012], [0.12, 0, 0]);       // tabard front
    a(g, box(), this.cloth, [0, -0.17, -0.2], [0.27, 0.42, 0.012], [-0.12, 0, 0]);     // tabard back
    a(g, box(), this.trim, [0, -0.375, 0.225], [0.27, 0.02, 0.014], [0.12, 0, 0]);
    a(g, box(), this.m('abdomen'), [0.1, -0.03, 0.19], [0.12, 0.11, 0.012], [0.28, 0, 0]);   // tassets
    a(g, box(), this.m('abdomen'), [-0.1, -0.03, 0.19], [0.12, 0.11, 0.012], [0.28, 0, 0]);

    // Head (origin at the base of the helmet, +Y up)
    g = this.part('head');
    a(g, cyl(0.09, 0.15, 0.12, true), this.mail, [0, 0.0, 0]);                        // aventail
    if (this.helm === 'bascinet') {
      a(g, sph(), this.m('head'), [0, 0.15, -0.01], [0.12, 0.16, 0.13]);
      a(g, cone(), this.m('head'), [0, 0.3, -0.03], [0.07, 0.1, 0.07]);
      a(g, cone(), this.m('head'), [0, 0.12, 0.1], [0.1, 0.17, 0.085], [Math.PI / 2, 0, 0]); // pig-faced visor
      a(g, box(), this.dark, [0, 0.168, 0.118], [0.15, 0.012, 0.03]);
      for (let i = 0; i < 4; i++) a(g, box(), this.dark, [-0.035 - i * 0.012, 0.08, 0.17 - i * 0.012], [0.006, 0.03, 0.01]);
    } else {
      a(g, sph(), this.m('head'), [0, 0.15, -0.005], [0.122, 0.14, 0.135]);
      a(g, sph(), this.m('head'), [0, 0.125, 0.04], [0.118, 0.1, 0.122]);              // visor
      a(g, box(), this.dark, [0, 0.165, 0.146], [0.16, 0.012, 0.05]);                    // eye slit
      a(g, box(), this.m('head'), [0, 0.268, 0], [0.01, 0.03, 0.2]);                     // comb
      a(g, cyl(0.045, 0.045, 0.01), this.m('head'), [0, 0.12, -0.14], null, [Math.PI / 2, 0, 0]); // rondel
      a(g, sph(), this.cloth, [0, 0.3, -0.06], [0.028, 0.05, 0.1], [-0.4, 0, 0]);       // plume
    }

    for (const S of ['L', 'R']) {
      const s = S === 'L' ? 1 : -1;
      g = this.part('upperArm' + S);
      a(g, dome(), this.m('shoulder' + S), [s * 0.02, 0.02, 0], [0.12, 0.1, 0.135], [0, 0, -s * 0.35]);
      a(g, cyl(0.11, 0.1, 0.04, true), this.m('shoulder' + S), [s * 0.01, -0.05, 0]);
      a(g, cyl(0.06, 0.054, 0.2), this.m('upperArm' + S), [0, -0.17, 0]);
      a(g, sph(), this.m('upperArm' + S), [0, -0.3, -0.01], [0.06, 0.06, 0.06]);         // couter
      a(g, cyl(0.065, 0.065, 0.012), this.m('upperArm' + S), [s * 0.045, -0.3, -0.01], null, [0, 0, Math.PI / 2]);
      g = this.part('forearm' + S);
      a(g, cyl(0.053, 0.044, 0.24), this.m('forearm' + S), [0, -0.13, 0]);
      g = this.part('hand' + S);
      a(g, cyl(0.062, 0.045, 0.07), this.m('hand' + S), [0, 0.0, 0]);
      a(g, box(), this.m('hand' + S), [0, -0.075, 0], [0.085, 0.1, 0.075]);
      g = this.part('thigh' + S);
      a(g, cyl(0.088, 0.07, 0.36), this.m('thigh' + S), [0, -0.2, 0]);
      a(g, sph(), this.m('knee' + S), [0, -0.45, 0.035], [0.065, 0.07, 0.06]);
      a(g, cyl(0.06, 0.06, 0.012), this.m('knee' + S), [s * 0.05, -0.45, 0.03], null, [0, 0, Math.PI / 2]);
      g = this.part('shin' + S);
      a(g, cyl(0.064, 0.05, 0.4), this.m('lowerLeg' + S), [0, -0.23, 0]);
      g = this.part('foot' + S); // origin at ankle, -Y towards the toe, +Z up
      for (let i = 0; i < 4; i++) a(g, box(), this.m('foot' + S), [0, -0.02 - i * 0.05, -0.03], [0.095 - i * 0.008, 0.055, 0.07 - i * 0.008]);
    }
  }

  // Dents darken and roughen the affected plate.
  refreshArmour(injury) {
    for (const zone in this.mats) {
      const z = injury.zones[zone]; if (!z) continue;
      const mat = this.mats[zone], dmg = 1 - z.integrity;
      mat.color.copy(mat.userData.base).lerp(DENTED, Math.min(0.75, dmg * 0.9));
      mat.roughness = 0.55 + dmg * 0.35;
    }
  }

  sync(k) {
    const p = k.pose, j = p.j, P = this.parts;
    P.torso.position.copy(j.neck); P.torso.quaternion.copy(p.torsoQ);
    P.pelvis.position.copy(j.pelvis); P.pelvis.quaternion.copy(p.pelvisQ);
    P.head.position.copy(j.headBase); P.head.quaternion.copy(p.headQ);
    for (const S of ['L', 'R']) {
      seg(P['upperArm' + S], j['shoulder' + S], j['elbow' + S], p.fwdHint);
      seg(P['forearm' + S], j['elbow' + S], j['wrist' + S], p.fwdHint);
      seg(P['hand' + S], j['wrist' + S], j['grip' + S], p.fwdHint);
      seg(P['thigh' + S], j['hip' + S], j['knee' + S], p.fwdHint);
      seg(P['shin' + S], j['knee' + S], j['ankle' + S], p.fwdHint);
      seg(P['foot' + S], j['ankle' + S], j['toe' + S], p.upHint);
    }
    this.sword.position.copy(k.sword.pos);
    this.sword.quaternion.copy(k.sword.q);
  }
}
const DENTED = new THREE.Color(0x4a4640);
function seg(g, a, b, hint) { g.position.copy(a); quatFromSegment(a, b, hint, g.quaternion); }

export function buildSwordMesh() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xd8dce0, metalness: 1, roughness: 0.2, roughnessMap: wearTexture() });
  const dark = new THREE.MeshStandardMaterial({ color: 0x9a9ea4, metalness: 0.95, roughness: 0.35 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x24170f, roughness: 0.85 });
  const shape = new THREE.Shape();
  shape.moveTo(-0.026, 0); shape.lineTo(0.026, 0); shape.lineTo(0.022, 0.9); shape.lineTo(0.012, 1.12);
  shape.lineTo(0, 1.2); shape.lineTo(-0.012, 1.12); shape.lineTo(-0.022, 0.9); shape.lineTo(-0.026, 0);
  const blade = new THREE.ExtrudeGeometry(shape, { depth: 0.003, bevelEnabled: true, bevelThickness: 0.0025, bevelSize: 0.005, bevelSegments: 1, curveSegments: 1 });
  blade.translate(0, 0, -0.0015);
  const mk = (geometry, mat, p, s) => { const m = new THREE.Mesh(geometry, mat); m.position.set(...p); if (s) m.scale.set(...s); m.castShadow = true; g.add(m); return m; };
  mk(blade, steel, [0, 0.22, 0]);
  mk(new THREE.BoxGeometry(1, 1, 1), dark, [0, 0.355, 0], [0.075, 0.012, 0.012]);  // parrying lugs
  mk(new THREE.BoxGeometry(1, 1, 1), dark, [0, 0.2, 0], [0.34, 0.026, 0.03]);       // crossguard
  mk(new THREE.SphereGeometry(1, 12, 8), dark, [0.17, 0.2, 0], [0.02, 0.02, 0.02]);
  mk(new THREE.SphereGeometry(1, 12, 8), dark, [-0.17, 0.2, 0], [0.02, 0.02, 0.02]);
  mk(new THREE.CylinderGeometry(0.017, 0.019, 0.42, 12), leather, [0, -0.02, 0]);    // grip
  mk(new THREE.SphereGeometry(1, 16, 12), dark, [0, -0.25, 0], [0.034, 0.042, 0.034]); // pommel
  return g;
}
