import { THREE } from '../core/three.js';
import { Knight } from '../characters/knight.js';
import { CombatAI } from './combatAI.js';
import { WeaponCollision } from './weaponCollision.js';
import { resolveClash } from './blocking.js';
import { armourDamage } from './armourSystem.js';

export const FIXED_DT = 1 / 120;
const SUBSTEPS = 2;

// The simulation of one duel, independent of rendering. Fixed timestep; the swords and
// their collisions run at 240 Hz.
export class Duel {
  constructor() {
    this.player = new Knight(this, { name: 'You', isPlayer: true });
    this.enemy = new Knight(this, { name: 'Sir Odo Ravensworth' });
    this.player.opponent = this.enemy; this.enemy.opponent = this.player;
    this.knights = [this.player, this.enemy];
    this.collision = new WeaponCollision(this);
    this.enemyAI = new CombatAI(this.enemy, 0.72);
    this.playerAI = new CombatAI(this.player, 0.62); // only used for the attract-mode duel behind the menu
    this.events = [];
    this.reset(false);
  }

  reset(demo, skill) {
    this.demo = demo;
    this.time = 0; this.over = false; this.endT = 0; this.winner = null; this.loser = null;
    this.player.reset(0, -2.6, 0);
    this.enemy.reset(0, 2.6, Math.PI);
    if (skill != null) this.enemyAI.skill = skill;
    this.enemyAI.reset(); this.playerAI.reset();
    this.events.length = 0;
  }

  emit(e) { this.events.push(e); if (this.events.length > 200) this.events.shift(); }

  step(h) {
    this.time += h;
    if (this.demo) this.playerAI.update(h);
    this.enemyAI.update(h);
    for (const k of this.knights) k.update(h);
    this.separate();
    const sh = h / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) {
      for (const k of this.knights) k.sword.step(sh);
      this.collision.step(sh, this.knights);
    }
    if (this.over) this.endT += h;
  }

  separate() {
    const a = this.player, b = this.enemy;
    if (a.defeated || b.defeated) return;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz), min = 0.74;
    if (d < min && d > 1e-4) {
      const nx = dx / d, nz = dz / d, push = (min - d) / 2;
      a.pos.x -= nx * push; a.pos.z -= nz * push; b.pos.x += nx * push; b.pos.z += nz * push;
      const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
      if (rv < 0) { a.vel.x += nx * rv / 2; a.vel.z += nz * rv / 2; b.vel.x -= nx * rv / 2; b.vel.z -= nz * rv / 2; }
    }
  }

  onSwordClash(A, B, J, p, vt, sA, sB) {
    const r = resolveClash(A, B, J, sA, sB);
    this.emit({ type: 'clash', kind: r.kind, J, p: p.clone(), vt, defender: r.defender, attacker: r.attacker });
  }

  onBodyHit(K, O, result, p, n, J, part) {
    if (result.key !== 'none') K.stats.hits++;
    this.emit({ type: 'hit', attacker: K, target: O, result, p: p.clone(), n: n.clone(), J, part });
  }

  onDefeat(k) {
    if (this.over) return;
    this.over = true; this.loser = k; this.winner = k.opponent;
    this.emit({ type: 'defeat', knight: k });
  }

  summary(k) {
    const injuries = [];
    const seen = new Set();
    for (const e of k.injury.log.slice().reverse()) {
      const key = e.zone + e.outcome;
      if (seen.has(key)) continue;
      seen.add(key); injuries.push(`${e.outcome} — ${e.zone.toLowerCase()}`);
    }
    return {
      hits: k.stats.hits, blocks: k.stats.blocks, parries: k.stats.parries,
      injuries, armour: Math.round(armourDamage(k.injury) * 100), blood: k.injury.blood,
    };
  }
}
