import { THREE } from './core/three.js';
import { clamp, rand } from './core/math.js';
import { Input } from './core/input.js';
import { Duel, FIXED_DT } from './combat/duel.js';
import { attackFromSwipe } from './combat/attacks.js';
import { Arena } from './scene/arena.js';
import { setupLighting } from './scene/lighting.js';
import { CameraRig } from './scene/camera.js';
import { KnightModel } from './characters/knightModel.js';
import { Particles, SwingTrail } from './effects/particles.js';
import { AudioManager } from './audio/audioManager.js';
import { HUD } from './ui/hud.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _n = new THREE.Vector3();

export class Game {
  constructor(canvas, hudRoot, settings, ui) {
    this.canvas = canvas; this.settings = settings; this.ui = ui;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.3;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.05, 400);
    this.lights = setupLighting(r, this.scene);
    this.arena = new Arena(this.scene);
    this.fx = new Particles(this.scene);
    this.audio = new AudioManager();
    this.input = new Input(canvas);
    this.cam = new CameraRig(this.camera);
    this.hud = new HUD(hudRoot);

    this.duel = new Duel();
    this.models = [
      new KnightModel(this.scene, { cloth: 0x1f2c4d, trim: 0xc9a24a, helm: 'armet' }),
      new KnightModel(this.scene, { cloth: 0x5b1a17, trim: 0xd8cbb0, helm: 'bascinet' }),
    ];
    this.trails = [new SwingTrail(this.scene), new SwingTrail(this.scene)];
    this.duel.knights.forEach((k, i) => {
      k.onFootstep = (sp) => this.audio.footstep(k.pos, sp > 2.5 ? 1 : 0.7);
      k.onSwing = (A, power) => { k.stats.swings++; if (power > 1.2 || (A.id === 'overhead' && Math.random() < 0.5)) this.audio.grunt(k.pos, i ? 0.9 : 1.05, 0.6); };
    });

    this.mode = 'menu';
    this.acc = 0; this.last = performance.now();
    this.swipe = new THREE.Vector2(); this.yawOffset = 0; this.preview = null;
    this.breathT = 0; this.dripT = 0; this.armourDirty = true;
    this.input.onLockChange = (locked) => { if (locked) this.input.fallback = false; else if (this.mode === 'playing') this.pause(); };
    this.input.onEscape = () => this.pause();
    addEventListener('resize', () => this.resize());
    this.applySettings();
    this.duel.reset(true);
    this.resize();
    requestAnimationFrame((t) => this.frame(t));
  }

  applySettings() {
    const s = this.settings;
    this.fx.gore = s.gore;
    this.renderer.toneMappingExposure = 1.3 * s.brightness;
    const sh = s.shadows;
    this.renderer.shadowMap.enabled = sh !== 'off';
    const size = sh === 'high' ? 2048 : 1024;
    const sun = this.lights.sun;
    if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
    this.scene.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material)) o.material.needsUpdate = true; });
    this.audio.setVolumes(s.volume, s.ambience);
    this.duel.enemyAI.skill = s.difficulty;
    this.resize();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const pr = Math.min(devicePixelRatio || 1, 2) * this.settings.resolution;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.fx.setScale(h * pr * 0.9);
  }

  // ---------- modes ----------
  startDuel() {
    this.audio.init();
    this.duel.reset(false, this.settings.difficulty);
    this.fx.decals.clear();
    for (const m of this.models) m.refreshArmour(this.duel.player.injury);
    this.armourDirty = true;
    this.cam.snapBehind(this.duel.player);
    this.cam.dist = this.cam.targetDist;
    this.swipe.set(0, 0); this.yawOffset = 0;
    this.mode = 'playing'; this.input.active = true;
    this.input.requestLock();
    this.hud.say('Sir Odo Ravensworth', 'name');
  }
  pause() {
    if (this.mode !== 'playing') return;
    this.mode = 'paused'; this.input.active = false; this.input.exitLock();
    this.duel.player.intent.blockHeld = false; this.duel.player.intent.attackHeld = false;
    this.ui.showPause();
  }
  resume() { this.mode = 'playing'; this.input.active = true; this.acc = 0; this.input.requestLock(); }
  toMenu() { this.mode = 'menu'; this.input.active = false; this.input.exitLock(); this.duel.reset(true); this.fx.decals.clear(); this.armourDirty = true; }

  // ---------- input ----------
  handleInput(inp, dt) {
    const s = this.settings, P = this.duel.player, E = this.duel.enemy, I = P.intent;
    const sens = 0.0022 * s.sensitivity;
    const dx = inp.dx, dy = inp.dy * (s.invertY ? -1 : 1);
    if (inp.pressed.has('KeyF')) { s.lockOn = !s.lockOn; this.ui.saveSettings(); }
    if (inp.pressed.has('KeyH')) { s.hints = !s.hints; this.ui.saveSettings(); this.ui.applyHints(); }
    if (inp.wheel) this.cam.targetDist = clamp(this.cam.targetDist + inp.wheel * 0.35, 2.2, 5.5);

    I.blockHeld = this.input.rmb;
    if (this.input.rmb) {
      // The mouse now places the guard; the view stays put.
      let gx = I.gx + dx * 0.0065 * s.sensitivity, gy = I.gy - dy * 0.0065 * s.sensitivity;
      const m = Math.hypot(gx, gy); if (m > 1) { gx /= m; gy /= m; }
      I.gx = gx; I.gy = gy;
      this.swipe.set(0, 0);
    } else {
      this.swipe.multiplyScalar(Math.exp(-dt * 7));
      this.swipe.x += dx; this.swipe.y += dy;
      if (s.lockOn) this.yawOffset = clamp(this.yawOffset - dx * sens * 0.45, -0.6, 0.6) * Math.exp(-dt * 1.4);
      else this.cam.yaw -= dx * sens;
      this.cam.pitch = clamp(this.cam.pitch + dy * sens * 0.8, -0.3, 0.75);
    }
    this.preview = attackFromSwipe(this.swipe.x, this.swipe.y);
    if (inp.lPressed && !P.defeated) { I.attackPress = this.preview; this.swipe.set(0, 0); }
    I.attackHeld = this.input.lmb;

    const k = this.input.keys;
    const fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const str = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const cy = this.cam.yaw, fx = Math.sin(cy), fz = Math.cos(cy), rx = -Math.cos(cy), rz = Math.sin(cy);
    I.move.set(fx * fwd + rx * str, fz * fwd + rz * str);
    I.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    if (inp.pressed.has('Space')) I.dodge = true;
    if (s.lockOn && !E.defeated) I.faceYaw = Math.atan2(E.pos.x - P.pos.x, E.pos.z - P.pos.z);
    else if (I.move.lengthSq() > 0.01 || P.combat.state !== 'idle') I.faceYaw = this.cam.yaw;
  }

  // ---------- events -> sound, sparks, blood, words ----------
  processEvents() {
    const d = this.duel, P = d.player;
    for (const e of d.events) {
      if (e.type === 'clash') {
        const mine = e.defender === P || e.attacker === P || e.kind === 'clash';
        this.audio.clash(e.J, e.kind, e.p);
        _n.set(rand(-1, 1), 1, rand(-1, 1)).normalize();
        this.fx.sparks(e.p, _n, Math.round(4 + e.J * 3), 2 + e.J * 0.6);
        if (mine) this.cam.addShake(clamp(e.J / 18, 0.05, 0.4));
        if (e.kind === 'parry') {
          this.cam.addKick(0.5);
          this.hud.say(e.defender === P ? 'Parried' : 'Your cut was parried', e.defender === P ? 'good' : 'bad');
        } else if (e.kind === 'block') this.hud.say(e.defender === P ? 'Blocked' : 'He blocked', '');
        else if (e.kind === 'guardbreak') this.hud.say(e.defender === P ? 'Guard broken' : 'His guard breaks', e.defender === P ? 'bad' : 'good');
        else if (e.kind === 'clash') this.hud.say('Blades meet', '');
      } else if (e.type === 'scrape') {
        this.audio.scrape(e.v, e.p);
        _n.set(0, 1, 0); this.fx.sparks(e.p, _n, 3, 1.5);
      } else if (e.type === 'stone') {
        this.audio.stone(e.v, e.p, e.dropped);
        this.fx.dust(e.p, e.dropped ? 6 : 3, 0.3);
        _n.set(0, 1, 0); if (!e.dropped) this.fx.sparks(e.p, _n, 4, 2);
      } else if (e.type === 'hit') {
        const r = e.result, head = r.zoneId === 'head';
        if (r.plate && !r.penetrate) { this.audio.plate(r.E, e.p, head); this.fx.sparks(e.p, e.n, Math.round(3 + r.E / 8), 2.5); }
        else if (!r.penetrate && r.wound === 0) { this.audio.mail(r.E, e.p); this.fx.sparks(e.p, e.n, 2, 1.5); }
        if (r.wound > 0) { this.audio.flesh(r.E, e.p); this.fx.blood(e.p, e.n, Math.round(10 + r.wound * 40)); this.arena.excite = Math.min(1, this.arena.excite + 0.5 + r.wound * 0.3); this.audio.roar(0.4 + r.wound * 0.4); }
        if (r.wound > 0.2 || r.trauma > 6) this.audio.grunt(e.target.pos, e.target === P ? 1.05 : 0.9, Math.min(1, 0.5 + r.trauma / 20 + r.wound), r.wound > 0.6);
        if (e.target === P) {
          this.cam.addShake(clamp(r.E / 120, 0.1, 0.65));
          if (r.key !== 'none') this.hud.say(`${r.outcome} · ${r.label.toLowerCase()}`, 'bad');
        } else if (e.attacker === P) {
          this.hud.say(r.key === 'none' || r.key === 'minor' ? `Glanced off his ${r.label.toLowerCase()}` : `${r.outcome} · ${r.label.toLowerCase()}`, r.key === 'none' || r.key === 'minor' ? '' : 'good');
        }
        this.armourDirty = true;
      } else if (e.type === 'defeat') {
        this.audio.grunt(e.knight.pos, e.knight === P ? 1.05 : 0.9, 1, true);
        this.audio.roar(1); this.arena.excite = 1;
        this.fx.dust(e.knight.pos, 14, 1.0);
        if (!d.demo) this.hud.say(e.knight === P ? e.knight.defeatCause : `He falls · ${e.knight.defeatCause.toLowerCase()}`, e.knight === P ? 'bad' : 'good');
      }
    }
    d.events.length = 0;
    if (P.combat.event) { if (P.combat.event === 'missed parry' && !d.demo) this.hud.say('Parry missed', 'bad'); P.combat.event = ''; }
    d.enemy.combat.event = '';
  }

  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.05, (t - this.last) / 1000); this.last = t;
    const inp = this.input.consume();
    const d = this.duel, P = d.player, E = d.enemy;
    if (this.mode === 'playing') this.handleInput(inp, dt);

    if (this.mode === 'playing' || this.mode === 'menu') {
      this.acc += dt;
      let n = 0;
      while (this.acc >= FIXED_DT && n < 8) { d.step(FIXED_DT); this.acc -= FIXED_DT; n++; }
      if (n === 8) this.acc = 0;
      if (this.mode === 'menu' && d.over && d.endT > 4) { d.reset(true); this.fx.decals.clear(); this.armourDirty = true; }
      if (this.mode === 'playing' && d.over && d.endT > 2.8) {
        this.mode = 'result'; this.input.active = false; this.input.exitLock();
        this.ui.showResult(d);
      }
    }
    this.processEvents();

    // visuals
    d.knights.forEach((k, i) => {
      this.models[i].sync(k);
      this.trails[i].update(k.sword);
      if (this.audio.ctx) this.audio.updateSwing(i, k.sword.free ? 0 : k.sword.tipSpeed, k.sword.tip);
    });
    if (this.armourDirty) { d.knights.forEach((k, i) => this.models[i].refreshArmour(k.injury)); this.armourDirty = false; }
    this.dripT += dt;
    if (this.dripT > 0.12) {
      this.dripT = 0;
      for (const k of d.knights) {
        for (const c of k.body.caps) {
          const zb = this.zoneBleed(k, c.name);
          if (zb > 0.002 && Math.random() < zb * 40) { _v.lerpVectors(c.a, c.b, Math.random()); this.fx.drip(_v); }
        }
      }
    }
    if (this.mode === 'playing') {
      this.breathT -= dt;
      const effort = 1 - P.stamina.value / 100;
      if (effort > 0.6 && this.breathT <= 0) { this.audio.breath(P.pos, effort); this.breathT = 1.4 - effort * 0.6; }
    }
    this.arena.update(dt, this.fx);
    this.fx.update(dt, this.camera.position);
    const menu = this.mode === 'menu';
    this.cam.update(dt, P, E, { menu, lockOn: this.settings.lockOn, yawOffset: this.yawOffset, daze: menu ? 0 : Math.min(1, P.injury.daze) });
    this.audio.setListener(this.camera.position, this.cam.yaw);
    if (this.mode === 'playing' || this.mode === 'paused') this.hud.update(dt, d, { preview: this.preview, lockOn: this.settings.lockOn });
    this.renderer.render(this.scene, this.camera);
  }

  zoneBleed(k, cap) {
    const z = k.injury.zones;
    switch (cap) {
      case 'head': return z.head.bleed; case 'neck': return z.neck.bleed; case 'chest': return z.chest.bleed; case 'abdomen': return z.abdomen.bleed;
      case 'upperArmL': return z.upperArmL.bleed + z.shoulderL.bleed; case 'upperArmR': return z.upperArmR.bleed + z.shoulderR.bleed;
      case 'thighL': return z.thighL.bleed + z.kneeL.bleed; case 'thighR': return z.thighR.bleed + z.kneeR.bleed;
      case 'shinL': return z.lowerLegL.bleed; case 'shinR': return z.lowerLegR.bleed;
      default: return z[cap] ? z[cap].bleed : 0;
    }
  }
}
