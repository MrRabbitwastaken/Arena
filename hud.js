import { ZONE_IDS } from '../combat/armourSystem.js';
import { ATTACKS, ATTACK_SCREEN_DIR } from '../combat/attacks.js';

// Body diagram seen from behind (your left is on the left). One shape per armour zone.
const SHAPES = {
  head: '<circle cx="30" cy="10" r="7"/>', neck: '<rect x="27" y="17" width="6" height="4" rx="1"/>',
  chest: '<rect x="20" y="21.5" width="20" height="15" rx="4"/>', abdomen: '<rect x="21" y="37.5" width="18" height="11" rx="3"/>',
  shoulderL: '<circle cx="15.5" cy="24.5" r="4.6"/>', shoulderR: '<circle cx="44.5" cy="24.5" r="4.6"/>',
  upperArmL: '<rect x="11" y="29" width="7" height="13" rx="3"/>', upperArmR: '<rect x="42" y="29" width="7" height="13" rx="3"/>',
  forearmL: '<rect x="9" y="43" width="7" height="12.5" rx="3"/>', forearmR: '<rect x="44" y="43" width="7" height="12.5" rx="3"/>',
  handL: '<circle cx="12.5" cy="59.5" r="3.4"/>', handR: '<circle cx="47.5" cy="59.5" r="3.4"/>',
  thighL: '<rect x="21" y="49.5" width="8" height="20" rx="3"/>', thighR: '<rect x="31" y="49.5" width="8" height="20" rx="3"/>',
  kneeL: '<circle cx="25" cy="73" r="3.4"/>', kneeR: '<circle cx="35" cy="73" r="3.4"/>',
  lowerLegL: '<rect x="21.5" y="77" width="7" height="19.5" rx="3"/>', lowerLegR: '<rect x="31.5" y="77" width="7" height="19.5" rx="3"/>',
  footL: '<rect x="20" y="97.5" width="9" height="5" rx="2"/>', footR: '<rect x="31" y="97.5" width="9" height="5" rx="2"/>',
};

export function bodySVG(id) {
  return `<svg id="${id}" viewBox="0 0 60 106" aria-hidden="true">${ZONE_IDS.map((z) => SHAPES[z].replace('/>', ` data-z="${z}"/>`)).join('')}</svg>`;
}

function zoneColour(z) {
  const f = z.func, plate = z.integrity;
  if (f < 0.25) return 'var(--blood)';
  if (f < 0.6) return 'var(--ember)';
  if (plate < 0.55) return 'var(--dent)';
  return 'var(--steel-dim)';
}

export class HUD {
  constructor(root) {
    this.root = root;
    this.el = {
      stamina: root.querySelector('#stamina'), staminaFill: root.querySelector('#stamina i'),
      self: root.querySelector('#self'), foe: root.querySelector('#foe'), foeState: root.querySelector('#foe-state'),
      readout: root.querySelector('#readout'), hints: root.querySelector('#hints'),
      vignette: root.querySelector('#vignette'), compass: root.querySelector('#compass'), lock: root.querySelector('#lock'),
    };
    this.selfZones = {}; this.foeZones = {};
    this.el.self.querySelectorAll('[data-z]').forEach((n) => (this.selfZones[n.dataset.z] = n));
    this.el.foe.querySelectorAll('[data-z]').forEach((n) => (this.foeZones[n.dataset.z] = n));
    this.ctx = this.el.compass.getContext('2d');
    this.readoutT = 0; this.t = 0; this.accum = 0;
  }

  say(text, tone = '') {
    const r = this.el.readout;
    r.textContent = text; r.dataset.tone = tone;
    r.classList.remove('show'); void r.offsetWidth; r.classList.add('show');
  }

  update(dt, duel, view) {
    this.t += dt; this.accum += dt;
    this.drawCompass(duel.player, view);
    if (this.accum < 1 / 20) return;
    this.accum = 0;
    const P = duel.player, E = duel.enemy;
    const st = P.stamina.value / 100, max = P.stamina.max / 100;
    this.el.staminaFill.style.width = `${(st * 100).toFixed(1)}%`;
    this.el.stamina.style.setProperty('--cap', `${(max * 100).toFixed(1)}%`);
    this.el.stamina.classList.toggle('full', st >= max - 0.01);
    this.el.stamina.classList.toggle('low', st < 0.25);
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 8);
    for (const z of ZONE_IDS) {
      const pz = P.injury.zones[z], ez = E.injury.zones[z];
      this.selfZones[z].style.fill = zoneColour(pz);
      this.selfZones[z].style.stroke = pz.bleed > 0.002 ? `rgba(200,40,30,${0.4 + pulse * 0.6})` : 'transparent';
      this.foeZones[z].style.fill = zoneColour(ez);
      this.foeZones[z].style.stroke = ez.bleed > 0.002 ? `rgba(200,40,30,${0.4 + pulse * 0.6})` : 'transparent';
    }
    const c = E.combat.state;
    this.el.foeState.textContent = E.defeated ? E.defeatCause : E.injury.daze > 0.4 ? 'Dazed' : c === 'stagger' ? 'Off balance'
      : E.stamina.value < 25 ? 'Winded' : E.injury.blood < 0.7 ? 'Bleeding' : '';
    // Vision: blood loss narrows and darkens it; head blows blur it.
    const blood = 1 - P.injury.blood, daze = Math.min(1, P.injury.daze);
    this.el.vignette.style.opacity = Math.min(1, blood * 1.6 + daze * 0.5 + (P.stamina.value < 15 ? 0.15 : 0)).toFixed(2);
    this.el.vignette.style.setProperty('--r', `${Math.max(35, 75 - blood * 70)}%`);
    this.el.lock.hidden = !view.lockOn;
  }

  drawCompass(P, view) {
    const g = this.ctx, W = 120, c = W / 2, R = 30;
    g.clearRect(0, 0, W, W);
    const cs = P.combat.state;
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(232,225,211,0.16)';
    g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(232,225,211,0.5)';
    g.beginPath(); g.arc(c, c, 1.5, 0, Math.PI * 2); g.fill();
    if (cs === 'block') {
      // guard cursor
      const gx = P.intent.gx, gy = P.intent.gy;
      const parry = P.combat.parryT > 0;
      g.strokeStyle = parry ? 'rgba(240,190,120,0.95)' : 'rgba(232,225,211,0.7)';
      g.lineWidth = parry ? 3 : 2;
      const a = Math.atan2(-gy, gx), m = Math.min(1, Math.hypot(gx, gy));
      if (m > 0.2) { g.beginPath(); g.arc(c, c, R, a - 0.5, a + 0.5); g.stroke(); }
      else { g.beginPath(); g.arc(c, c, 9, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = 'rgba(232,225,211,0.9)';
      g.beginPath(); g.arc(c + gx * R, c - gy * R, 3, 0, Math.PI * 2); g.fill();
      return;
    }
    let id = view.preview, alpha = 0.35;
    if (P.combat.attacking) { id = P.combat.atkId; alpha = 0.95; }
    if (!id) return;
    g.strokeStyle = `rgba(208,120,47,${alpha})`; g.fillStyle = g.strokeStyle; g.lineWidth = 2.5;
    if (id === 'thrust') { g.beginPath(); g.arc(c, c, 7, 0, Math.PI * 2); g.stroke(); return; }
    const deg = ATTACK_SCREEN_DIR[id], a = (-deg * Math.PI) / 180;
    const x0 = c - Math.cos(a) * R * 0.9, y0 = c - Math.sin(a) * R * 0.9, x1 = c + Math.cos(a) * R * 0.9, y1 = c + Math.sin(a) * R * 0.9;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.beginPath(); g.moveTo(x1, y1);
    g.lineTo(x1 - Math.cos(a - 0.45) * 9, y1 - Math.sin(a - 0.45) * 9);
    g.lineTo(x1 - Math.cos(a + 0.45) * 9, y1 - Math.sin(a + 0.45) * 9);
    g.closePath(); g.fill();
    if (P.combat.attacking && ATTACKS[id]) { /* direction committed */ }
  }
}
