import { clamp, rand } from '../core/math.js';

// Every sound is synthesised from what happened: impact energy picks loudness and
// brightness, the material picks the voice (ringing steel, dull plate, jingling mail, flesh).
export class AudioManager {
  constructor() {
    this.ctx = null; this.vol = { master: 0.8, ambience: 0.5 };
    this.listener = { x: 0, z: 0, rx: 1, rz: 0 };
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4;
    this.master = ctx.createGain(); this.master.gain.value = this.vol.master;
    this.master.connect(this.comp); this.comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.gain.value = this.vol.ambience * 0.5; this.amb.connect(this.master);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    this.startAmbience();
    this.swingVoices = [this.makeSwingVoice(), this.makeSwingVoice()];
  }

  setVolumes(master, ambience) {
    this.vol.master = master; this.vol.ambience = ambience;
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(master, this.ctx.currentTime, 0.05);
    this.amb.gain.setTargetAtTime(ambience * 0.5, this.ctx.currentTime, 0.1);
  }
  suspend(on) { if (this.ctx) on ? this.ctx.suspend() : this.ctx.resume(); }

  setListener(pos, yaw) { this.listener.x = pos.x; this.listener.z = pos.z; this.listener.rx = -Math.cos(yaw); this.listener.rz = Math.sin(yaw); }
  // simple stereo placement and distance falloff
  out(p, gain = 1) {
    const ctx = this.ctx, g = ctx.createGain(), pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    let att = 1, side = 0;
    if (p) {
      const dx = p.x - this.listener.x, dz = p.z - this.listener.z, dist = Math.hypot(dx, dz);
      att = 1 / (1 + Math.max(0, dist - 2) * 0.18);
      side = dist > 0.01 ? clamp((dx * this.listener.rx + dz * this.listener.rz) / dist, -1, 1) * 0.75 : 0;
    }
    g.gain.value = gain * att;
    if (pan) { pan.pan.value = side; g.connect(pan); pan.connect(this.sfx); } else g.connect(this.sfx);
    return g;
  }
  env(param, t0, a, peak, decay) {
    param.setValueAtTime(0.0001, t0);
    param.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    param.exponentialRampToValueAtTime(0.0001, t0 + a + decay);
  }
  noiseBurst(dest, t0, { type = 'bandpass', freq = 2000, q = 1, gain = 0.5, attack = 0.002, decay = 0.1, buf }) {
    const ctx = this.ctx, src = ctx.createBufferSource();
    src.buffer = buf || this.noise; src.playbackRate.value = rand(0.9, 1.1);
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); this.env(g.gain, t0, attack, gain, decay);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t0, Math.random() * 1.5); src.stop(t0 + attack + decay + 0.05);
  }
  // Inharmonic partials of a struck bar: the ring of steel.
  metal(dest, t0, { f0, gain, decay, partials = [1, 2.76, 5.4, 8.93, 13.3], bright = 1 }) {
    const ctx = this.ctx;
    partials.forEach((r, i) => {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.value = f0 * r * rand(0.985, 1.015);
      const g = ctx.createGain();
      const amp = (gain / (1 + i * 0.9)) * (i > 1 ? bright : 1);
      this.env(g.gain, t0, 0.001, amp, decay / (1 + i * 0.45));
      o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + decay + 0.1);
    });
  }

  clash(J, kind, p) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, i = clamp(J / 7, 0.12, 1), d = this.out(p, 0.9);
    const parry = kind === 'parry';
    this.metal(d, t, { f0: (parry ? 780 : 540) * rand(0.92, 1.08), gain: 0.35 * i, decay: parry ? 1.5 : 1.0 + i * 0.6, bright: 0.6 + i * 0.6 });
    this.metal(d, t, { f0: rand(1500, 1900), gain: 0.08 * i, decay: 0.4, partials: [1, 1.48, 2.3] });
    this.noiseBurst(d, t, { type: 'highpass', freq: 2500, gain: 0.5 * i, decay: 0.05 });
    this.noiseBurst(d, t, { type: 'lowpass', freq: 400, gain: 0.35 * i, decay: 0.08 });
  }
  scrape(v, p) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, d = this.out(p, 0.6);
    this.noiseBurst(d, t, { freq: rand(2800, 4200), q: 6, gain: clamp(v / 8, 0.1, 0.5), attack: 0.02, decay: 0.25 });
    this.metal(d, t, { f0: rand(1800, 2400), gain: 0.04, decay: 0.3, partials: [1, 1.5] });
  }
  // Steel striking plate on a body: duller, shorter, with a thump behind it.
  plate(E, p, head) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, i = clamp(E / 80, 0.1, 1), d = this.out(p, 1);
    this.metal(d, t, { f0: (head ? 420 : 300) * rand(0.9, 1.1), gain: 0.32 * i, decay: head ? 0.7 : 0.45, partials: [1, 2.1, 3.6, 5.2], bright: 0.5 + i * 0.5 });
    this.noiseBurst(d, t, { type: 'lowpass', freq: 600, gain: 0.7 * i, decay: 0.12 });
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(head ? 140 : 110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
    this.env(g.gain, t, 0.002, 0.5 * i, 0.16); o.connect(g); g.connect(d); o.start(t); o.stop(t + 0.25);
  }
  mail(E, p) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, d = this.out(p, 0.7), n = 4 + ((E / 15) | 0);
    for (let k = 0; k < Math.min(9, n); k++) this.metal(d, t + k * rand(0.006, 0.014), { f0: rand(2600, 4800), gain: 0.05, decay: 0.08, partials: [1, 1.7] });
    this.noiseBurst(d, t, { type: 'lowpass', freq: 500, gain: clamp(E / 60, 0.2, 0.8), decay: 0.1 });
  }
  flesh(E, p) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, d = this.out(p, 1), i = clamp(E / 60, 0.2, 1);
    this.noiseBurst(d, t, { freq: 900, q: 0.8, gain: 0.6 * i, decay: 0.16 });
    this.noiseBurst(d, t, { type: 'lowpass', freq: 300, gain: 0.8 * i, decay: 0.2 });
  }
  stone(v, p, dropped) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, d = this.out(p, 0.8), i = clamp(v / 8, 0.1, 1);
    this.noiseBurst(d, t, { type: 'lowpass', freq: 1600, gain: 0.5 * i, decay: 0.07 });
    this.metal(d, t, { f0: dropped ? rand(380, 460) : rand(700, 900), gain: 0.15 * i, decay: dropped ? 0.6 : 0.25, partials: [1, 2.76, 5.4] });
  }
  // Voiced exhalation through a helmet: sawtooth through two formants.
  grunt(p, pitch = 1, intensity = 1, long = false) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, d = this.out(p, 0.55 * intensity);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const f0 = 105 * pitch * rand(0.92, 1.08);
    o.frequency.setValueAtTime(f0 * 1.15, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.8, t + (long ? 0.6 : 0.25));
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = rand(550, 750); f1.Q.value = 4;
    const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 1400;
    const g = ctx.createGain(); this.env(g.gain, t, 0.02, 0.6, long ? 0.6 : 0.24);
    o.connect(f1); f1.connect(f2); f2.connect(g); g.connect(d); o.start(t); o.stop(t + 0.9);
    this.noiseBurst(d, t, { freq: 1200, q: 1, gain: 0.12, attack: 0.02, decay: 0.2 });
  }
  breath(p, effort) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, d = this.out(p, 0.25 * effort);
    this.noiseBurst(d, t, { freq: 1100, q: 1.5, gain: 0.3, attack: 0.15, decay: 0.35 });
  }
  footstep(p, heavy) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, d = this.out(p, 0.4 * heavy);
    this.noiseBurst(d, t, { type: 'lowpass', freq: 700, gain: 0.5, decay: 0.06 });
    if (Math.random() < 0.6) this.metal(d, t + 0.01, { f0: rand(1700, 2600), gain: 0.03, decay: 0.12, partials: [1, 1.6] });
  }
  roar(intensity) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(this.amb, t, { freq: 700, q: 0.6, gain: 0.35 * intensity, attack: 0.3, decay: 1.6, buf: this.brown });
  }

  startAmbience() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.brown; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520;
    const g = ctx.createGain(); g.gain.value = 0.25;
    src.connect(f); f.connect(g); g.connect(this.amb); src.start();
    const wind = ctx.createBufferSource(); wind.buffer = this.noise; wind.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 320; wf.Q.value = 0.7;
    const wg = ctx.createGain(); wg.gain.value = 0.05;
    wind.connect(wf); wf.connect(wg); wg.connect(this.amb); wind.start();
  }

  // Air rushing past the blade: band-passed noise that follows tip speed.
  makeSwingVoice() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.5; f.frequency.value = 400;
    const g = ctx.createGain(); g.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    src.connect(f); f.connect(g);
    if (pan) { g.connect(pan); pan.connect(this.sfx); } else g.connect(this.sfx);
    src.start();
    return { f, g, pan };
  }
  updateSwing(i, speed, p) {
    if (!this.ctx) return;
    const v = this.swingVoices[i], t = this.ctx.currentTime;
    const x = clamp((speed - 5) / 18, 0, 1);
    let att = 1, side = 0;
    if (p) {
      const dx = p.x - this.listener.x, dz = p.z - this.listener.z, dist = Math.hypot(dx, dz);
      att = 1 / (1 + Math.max(0, dist - 2) * 0.25);
      side = dist > 0.01 ? clamp((dx * this.listener.rx + dz * this.listener.rz) / dist, -1, 1) * 0.7 : 0;
    }
    v.g.gain.setTargetAtTime(x * x * 0.55 * att, t, 0.02);
    v.f.frequency.setTargetAtTime(250 + speed * 55, t, 0.03);
    if (v.pan) v.pan.pan.setTargetAtTime(side, t, 0.05);
  }
}
