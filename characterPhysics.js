import { THREE } from '../core/three.js';

// Collision capsules for each body segment, rebuilt every physics step from the pose.
// Their names map to armour zones in combat/armourSystem.js.
const DEF = [
  ['head', 0.13], ['neck', 0.065], ['chest', 0.175], ['abdomen', 0.16],
  ['upperArmL', 0.065], ['upperArmR', 0.065], ['forearmL', 0.055], ['forearmR', 0.055],
  ['handL', 0.05], ['handR', 0.05], ['thighL', 0.085], ['thighR', 0.085],
  ['shinL', 0.065], ['shinR', 0.065], ['footL', 0.05], ['footR', 0.05],
];
const _u = new THREE.Vector3(), _h = new THREE.Vector3();

export class BodyColliders {
  constructor(k) {
    this.k = k;
    this.caps = DEF.map(([name, r]) => ({ name, r, a: new THREE.Vector3(), b: new THREE.Vector3() }));
    this.byName = {};
    for (const c of this.caps) this.byName[c.name] = c;
  }
  update() {
    const j = this.k.pose.j, c = this.byName;
    _u.subVectors(j.neck, j.pelvis).normalize();
    _h.subVectors(j.headTop, j.headBase).normalize();
    c.head.a.copy(j.headBase).addScaledVector(_h, 0.1); c.head.b.copy(j.headBase).addScaledVector(_h, 0.17);
    c.neck.a.copy(j.neck); c.neck.b.copy(j.headBase).addScaledVector(_h, 0.03);
    c.chest.a.copy(j.waist).addScaledVector(_u, 0.12); c.chest.b.copy(j.neck).addScaledVector(_u, -0.13);
    c.abdomen.a.copy(j.pelvis).addScaledVector(_u, -0.03); c.abdomen.b.copy(j.waist).addScaledVector(_u, 0.06);
    for (const S of ['L', 'R']) {
      c['upperArm' + S].a.copy(j['shoulder' + S]); c['upperArm' + S].b.copy(j['elbow' + S]);
      c['forearm' + S].a.copy(j['elbow' + S]); c['forearm' + S].b.copy(j['wrist' + S]);
      c['hand' + S].a.copy(j['wrist' + S]); c['hand' + S].b.copy(j['grip' + S]);
      c['thigh' + S].a.copy(j['hip' + S]); c['thigh' + S].b.copy(j['knee' + S]);
      c['shin' + S].a.copy(j['knee' + S]); c['shin' + S].b.copy(j['ankle' + S]);
      c['foot' + S].a.copy(j['ankle' + S]); c['foot' + S].b.copy(j['toe' + S]);
    }
  }
}
