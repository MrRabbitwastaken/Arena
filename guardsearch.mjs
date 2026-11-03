// Grid-search the guard cursor that best stops each attack, to calibrate GUARD_FOR / guard poses.
import './three-shim.mjs';
const { Duel, FIXED_DT } = await import('../src/combat/duel.js');
const { ATTACK_IDS, GUARD_FOR } = await import('../src/combat/attacks.js');

function trial(id, gx, gy, dist) {
  const duel = new Duel(); duel.reset(false);
  duel.enemyAI.update = () => {};
  const A = duel.enemy, D = duel.player;
  A.reset(0, dist / 2, Math.PI); D.reset(0, -dist / 2, 0);
  D.intent.gx = gx; D.intent.gy = gy; D.intent.blockHeld = true;
  let t = 0, blocked = false, maxE = 0;
  while (t < 2.0) {
    if (t > 0.5 && t < 0.52) A.intent.attackPress = id;
    duel.step(FIXED_DT); t += FIXED_DT;
    for (const e of duel.events) {
      if (e.type === 'clash' && (e.kind === 'block' || e.kind === 'parry' || e.kind === 'intercept')) blocked = true;
      if (e.type === 'hit' && e.attacker === A) maxE = Math.max(maxE, e.result.E);
    }
    duel.events.length = 0;
  }
  return { blocked, maxE };
}
const dists = (process.argv[2] || '1.6,1.9').split(',').map(Number);
for (const id of ATTACK_IDS) {
  const scores = [];
  for (let gx = -1; gx <= 1.001; gx += 0.25) for (let gy = -1; gy <= 1.001; gy += 0.25) {
    if (Math.hypot(gx, gy) > 1.06) continue;
    let s = 0; const det = [];
    for (const d of dists) { const r = trial(id, gx, gy, d); s += (r.blocked && r.maxE < 10 ? 2 : r.blocked ? 0.5 : 0) - r.maxE / 100; det.push((r.blocked ? 'B' : '-') + r.maxE.toFixed(0)); }
    scores.push({ gx, gy, s, det: det.join(' ') });
  }
  scores.sort((a, b) => b.s - a.s);
  const cur = GUARD_FOR[id];
  const curS = scores.find((x) => Math.abs(x.gx - cur[0]) < 0.13 && Math.abs(x.gy - cur[1]) < 0.13);
  console.log(id.padEnd(9), 'best:', scores.slice(0, 5).map((x) => `(${x.gx},${x.gy})${x.s.toFixed(2)}[${x.det}]`).join(' '), '| current', curS ? curS.s.toFixed(2) + '[' + curS.det + ']' : '?');
}
