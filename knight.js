import { THREE } from '../core/three.js';
import { Sword } from '../combat/weaponPhysics.js';
import { CombatController } from '../combat/combatController.js';
import { Stamina } from '../combat/stamina.js';
import { InjuryState } from '../combat/damageSystem.js';
import { IDLE, edgeHint } from '../combat/blocking.js';
import { quatFromBladeEdge } from '../core/math.js';
import { CharacterController } from './characterController.js';
import { KnightPose } from './characterAnimation.js';
import { BodyColliders } from './characterPhysics.js';

const UP = new THREE.Vector3(0, 1, 0);
const _l = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion();
const BODY_MASS = 120; // man + plate

export class Knight {
  constructor(duel, opts) {
    this.duel = duel;
    this.name = opts.name;
    this.isPlayer = !!opts.isPlayer;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.yawRate = 0;
    this.intent = { move: new THREE.Vector2(), sprint: false, dodge: false, faceYaw: 0,
      attackPress: null, attackHeld: false, blockHeld: false, gx: 0, gy: 0 };
    this.stamina = new Stamina();
    this.injury = new InjuryState();
    this.sword = new Sword();
    this.combat = new CombatController(this);
    this.mover = new CharacterController(this);
    this.pose = new KnightPose();
    this.body = new BodyColliders(this);
    this.opponent = null;
    this.onFootstep = null; this.onSwing = null;
    this.resetStats();
    this.defeated = false; this.defeatCause = ''; this.downT = 0; this.lastHitT = -99;
  }

  resetStats() { this.stats = { hits: 0, blocks: 0, parries: 0, feints: 0, dodges: 0, swings: 0 }; }

  reset(x, z, yaw) {
    this.pos.set(x, 0, z); this.vel.set(0, 0, 0);
    this.yaw = yaw; this.yawRate = 0;
    const I = this.intent;
    I.move.set(0, 0); I.sprint = I.dodge = I.attackHeld = I.blockHeld = false; I.attackPress = null;
    I.gx = I.gy = 0; I.faceYaw = yaw;
    this.stamina.reset(); this.injury.reset(); this.combat.reset(); this.mover.reset(); this.pose.reset();
    this.defeated = false; this.defeatCause = ''; this.downT = 0; this.lastHitT = -99;
    this.resetStats();
    this.pose.update(0, this);
    this.toWorld(IDLE.h, _a);
    this.dirToWorld(IDLE.b, _b);
    edgeHint(IDLE.b, _l); this.dirToWorld(_l, _l);
    quatFromBladeEdge(_b, _l, _q);
    this.sword.reset(_a, _q);
    this.sword.reachCenter.copy(this.pose.j.shoulderMid);
    this.pose.update(0, this);
    this.body.update();
  }

  armControl() { return this.injury.armControl(); }
  legFactor() { return this.injury.legFactor(); }
  toWorld(l, out) { return out.copy(l).applyAxisAngle(UP, this.yaw).add(this.pos); }
  dirToWorld(l, out) { return out.copy(l).applyAxisAngle(UP, this.yaw); }
  dirToLocal(w, out) { return out.copy(w).applyAxisAngle(UP, -this.yaw); }
  worldToLocal(w, out) { return out.copy(w).sub(this.pos).applyAxisAngle(UP, -this.yaw); }

  lunge(v) { this.vel.x += Math.sin(this.yaw) * v; this.vel.z += Math.cos(this.yaw) * v; }

  staminaMode() {
    const c = this.combat.state;
    if (this.mover.sprinting) return 'sprint';
    if (c === 'windup' || c === 'strike' || c === 'follow' || c === 'stagger') return 'busy';
    if (c === 'block') return 'block';
    return 'rest';
  }

  update(dt) {
    this.mover.update(dt);
    this.combat.update(dt);
    this.stamina.update(dt, this.staminaMode());
    this.injury.update(dt, this);
    this.pose.update(dt, this);
    this.sword.reachCenter.copy(this.pose.j.shoulderMid);
    this.body.update();
    if (this.defeated) this.downT += dt;
  }

  // An impact on the body: push the whole man and kick the affected part.
  receiveImpact(J, point, cap, result) {
    this.vel.x += (J.x / BODY_MASS) * 2.2;
    this.vel.z += (J.z / BODY_MASS) * 2.2;
    this.dirToLocal(J, _l);
    const upper = cap.name === 'head' || cap.name === 'neck' || cap.name === 'chest' ? 1 : cap.name === 'abdomen' ? 0.6 : 0.3;
    const s = 0.05 * upper;
    this.pose.kick(_l.z * s, -_l.x * s, cap.name === 'head' ? 3 : 0.6);
    if (result && !this.defeated) {
      this.lastHitT = this.duel.time;
      if (result.stagger > 0) this.combat.stagger(result.stagger);
    }
  }

  defeat(cause) {
    if (this.defeated) return;
    this.defeated = true; this.defeatCause = cause;
    this.combat.setState('down');
    this.sword.release();
    // fall away from the opponent most of the time
    this.pose.fallDir = Math.random() < 0.65 ? -1 : 1;
    this.duel.onDefeat(this);
  }
}
