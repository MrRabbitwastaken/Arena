import { bodySVG } from './hud.js';
import { saveSettings } from './settings.js';

const $ = (s) => document.querySelector(s);

// Main menu, how-to, settings, pause and result screens.
export class Menus {
  constructor(settings) {
    this.settings = settings;
    this.game = null;
    this.back = 'menu';
    $('#self-wrap').innerHTML = bodySVG('self');
    $('#foe-wrap').insertAdjacentHTML('beforeend', bodySVG('foe'));
    $('#btn-start').onclick = () => this.start();
    $('#btn-guide').onclick = () => this.show('guide');
    $('#btn-settings').onclick = () => { this.back = 'menu'; this.show('settings'); };
    $('#btn-p-settings').onclick = () => { this.back = 'pause'; this.show('settings'); };
    document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = () => this.show(b.closest('#guide') ? 'menu' : this.back)));
    $('#btn-resume').onclick = () => { this.show(null); this.game.resume(); };
    $('#btn-restart').onclick = () => this.start();
    $('#btn-quit').onclick = () => { this.game.toMenu(); this.show('menu'); };
    $('#btn-again').onclick = () => this.start();
    $('#btn-r-menu').onclick = () => { this.game.toMenu(); this.show('menu'); };
    this.bindSettings();
    this.applyHints();
  }

  attach(game) { this.game = game; }

  show(id) {
    for (const s of ['menu', 'guide', 'settings', 'pause', 'result']) $('#' + s).hidden = s !== id;
    const playing = id === null || id === 'pause' || (id === 'settings' && this.back === 'pause');
    $('#hud').hidden = !playing;
    if (id) { const first = $('#' + id + ' .act'); if (first) first.focus({ preventScroll: true }); }
  }

  start() { this.show(null); this.game.startDuel(); }
  showPause() { this.show('pause'); }
  saveSettings() { saveSettings(this.settings); this.syncForm(); }
  applyHints() { $('#hints').hidden = !this.settings.hints; }

  showResult(duel) {
    const P = duel.player, E = duel.enemy, won = duel.winner === P;
    const v = $('#r-verdict');
    v.textContent = won ? 'Victory' : 'Defeat';
    v.className = 'verdict ' + (won ? 'win' : 'loss');
    $('#r-cause').textContent = won ? `Sir Odo is down: ${E.defeatCause.toLowerCase()}.` : `${P.defeatCause}.`;
    const secs = Math.round(duel.time - duel.endT);
    $('#r-time').textContent = `Duel lasted ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const a = duel.summary(P), b = duel.summary(E);
    const inj = (s) => (s.injuries.length ? s.injuries.slice(0, 5).join('<br>') : 'None worth the name');
    $('#r-body').innerHTML = `
      <tr><td>Hits landed</td><td>${a.hits}</td><td>${b.hits}</td></tr>
      <tr><td>Blocks</td><td>${a.blocks}</td><td>${b.blocks}</td></tr>
      <tr><td>Parries</td><td>${a.parries}</td><td>${b.parries}</td></tr>
      <tr><td>Armour damage</td><td>${a.armour}%</td><td>${b.armour}%</td></tr>
      <tr><td>Blood lost</td><td>${Math.round((1 - a.blood) * 100)}%</td><td>${Math.round((1 - b.blood) * 100)}%</td></tr>
      <tr><td>Injuries</td><td class="inj">${inj(a)}</td><td class="inj">${inj(b)}</td></tr>`;
    this.show('result');
  }

  bindSettings() {
    const s = this.settings;
    const bind = (id, key, parse, ev = 'change') => {
      const el = $(id);
      el.addEventListener(ev, () => {
        s[key] = parse(el);
        saveSettings(s); this.syncForm();
        if (this.game) this.game.applySettings();
      });
    };
    bind('#s-sens', 'sensitivity', (e) => +e.value, 'input');
    bind('#s-invert', 'invertY', (e) => e.checked);
    bind('#s-lock', 'lockOn', (e) => e.checked);
    bind('#s-diff', 'difficulty', (e) => +e.value);
    bind('#s-gore', 'gore', (e) => e.value);
    bind('#s-shadows', 'shadows', (e) => e.value);
    bind('#s-res', 'resolution', (e) => +e.value);
    bind('#s-vol', 'volume', (e) => +e.value, 'input');
    bind('#s-amb', 'ambience', (e) => +e.value, 'input');
    this.syncForm();
  }

  syncForm() {
    const s = this.settings;
    $('#s-sens').value = s.sensitivity; $('#s-sens').nextElementSibling.textContent = s.sensitivity.toFixed(2);
    $('#s-invert').checked = s.invertY; $('#s-lock').checked = s.lockOn;
    $('#s-diff').value = String(s.difficulty); $('#s-gore').value = s.gore; $('#s-shadows').value = s.shadows;
    $('#s-res').value = String(s.resolution);
    $('#s-vol').value = s.volume; $('#s-vol').nextElementSibling.textContent = Math.round(s.volume * 100) + '%';
    $('#s-amb').value = s.ambience; $('#s-amb').nextElementSibling.textContent = Math.round(s.ambience * 100) + '%';
  }
}
